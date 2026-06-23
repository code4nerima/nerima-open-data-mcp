import { decodeCsvBuffer } from "./csv.js";
import { fetchOfficial } from "./fetchOfficial.js";
import type { RssNewsItem } from "../types/openData.js";

export const NERIMA_RSS_NEWS_URL = "https://www.city.nerima.tokyo.jp/rss_news.xml";

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return decodeXml(xml.match(pattern)?.[1] ?? "");
}

function allTags(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => decodeXml(match[1] ?? "")).filter(Boolean);
}

function normalizePublishedAt(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

function itemId(itemXml: string, link: string): string {
  const guid = firstTag(itemXml, "guid");
  return guid || link;
}

export function parseRssNewsItems(xml: string): RssNewsItem[] {
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  return [...xml.matchAll(itemPattern)].map((match) => {
    const itemXml = match[1] ?? "";
    const link = firstTag(itemXml, "link");

    return {
      id: itemId(itemXml, link),
      title: firstTag(itemXml, "title"),
      link,
      summary: firstTag(itemXml, "description"),
      publishedAt: normalizePublishedAt(firstTag(itemXml, "pubDate")),
      categories: allTags(itemXml, "category"),
      organization: firstTag(itemXml, "cms:orgShortName"),
      source: "nerima-rss-news"
    };
  });
}

export async function fetchRssNewsItems(): Promise<RssNewsItem[]> {
  const response = await fetchOfficial(NERIMA_RSS_NEWS_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${NERIMA_RSS_NEWS_URL}: ${response.status} ${response.statusText}`);
  }

  const xml = decodeCsvBuffer(Buffer.from(await response.arrayBuffer()));
  return parseRssNewsItems(xml);
}
