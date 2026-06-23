import type { CacheStore } from "./cacheStore.js";
import type { CachedCsvFile, CachedDataSet } from "../types/openData.js";

export async function rowsForCachedFile(
  cacheStore: CacheStore,
  file: CachedCsvFile
): Promise<Record<string, string>[]> {
  if (file.rows) {
    return file.rows;
  }

  const rows: Record<string, string>[] = [];
  for (const chunk of file.chunks ?? []) {
    const rowChunk = await cacheStore.readCsvRowChunk(chunk.path);
    if (rowChunk) {
      rows.push(...rowChunk.rows);
    }
  }
  return rows;
}

export async function hydrateCachedDataSet(
  cacheStore: CacheStore,
  dataset: CachedDataSet
): Promise<CachedDataSet> {
  const files = [];

  for (const file of dataset.files) {
    files.push({
      ...file,
      rows: await rowsForCachedFile(cacheStore, file)
    });
  }

  return {
    ...dataset,
    files
  };
}
