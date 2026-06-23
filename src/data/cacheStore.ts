import type {
  CachedCsvRowChunk,
  CachedDataSet,
  GarbageCollectionCache,
  OpenDataCacheManifest,
  RssNewsCache
} from "../types/openData.js";
import { createGcsCacheStore } from "./cacheStores/gcsCacheStore.js";

export interface CacheStore {
  reset(): Promise<void>;
  writeDataSet(fileName: string, dataSet: CachedDataSet): Promise<string>;
  writeCsvRowChunk(relativePath: string, chunk: CachedCsvRowChunk): Promise<string>;
  writeManifest(manifest: OpenDataCacheManifest): Promise<void>;
  writeNewsItems(newsCache: RssNewsCache): Promise<void>;
  writeGarbageCollection(garbageCache: GarbageCollectionCache): Promise<void>;
  readManifest(): Promise<OpenDataCacheManifest | null>;
  readDataSet(relativePath: string): Promise<CachedDataSet | null>;
  readCsvRowChunk(relativePath: string): Promise<CachedCsvRowChunk | null>;
  readAllDataSets(): Promise<CachedDataSet[]>;
  readNewsItems(): Promise<RssNewsCache | null>;
  readGarbageCollection(): Promise<GarbageCollectionCache | null>;
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
