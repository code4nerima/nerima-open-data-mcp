import { Storage, type UploadOptions } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import type { CachedDataSet, OpenDataCacheManifest } from "../../types/openData.js";
import type { CacheStore } from "../cacheStore.js";

const STORAGE_SCOPES = [
  "https://www.googleapis.com/auth/iam",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/devstorage.full_control"
];

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function objectName(prefix: string, relativePath: string): string {
  const normalizedPrefix = normalizePrefix(prefix);
  return normalizedPrefix ? `${normalizedPrefix}/${relativePath}` : relativePath;
}

function createStorage(): Storage {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const credentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;

  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson) as { project_id?: string };
    const authClient = new GoogleAuth({
      credentials,
      projectId: credentials.project_id,
      scopes: STORAGE_SCOPES
    });
    authClient.useJWTAccessWithScope = true;

    return new Storage({
      authClient,
      projectId: credentials.project_id
    });
  }

  if (credentialsBase64) {
    const credentials = JSON.parse(Buffer.from(credentialsBase64, "base64").toString("utf8")) as {
      project_id?: string;
    };
    const authClient = new GoogleAuth({
      credentials,
      projectId: credentials.project_id,
      scopes: STORAGE_SCOPES
    });
    authClient.useJWTAccessWithScope = true;

    return new Storage({
      authClient,
      projectId: credentials.project_id
    });
  }

  return new Storage();
}

async function uploadJson(
  bucketName: string,
  prefix: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const storage = createStorage();
  const file = storage.bucket(bucketName).file(objectName(prefix, relativePath));
  const options: UploadOptions = {
    contentType: "application/json; charset=utf-8",
    resumable: false,
    metadata: {
      cacheControl: "no-cache"
    }
  };

  await file.save(JSON.stringify(value, null, 2), options);
}

export function createGcsCacheStore(): CacheStore {
  const bucketName = process.env.GCS_BUCKET;
  const prefix = process.env.GCS_PREFIX ?? "nerima-open-data/cache";

  function requireBucketName(): string {
    if (!bucketName) {
      throw new Error("GCS_BUCKET is required for open data cache writes.");
    }
    return bucketName;
  }

  return {
    async reset(): Promise<void> {
      const requiredBucketName = requireBucketName();
      const storage = createStorage();
      await storage.bucket(requiredBucketName).deleteFiles({
        prefix: objectName(prefix, "")
      });
    },

    async writeDataSet(fileName: string, dataSet: CachedDataSet): Promise<string> {
      const requiredBucketName = requireBucketName();
      const relativePath = `datasets/${fileName}`;
      await uploadJson(requiredBucketName, prefix, relativePath, dataSet);
      return relativePath;
    },

    async writeManifest(manifest: OpenDataCacheManifest): Promise<void> {
      const requiredBucketName = requireBucketName();
      // Write manifest last so readers only see a complete cache generation.
      await uploadJson(requiredBucketName, prefix, "catalog.json", manifest);
    },

    async readManifest(): Promise<OpenDataCacheManifest | null> {
      if (!bucketName) {
        return null;
      }

      const storage = createStorage();
      const file = storage.bucket(bucketName).file(objectName(prefix, "catalog.json"));

      try {
        const [content] = await file.download();
        return JSON.parse(content.toString("utf8")) as OpenDataCacheManifest;
      } catch (error) {
        if ((error as { code?: number }).code === 404) {
          return null;
        }
        throw error;
      }
    },

    async readAllDataSets(): Promise<CachedDataSet[]> {
      const manifest = await this.readManifest();
      if (!manifest || !bucketName) {
        return [];
      }

      const storage = createStorage();
      const bucket = storage.bucket(bucketName);

      return Promise.all(
        manifest.datasets.map(async (dataset) => {
          const [content] = await bucket.file(objectName(prefix, dataset.path)).download();
          return JSON.parse(content.toString("utf8")) as CachedDataSet;
        })
      );
    }
  };
}
