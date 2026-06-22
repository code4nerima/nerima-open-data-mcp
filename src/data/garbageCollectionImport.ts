import { decodeCsvBuffer } from "./csv.js";
import type { GarbageCollectionArea } from "../types/openData.js";

export const NERIMA_GARBAGE_COLLECTION_INDEX_URL =
  "https://www.city.nerima.tokyo.jp/kurashi/gomi/wakekata/ichiran/index.html";

const GARBAGE_PAGE_PATH_PREFIX = "/kurashi/gomi/wakekata/ichiran/";

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function idPart(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "nerima-open-data-mcp/0.1.0 (+https://www.city.nerima.tokyo.jp/)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return decodeCsvBuffer(Buffer.from(await response.arrayBuffer()));
}

export function extractGarbageCollectionPageLinks(
  indexHtml: string,
  indexUrl = NERIMA_GARBAGE_COLLECTION_INDEX_URL
): Array<{ title: string; url: string }> {
  const links = new Map<string, { title: string; url: string }>();
  const pattern = /<a\b[^>]*href=["']([^"']+_gyochiiki\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of indexHtml.matchAll(pattern)) {
    const url = new URL(match[1] ?? "", indexUrl).toString();
    const pathname = new URL(url).pathname;
    if (!pathname.startsWith(GARBAGE_PAGE_PATH_PREFIX)) {
      continue;
    }
    links.set(url, { title: decodeHtml(match[2] ?? ""), url });
  }

  return [...links.values()];
}

function extractUpdatedAt(pageHtml: string): string {
  return decodeHtml(pageHtml.match(/<p[^>]*class=["']update["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "").replace(
    /^更新日：/,
    ""
  );
}

function extractKanaGroup(pageHtml: string): string {
  const caption = decodeHtml(pageHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? "");
  return caption.replace(/の地域.*$/u, "");
}

function extractCells(rowHtml: string): string[] {
  const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  return [...rowHtml.matchAll(cellPattern)].map((match) => decodeHtml(match[1] ?? ""));
}

function extractCalendarUrl(rowHtml: string, pageUrl: string): string {
  const href = rowHtml.match(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/i)?.[1];
  return href ? new URL(href, pageUrl).toString() : "";
}

export function parseGarbageCollectionAreas(pageHtml: string, pageUrl: string): GarbageCollectionArea[] {
  const kanaGroup = extractKanaGroup(pageHtml);
  const updatedAt = extractUpdatedAt(pageHtml);
  const rows = [...pageHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const items: GarbageCollectionArea[] = [];

  for (const rowMatch of rows.slice(1)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = extractCells(rowHtml);
    if (cells.length < 8) {
      continue;
    }

    const [town, district, burnable, nonBurnable, plasticAndPaper, bottlesAndCans, plasticBottles] =
      cells;

    items.push({
      id: `${idPart(kanaGroup)}-${idPart(town)}-${idPart(district)}`,
      kanaGroup,
      town,
      district,
      burnable,
      nonBurnable,
      plasticAndPaper,
      bottlesAndCans,
      plasticBottles,
      calendarUrl: extractCalendarUrl(rowHtml, pageUrl),
      sourceUrl: pageUrl,
      updatedAt
    });
  }

  return items;
}

export async function fetchGarbageCollectionAreas(): Promise<GarbageCollectionArea[]> {
  const indexHtml = await fetchHtml(NERIMA_GARBAGE_COLLECTION_INDEX_URL);
  const links = extractGarbageCollectionPageLinks(indexHtml);
  const items: GarbageCollectionArea[] = [];

  for (const link of links) {
    const pageHtml = await fetchHtml(link.url);
    items.push(...parseGarbageCollectionAreas(pageHtml, link.url));
  }

  return items;
}
