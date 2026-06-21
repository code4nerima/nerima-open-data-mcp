import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { CacheStore } from "../data/cacheStore.js";
import type { CachedDataSet, OpenDataCacheManifest, OpenDataSearchResultItem } from "../types/openData.js";
import type { SearchResult } from "../types/facility.js";

export interface OpenDataSearchArgs {
  keyword?: string;
  category?: string;
  dataset?: string;
  limit?: number;
}

function rowValues(row: Record<string, string>): string[] {
  return Object.entries(row).flatMap(([key, value]) => [key, value]);
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
      for (const row of file.rows) {
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
          return { count: results.length, results };
        }
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

    const partial = searchOpenData([dataset], {
      ...args,
      limit: limit - results.length
    });
    results.push(...partial.results);

    if (results.length >= limit) {
      break;
    }
  }

  return {
    count: results.length,
    results
  };
}
