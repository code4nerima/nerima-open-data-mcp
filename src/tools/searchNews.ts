import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { SearchResult } from "../types/facility.js";
import type { RssNewsItem } from "../types/openData.js";

export interface NewsSearchArgs {
  keyword?: string;
  category?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function parseBoundary(value: string | undefined, endOfDay: boolean): number | null {
  if (!value) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isInDateRange(item: RssNewsItem, args: NewsSearchArgs): boolean {
  const publishedAt = Date.parse(item.publishedAt);
  if (Number.isNaN(publishedAt)) {
    return true;
  }

  const from = parseBoundary(args.from, false);
  const to = parseBoundary(args.to, true);

  return (from === null || publishedAt >= from) && (to === null || publishedAt <= to);
}

export function searchNews(
  items: RssNewsItem[],
  args: NewsSearchArgs
): SearchResult<RssNewsItem> {
  const limit = normalizeLimit(args.limit);
  const results = items
    .filter((item) => includesNormalized(item.categories.join(" "), args.category))
    .filter((item) => isInDateRange(item, args))
    .filter((item) =>
      anyFieldIncludes(
        [item.title, item.summary, item.link, item.organization, ...item.categories],
        args.keyword
      )
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);

  return {
    count: results.length,
    results
  };
}

export function listRecentNews(
  items: RssNewsItem[],
  args: Omit<NewsSearchArgs, "keyword">
): SearchResult<RssNewsItem> {
  return searchNews(items, args);
}
