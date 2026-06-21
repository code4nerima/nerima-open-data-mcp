import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { CachedDataSet, OpenDataSearchResultItem } from "../types/openData.js";
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
