import type { CachedDataSet, OpenDataCacheManifest } from "../types/openData.js";
import { createGcsCacheStore } from "./cacheStores/gcsCacheStore.js";

export interface CacheStore {
  reset(): Promise<void>;
  writeDataSet(fileName: string, dataSet: CachedDataSet): Promise<string>;
  writeManifest(manifest: OpenDataCacheManifest): Promise<void>;
  readManifest(): Promise<OpenDataCacheManifest | null>;
  readAllDataSets(): Promise<CachedDataSet[]>;
}

let store: CacheStore | null = null;

export function getCacheStore(): CacheStore {
  if (store) {
    return store;
  }

  store = createGcsCacheStore();
  return store;
}

export function resetCacheStoreForTests(): void {
  store = null;
}
