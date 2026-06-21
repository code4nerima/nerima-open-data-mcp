import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { SearchResult } from "../types/facility.js";

export function searchRecords<T>(
  records: T[],
  args: { keyword?: string; area?: string; category?: string; limit?: number },
  getKeywordFields: (record: T) => unknown[],
  getAreaField: (record: T) => unknown,
  getCategoryField?: (record: T) => unknown
): SearchResult<T> {
  const limit = normalizeLimit(args.limit);
  const results = records
    .filter((record) => anyFieldIncludes(getKeywordFields(record), args.keyword))
    .filter((record) => includesNormalized(getAreaField(record), args.area))
    .filter((record) => {
      if (!getCategoryField) {
        return true;
      }
      return includesNormalized(getCategoryField(record), args.category);
    })
    .slice(0, limit);

  return {
    count: results.length,
    results
  };
}

export function asToolResponse<T>(result: SearchResult<T>) {
  const text = JSON.stringify(result, null, 2);

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: result
  };
}
