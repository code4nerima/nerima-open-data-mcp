import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { CacheStore } from "../data/cacheStore.js";
import type {
  CachedDataSet,
  OpenDataCacheManifest,
  OpenDataDataSetSummary,
  OpenDataSearchResultItem
} from "../types/openData.js";
import type { SearchResult } from "../types/facility.js";

export interface OpenDataSearchArgs {
  keyword?: string;
  category?: string;
  dataset?: string;
  limit?: number;
}

export interface OpenDataDataSetSearchArgs {
  keyword?: string;
  category?: string;
  sortBy?: "title" | "rowCount" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
}

function toDataSetSummary(dataset: OpenDataCacheManifest["datasets"][number]): OpenDataDataSetSummary {
  return {
    id: dataset.id,
    title: dataset.title,
    category: dataset.category,
    updatedAt: dataset.updatedAt,
    path: dataset.path,
    csvFileCount: dataset.csvFileCount,
    rowCount: dataset.rowCount
  };
}

function rowValues(row: Record<string, string>): string[] {
  return Object.entries(row).flatMap(([key, value]) => [key, value]);
}

function pushMatchingRows(
  results: OpenDataSearchResultItem[],
  dataset: CachedDataSet,
  file: CachedDataSet["files"][number],
  rows: Record<string, string>[],
  args: OpenDataSearchArgs,
  limit: number
): boolean {
  for (const row of rows) {
    if (!anyFieldIncludes(rowValues(row), args.keyword)) {
      continue;
    }

    results.push({
      datasetId: dataset.id,
      datasetTitle: dataset.title,
      category: dataset.category,
      sourceUrl: dataset.pageUrl,
      fileTitle: file.title,
      fileUrl: file.url,
      row
    });

    if (results.length >= limit) {
      return true;
    }
  }

  return false;
}

export function searchOpenData(
  datasets: CachedDataSet[],
  args: OpenDataSearchArgs
): SearchResult<OpenDataSearchResultItem> {
  const limit = normalizeLimit(args.limit);
  const results: OpenDataSearchResultItem[] = [];

  for (const dataset of datasets) {
    if (!includesNormalized(dataset.category, args.category)) {
      continue;
    }

    if (!anyFieldIncludes([dataset.title, dataset.summary, dataset.keywords], args.dataset)) {
      continue;
    }

    for (const file of dataset.files) {
      const reachedLimit = pushMatchingRows(results, dataset, file, file.rows ?? [], args, limit);
      if (reachedLimit) {
        return { count: results.length, results };
      }
    }
  }

  return {
    count: results.length,
    results
  };
}

function sortSearchTargets(
  datasets: OpenDataCacheManifest["datasets"],
  args: OpenDataSearchArgs
): OpenDataCacheManifest["datasets"] {
  return [...datasets]
    .filter((dataset) => includesNormalized(dataset.category, args.category))
    .filter((dataset) => anyFieldIncludes([dataset.title], args.dataset))
    .sort((a, b) => {
      const aTitleMatch = anyFieldIncludes([a.title], args.keyword) ? 0 : 1;
      const bTitleMatch = anyFieldIncludes([b.title], args.keyword) ? 0 : 1;
      if (aTitleMatch !== bTitleMatch) {
        return aTitleMatch - bTitleMatch;
      }
      return a.rowCount - b.rowCount;
    });
}

export async function searchOpenDataFromStore(
  cacheStore: CacheStore,
  manifest: OpenDataCacheManifest | null,
  args: OpenDataSearchArgs
): Promise<SearchResult<OpenDataSearchResultItem>> {
  if (!manifest) {
    return { count: 0, results: [] };
  }

  const limit = normalizeLimit(args.limit);
  const results: OpenDataSearchResultItem[] = [];
  const targets = sortSearchTargets(manifest.datasets, args);

  for (const target of targets) {
    const dataset = await cacheStore.readDataSet(target.path);
    if (!dataset) {
      continue;
    }

    if (!anyFieldIncludes([dataset.title, dataset.summary, dataset.keywords], args.dataset)) {
      continue;
    }

    for (const file of dataset.files) {
      if (file.rows) {
        if (pushMatchingRows(results, dataset, file, file.rows, args, limit)) {
          break;
        }
        continue;
      }

      for (const chunk of file.chunks ?? []) {
        const rowChunk = await cacheStore.readCsvRowChunk(chunk.path);
        if (!rowChunk) {
          continue;
        }
        if (pushMatchingRows(results, dataset, file, rowChunk.rows, args, limit)) {
          break;
        }
      }

      if (results.length >= limit) {
        break;
      }
    }

    if (results.length >= limit) {
      break;
    }
  }

  return {
    count: results.length,
    results
  };
}

export function searchOpenDataDataSets(
  manifest: OpenDataCacheManifest | null,
  args: OpenDataDataSetSearchArgs
): SearchResult<OpenDataDataSetSummary> {
  if (!manifest) {
    return { count: 0, results: [] };
  }

  const limit = normalizeLimit(args.limit);
  const sortBy = args.sortBy ?? "title";
  const sortOrder = args.sortOrder ?? "asc";
  const direction = sortOrder === "desc" ? -1 : 1;
  const results = manifest.datasets
    .map(toDataSetSummary)
    .filter((dataset) => includesNormalized(dataset.category, args.category))
    .filter((dataset) =>
      anyFieldIncludes(
        [
          dataset.id,
          dataset.title,
          dataset.category,
          dataset.updatedAt,
          dataset.path,
          dataset.csvFileCount,
          dataset.rowCount
        ],
        args.keyword
      )
    )
    .sort((a, b) => {
      if (sortBy === "rowCount") {
        return (a.rowCount - b.rowCount) * direction;
      }
      return String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? ""), "ja") * direction;
    })
    .slice(0, limit);

  return {
    count: results.length,
    results
  };
}

export function listOpenDataDataSets(
  manifest: OpenDataCacheManifest | null,
  args: Omit<OpenDataDataSetSearchArgs, "keyword">
): SearchResult<OpenDataDataSetSummary> {
  return searchOpenDataDataSets(manifest, args);
}
