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

export interface OpenDataRowsArgs {
  dataset: string;
  fileTitle?: string;
  fileIndex?: number;
  offset?: number;
  limit?: number;
}

export interface OpenDataRowItem {
  datasetId: string;
  datasetTitle: string;
  category: string;
  sourceUrl: string;
  fileIndex: number;
  fileTitle: string;
  fileUrl: string;
  rowIndex: number;
  row: Record<string, string>;
}

export interface OpenDataRowsResult extends Record<string, unknown> {
  dataset: OpenDataDataSetSummary | null;
  pagination: {
    offset: number;
    limit: number;
    returned: number;
    totalRows: number;
    nextOffset: number | null;
  };
  count: number;
  results: OpenDataRowItem[];
}

const DEFAULT_CHUNK_READ_CONCURRENCY = 4;
const DEFAULT_ROW_LIMIT = 100;
const MAX_ROW_LIMIT = 1000;

function chunkReadConcurrency(): number {
  const value = Number(process.env.SEARCH_CHUNK_READ_CONCURRENCY);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_CHUNK_READ_CONCURRENCY;
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

function normalizeRowsLimit(limit: unknown): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_ROW_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 0), MAX_ROW_LIMIT);
}

function normalizeOffset(offset: unknown): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(Math.trunc(offset), 0);
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

      const chunks = file.chunks ?? [];
      const concurrency = chunkReadConcurrency();
      for (let index = 0; index < chunks.length; index += concurrency) {
        const rowChunks = await Promise.all(
          chunks.slice(index, index + concurrency).map((chunk) => cacheStore.readCsvRowChunk(chunk.path))
        );

        for (const rowChunk of rowChunks) {
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

    if (results.length >= limit) {
      break;
    }
  }

  return {
    count: results.length,
    results
  };
}

function findDataSetTarget(
  manifest: OpenDataCacheManifest,
  query: string
): OpenDataCacheManifest["datasets"][number] | null {
  const exact = manifest.datasets.find((dataset) => dataset.id === query || dataset.title === query || dataset.path === query);
  if (exact) {
    return exact;
  }

  return manifest.datasets.find((dataset) => anyFieldIncludes([dataset.id, dataset.title, dataset.path], query)) ?? null;
}

function addRowsFromBatch(
  results: OpenDataRowItem[],
  dataset: CachedDataSet,
  file: CachedDataSet["files"][number],
  fileIndex: number,
  rows: Record<string, string>[],
  state: { seen: number; offset: number; limit: number }
): void {
  for (const row of rows) {
    const rowIndex = state.seen;
    state.seen += 1;

    if (rowIndex < state.offset) {
      continue;
    }

    if (results.length >= state.limit) {
      continue;
    }

    results.push({
      datasetId: dataset.id,
      datasetTitle: dataset.title,
      category: dataset.category,
      sourceUrl: dataset.pageUrl,
      fileIndex,
      fileTitle: file.title,
      fileUrl: file.url,
      rowIndex,
      row
    });
  }
}

export async function getOpenDataRowsFromStore(
  cacheStore: CacheStore,
  manifest: OpenDataCacheManifest | null,
  args: OpenDataRowsArgs
): Promise<OpenDataRowsResult> {
  const offset = normalizeOffset(args.offset);
  const limit = normalizeRowsLimit(args.limit);
  const empty = {
    dataset: null,
    pagination: { offset, limit, returned: 0, totalRows: 0, nextOffset: null },
    count: 0,
    results: []
  };

  if (!manifest) {
    return empty;
  }

  const target = findDataSetTarget(manifest, args.dataset);
  if (!target) {
    return empty;
  }

  const dataset = await cacheStore.readDataSet(target.path);
  if (!dataset) {
    return {
      ...empty,
      dataset: toDataSetSummary(target),
      pagination: { ...empty.pagination, totalRows: target.rowCount }
    };
  }

  const selectedFiles = dataset.files
    .map((file, index) => ({ file, index }))
    .filter(({ file, index }) => {
      if (typeof args.fileIndex === "number" && args.fileIndex !== index + 1) {
        return false;
      }
      return anyFieldIncludes([file.title, file.url], args.fileTitle);
    });
  const totalRows = selectedFiles.reduce((sum, { file }) => sum + file.rowCount, 0);
  const results: OpenDataRowItem[] = [];
  const state = { seen: 0, offset, limit };

  for (const { file, index } of selectedFiles) {
    if (results.length >= limit) {
      break;
    }

    if (file.rows) {
      addRowsFromBatch(results, dataset, file, index + 1, file.rows, state);
      continue;
    }

    for (const chunk of file.chunks ?? []) {
      if (results.length >= limit) {
        break;
      }
      if (state.seen + chunk.rowCount <= offset) {
        state.seen += chunk.rowCount;
        continue;
      }

      const rowChunk = await cacheStore.readCsvRowChunk(chunk.path);
      if (!rowChunk) {
        state.seen += chunk.rowCount;
        continue;
      }
      addRowsFromBatch(results, dataset, file, index + 1, rowChunk.rows, state);
    }
  }

  const nextOffset = offset + results.length < totalRows ? offset + results.length : null;

  return {
    dataset: toDataSetSummary(target),
    pagination: {
      offset,
      limit,
      returned: results.length,
      totalRows,
      nextOffset
    },
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
