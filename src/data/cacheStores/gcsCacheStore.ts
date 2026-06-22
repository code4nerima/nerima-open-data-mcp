import { Storage, type UploadOptions } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import type { CachedDataSet, OpenDataCacheManifest } from "../../types/openData.js";
import type { CacheStore } from "../cacheStore.js";

const STORAGE_SCOPES = [
  "https://www.googleapis.com/auth/iam",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/devstorage.full_control"
];
const SIGNED_URL_EXPIRATION_MS = 10 * 60 * 1000;

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

function isRetryableStorageError(error: unknown): boolean {
  const err = error as { code?: string | number; message?: string };
  const message = err.message ?? "";

  return (
    err.code === "ERR_STREAM_PREMATURE_CLOSE" ||
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "EAI_AGAIN" ||
    message.includes("Premature close") ||
    message.includes("oauth2/v4/token")
  );
}

async function getSignedUrl(
  bucketName: string,
  prefix: string,
  relativePath: string,
  action: "read" | "write" | "delete",
  contentType?: string
): Promise<string> {
  const storage = createStorage();
  const file = storage.bucket(bucketName).file(objectName(prefix, relativePath));
  const [url] = await file.getSignedUrl({
    version: "v4",
    action,
    expires: Date.now() + SIGNED_URL_EXPIRATION_MS,
    contentType
  });
  return url;
}

async function uploadJsonWithSignedUrl(
  bucketName: string,
  prefix: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const contentType = "application/json; charset=utf-8";
  const url = await getSignedUrl(bucketName, prefix, relativePath, "write", contentType);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: JSON.stringify(value, null, 2)
  });

  if (!response.ok) {
    throw new Error(
      `Signed GCS upload failed for ${relativePath}: ${response.status} ${response.statusText}`
    );
  }
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

  try {
    await file.save(JSON.stringify(value, null, 2), options);
  } catch (error) {
    if (!isRetryableStorageError(error)) {
      throw error;
    }
    await uploadJsonWithSignedUrl(bucketName, prefix, relativePath, value);
  }
}

async function readJsonWithSignedUrl<T>(
  bucketName: string,
  prefix: string,
  relativePath: string
): Promise<T | null> {
  const url = await getSignedUrl(bucketName, prefix, relativePath, "read");
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Signed GCS download failed for ${relativePath}: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

async function deleteObjectWithSignedUrl(
  bucketName: string,
  prefix: string,
  relativePath: string
): Promise<void> {
  const url = await getSignedUrl(bucketName, prefix, relativePath, "delete");
  const response = await fetch(url, { method: "DELETE" });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw new Error(
      `Signed GCS delete failed for ${relativePath}: ${response.status} ${response.statusText}`
    );
  }
}

async function resetWithSignedUrls(bucketName: string, prefix: string): Promise<void> {
  const manifest = await readJsonWithSignedUrl<OpenDataCacheManifest>(
    bucketName,
    prefix,
    "catalog.json"
  );

  if (manifest) {
    await Promise.all(
      manifest.datasets.map((dataset) => deleteObjectWithSignedUrl(bucketName, prefix, dataset.path))
    );
  }

  await deleteObjectWithSignedUrl(bucketName, prefix, "catalog.json");
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
      try {
        await storage.bucket(requiredBucketName).deleteFiles({
          prefix: objectName(prefix, "")
        });
      } catch (error) {
        if (!isRetryableStorageError(error)) {
          throw error;
        }
        await resetWithSignedUrls(requiredBucketName, prefix);
      }
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
        if (isRetryableStorageError(error)) {
          return readJsonWithSignedUrl<OpenDataCacheManifest>(bucketName, prefix, "catalog.json");
        }
        throw error;
      }
    },

    async readDataSet(relativePath: string): Promise<CachedDataSet | null> {
      if (!bucketName) {
        return null;
      }

      const storage = createStorage();
      const file = storage.bucket(bucketName).file(objectName(prefix, relativePath));

      try {
        const [content] = await file.download();
        return JSON.parse(content.toString("utf8")) as CachedDataSet;
      } catch (error) {
        if ((error as { code?: number }).code === 404) {
          return null;
        }
        if (isRetryableStorageError(error)) {
          return readJsonWithSignedUrl<CachedDataSet>(bucketName, prefix, relativePath);
        }
        throw error;
      }
    },

    async readAllDataSets(): Promise<CachedDataSet[]> {
      const manifest = await this.readManifest();
      if (!manifest || !bucketName) {
        return [];
      }

      return Promise.all(
        manifest.datasets.map(async (dataset) => {
          const cachedDataSet = await this.readDataSet(dataset.path);
          if (!cachedDataSet) {
            throw new Error(`Cached dataset not found: ${dataset.path}`);
          }
          return cachedDataSet;
        })
      );
    }
  };
}
