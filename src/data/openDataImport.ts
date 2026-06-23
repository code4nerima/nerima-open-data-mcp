import path from "node:path";
import { decodeCsvBuffer, parseCsvRows } from "./csv.js";
import { getCacheStore } from "./cacheStore.js";
import type { CachedCsvFile, CachedDataSet, CatalogRow, OpenDataCacheManifest } from "../types/openData.js";
import { fetchRssNewsItems, NERIMA_RSS_NEWS_URL } from "./rssNewsImport.js";
import {
  fetchGarbageCollectionAreas,
  NERIMA_GARBAGE_COLLECTION_INDEX_URL
} from "./garbageCollectionImport.js";

export const NERIMA_OPEN_DATA_BASE_URL =
  "https://www.city.nerima.tokyo.jp/kusei/tokei/opendata/opendatasite/";
export const NERIMA_OPEN_DATA_LIST_URL = new URL(
  "index.files/131202_open_data_list.csv",
  NERIMA_OPEN_DATA_BASE_URL
).toString();

const CSV_LINK_PATTERN = /<a\b[^>]*href=["']([^"']+\.csv(?:\?[^"']*)?)["'][^>]*>(.*?)<\/a>/gis;
const PAGE_LINK_PATTERN = /<a\b[^>]*href=["']([^"']+\.html(?:\?[^"']*)?)["'][^>]*>(.*?)<\/a>/gis;
const OPEN_DATA_PAGE_PREFIX = new URL(NERIMA_OPEN_DATA_BASE_URL).pathname;

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hasCsvFormat(fileFormats: string): boolean {
  return fileFormats
    .split(",")
    .map((format) => format.trim().toLowerCase())
    .includes("csv");
}

function toCatalogRow(row: Record<string, string>): CatalogRow {
  return {
    id: row["データセット_ID"] ?? "",
    title: row["データセット_タイトル"] ?? "",
    summary: row["データセット_概要"] ?? "",
    keywords: row["データセット_キーワード"] ?? "",
    category: row["データセット_分類"] ?? "",
    pageUrl: (row["データセット_URL"] ?? "").replace(/\s+/g, ""),
    updateFrequency: row["データセット_更新頻度"] ?? "",
    publishedAt: row["データセット_公開日"] ?? "",
    updatedAt: row["データセット_最終更新日"] ?? "",
    fileFormats: row["ファイル形式"] ?? "",
    license: row["ファイル_ライセンス"] ?? "",
    status: row["ファイル_ステータス"] ?? ""
  };
}

function catalogRowFromPage(pageUrl: string, pageHtml: string, fallbackCategory = ""): CatalogRow {
  const metadata = extractMetadata(pageHtml);
  const title = metadata["タイトル"] || extractTitle(pageHtml) || path.basename(pageUrl, ".html");

  return {
    id: `page-${slugify(new URL(pageUrl).pathname)}`,
    title,
    summary: metadata["データの内容"] ?? "",
    keywords: metadata["タグ"] ?? "",
    category: metadata["カテゴリ"] || fallbackCategory,
    pageUrl,
    updateFrequency: metadata["更新頻度"] ?? "",
    publishedAt: metadata["初回公開日"] ?? "",
    updatedAt: metadata["最終更新日"] || extractUpdatedAt(pageHtml),
    fileFormats: "csv",
    license: metadata["利用ルール"] ?? "CC-BY",
    status: "配信中"
  };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "nerima-open-data-mcp/0.1.0 (+https://www.city.nerima.tokyo.jp/)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  return decodeCsvBuffer(await fetchBuffer(url));
}

export function extractCsvLinks(pageHtml: string, pageUrl: string): Array<{ title: string; url: string }> {
  const links = new Map<string, { title: string; url: string }>();

  for (const match of pageHtml.matchAll(CSV_LINK_PATTERN)) {
    const href = match[1];
    const title = stripHtml(match[2] ?? "");
    const url = new URL(href, pageUrl).toString();
    links.set(url, { title, url });
  }

  return [...links.values()];
}

function extractPageLinks(pageHtml: string, pageUrl: string): Array<{ title: string; url: string }> {
  const links = new Map<string, { title: string; url: string }>();

  for (const match of pageHtml.matchAll(PAGE_LINK_PATTERN)) {
    const href = match[1];
    const title = stripHtml(match[2] ?? "");
    const url = new URL(href, pageUrl).toString();
    links.set(url, { title, url });
  }

  return [...links.values()];
}

function extractTitle(pageHtml: string): string {
  const h1 = pageHtml.match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1];
  if (h1) {
    return stripHtml(h1);
  }

  const title = pageHtml.match(/<title[^>]*>(.*?)<\/title>/is)?.[1];
  return title ? stripHtml(title).replace(/：練馬区公式ホームページ$/, "") : "";
}

function extractUpdatedAt(pageHtml: string): string {
  return stripHtml(pageHtml.match(/<p[^>]*class=["']update["'][^>]*>(.*?)<\/p>/is)?.[1] ?? "").replace(
    /^更新日：/,
    ""
  );
}

function extractMetadata(pageHtml: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  const rowPattern = /<tr[^>]*>\s*<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/gis;

  for (const match of pageHtml.matchAll(rowPattern)) {
    const key = stripHtml(match[1] ?? "");
    const value = stripHtml(match[2] ?? "");
    if (key) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function isOpenDataHtmlPage(url: string): boolean {
  const parsed = new URL(url);
  return parsed.hostname === "www.city.nerima.tokyo.jp" && parsed.pathname.startsWith(OPEN_DATA_PAGE_PREFIX);
}

async function discoverCsvPagesFromCategories(): Promise<Map<string, CatalogRow>> {
  const rootHtml = await fetchText(NERIMA_OPEN_DATA_BASE_URL);
  const categoryLinks = extractPageLinks(rootHtml, NERIMA_OPEN_DATA_BASE_URL).filter((link) => {
    const pathname = new URL(link.url).pathname;
    return pathname.startsWith(OPEN_DATA_PAGE_PREFIX) && pathname.endsWith("/index.html");
  });
  const pages = new Map<string, CatalogRow>();

  for (const categoryLink of categoryLinks) {
    try {
      const categoryHtml = await fetchText(categoryLink.url);
      const pageLinks = extractPageLinks(categoryHtml, categoryLink.url).filter((link) => {
        return isOpenDataHtmlPage(link.url) && !link.url.endsWith("/index.html");
      });

      for (const pageLink of pageLinks) {
        if (pages.has(pageLink.url)) {
          continue;
        }

        try {
          const pageHtml = await fetchText(pageLink.url);
          if (extractCsvLinks(pageHtml, pageLink.url).length === 0) {
            continue;
          }
          pages.set(pageLink.url, catalogRowFromPage(pageLink.url, pageHtml, categoryLink.title));
        } catch (error) {
          console.warn(`Skipping discovered page ${pageLink.url}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Skipping category page ${categoryLink.url}:`, error);
    }
  }

  return pages;
}

async function resolveDataSetPageUrl(catalogRow: CatalogRow): Promise<string> {
  try {
    await fetchBuffer(catalogRow.pageUrl);
    return catalogRow.pageUrl;
  } catch (error) {
    const categoryIndexUrl = new URL("index.html", catalogRow.pageUrl).toString();
    const categoryHtml = await fetchText(categoryIndexUrl);
    const normalizedTitle = catalogRow.title.normalize("NFKC");
    const candidate = extractPageLinks(categoryHtml, categoryIndexUrl).find(
      (link) => link.title.normalize("NFKC") === normalizedTitle
    );

    if (!candidate) {
      throw error;
    }

    return candidate.url;
  }
}

export async function fetchCatalogRows(): Promise<CatalogRow[]> {
  const csvText = await fetchText(NERIMA_OPEN_DATA_LIST_URL);
  const listedRows = parseCsvRows(csvText)
    .map(toCatalogRow)
    .filter((row) => row.id && row.pageUrl && hasCsvFormat(row.fileFormats))
    .filter((row) => !row.status || row.status === "配信中");
  const rowsByUrl = new Map(listedRows.map((row) => [row.pageUrl, row]));
  const discoveredRows = await discoverCsvPagesFromCategories();

  for (const [pageUrl, row] of discoveredRows) {
    if (!rowsByUrl.has(pageUrl)) {
      rowsByUrl.set(pageUrl, row);
    }
  }

  return [...rowsByUrl.values()];
}

async function fetchCsvFile(link: { title: string; url: string }): Promise<CachedCsvFile> {
  const csvText = await fetchText(link.url);
  const rows = parseCsvRows(csvText);

  return {
    title: link.title,
    url: link.url,
    rows,
    rowCount: rows.length
  };
}

async function fetchDataSet(catalogRow: CatalogRow, fetchedAt: string): Promise<CachedDataSet | null> {
  const pageUrl = await resolveDataSetPageUrl(catalogRow);
  const pageHtml = await fetchText(pageUrl);
  const csvLinks = extractCsvLinks(pageHtml, pageUrl);

  if (csvLinks.length === 0) {
    return null;
  }

  const files: CachedCsvFile[] = [];
  for (const link of csvLinks) {
    try {
      files.push(await fetchCsvFile(link));
    } catch (error) {
      console.warn(`Skipping CSV ${link.url}:`, error);
    }
  }

  if (files.length === 0) {
    return null;
  }

  return {
    id: catalogRow.id,
    title: catalogRow.title,
    summary: catalogRow.summary,
    keywords: catalogRow.keywords,
    category: catalogRow.category,
    pageUrl,
    updatedAt: catalogRow.updatedAt,
    license: catalogRow.license,
    fetchedAt,
    files
  };
}

type ManifestDataSet = OpenDataCacheManifest["datasets"][number];

function manifestEntryFromDataSet(dataSet: CachedDataSet, relativePath: string): ManifestDataSet {
  const rowCount = dataSet.files.reduce((sum, file) => sum + file.rowCount, 0);

  return {
    id: dataSet.id,
    title: dataSet.title,
    category: dataSet.category,
    updatedAt: dataSet.updatedAt,
    pageUrl: dataSet.pageUrl,
    path: relativePath,
    csvFileCount: dataSet.files.length,
    rowCount
  };
}

export function canReuseManifestEntry(row: CatalogRow, existing: ManifestDataSet): boolean {
  return (
    existing.id === row.id &&
    existing.title === row.title &&
    existing.category === row.category &&
    existing.updatedAt === row.updatedAt &&
    (!existing.pageUrl || existing.pageUrl === row.pageUrl)
  );
}

export interface ImportOpenDataSummary {
  generatedAt: string;
  sourceCatalogUrl: string;
  datasetCount: number;
  csvFileCount: number;
  totalRowCount: number;
  importedDatasetCount: number;
  reusedDatasetCount: number;
  skippedDatasetCount: number;
  rssNewsCount: number;
  garbageCollectionAreaCount: number;
}

export interface ImportOpenDataOptions {
  forceRefresh?: boolean;
}

export async function importOpenData(options: ImportOpenDataOptions = {}): Promise<ImportOpenDataSummary> {
  const generatedAt = new Date().toISOString();
  const catalogRows = await fetchCatalogRows();
  const cacheStore = getCacheStore();
  const previousManifest = options.forceRefresh ? null : await cacheStore.readManifest();
  const previousDataSetsById = new Map(previousManifest?.datasets.map((dataset) => [dataset.id, dataset]) ?? []);

  if (options.forceRefresh || !previousManifest) {
    await cacheStore.reset();
  }

  const manifestDatasets: OpenDataCacheManifest["datasets"] = [];
  let csvFileCount = 0;
  let totalRowCount = 0;
  let importedDatasetCount = 0;
  let reusedDatasetCount = 0;
  let skippedDatasetCount = 0;

  for (const row of catalogRows) {
    try {
      const previousDataSet = previousDataSetsById.get(row.id);
      if (previousDataSet && canReuseManifestEntry(row, previousDataSet)) {
        manifestDatasets.push({
          ...previousDataSet,
          pageUrl: row.pageUrl
        });
        csvFileCount += previousDataSet.csvFileCount;
        totalRowCount += previousDataSet.rowCount;
        reusedDatasetCount += 1;
        continue;
      }

      const dataSet = await fetchDataSet(row, generatedAt);
      if (!dataSet) {
        skippedDatasetCount += 1;
        continue;
      }

      const fileName = `${row.id}-${slugify(path.basename(row.pageUrl, ".html") || row.title)}.json`;
      const relativePath = await cacheStore.writeDataSet(fileName, dataSet);
      const manifestEntry = manifestEntryFromDataSet(dataSet, relativePath);

      csvFileCount += manifestEntry.csvFileCount;
      totalRowCount += manifestEntry.rowCount;
      importedDatasetCount += 1;

      manifestDatasets.push(manifestEntry);
    } catch (error) {
      skippedDatasetCount += 1;
      console.warn(`Skipping dataset ${row.id} ${row.title}:`, error);
    }
  }

  const manifest: OpenDataCacheManifest = {
    generatedAt,
    sourceCatalogUrl: NERIMA_OPEN_DATA_LIST_URL,
    datasetCount: manifestDatasets.length,
    csvFileCount,
    totalRowCount,
    datasets: manifestDatasets
  };

  let rssNewsCount = 0;
  try {
    const newsItems = await fetchRssNewsItems();
    rssNewsCount = newsItems.length;
    await cacheStore.writeNewsItems({
      generatedAt,
      sourceUrl: NERIMA_RSS_NEWS_URL,
      itemCount: newsItems.length,
      items: newsItems
    });
  } catch (error) {
    console.warn(`Skipping RSS news ${NERIMA_RSS_NEWS_URL}:`, error);
  }

  let garbageCollectionAreaCount = 0;
  try {
    const garbageCollectionAreas = await fetchGarbageCollectionAreas();
    garbageCollectionAreaCount = garbageCollectionAreas.length;
    await cacheStore.writeGarbageCollection({
      generatedAt,
      sourceUrl: NERIMA_GARBAGE_COLLECTION_INDEX_URL,
      itemCount: garbageCollectionAreas.length,
      items: garbageCollectionAreas
    });
  } catch (error) {
    console.warn(`Skipping garbage collection days ${NERIMA_GARBAGE_COLLECTION_INDEX_URL}:`, error);
  }

  await cacheStore.writeManifest(manifest);

  return {
    generatedAt,
    sourceCatalogUrl: NERIMA_OPEN_DATA_LIST_URL,
    datasetCount: manifest.datasetCount,
    csvFileCount: manifest.csvFileCount,
    totalRowCount: manifest.totalRowCount,
    importedDatasetCount,
    reusedDatasetCount,
    skippedDatasetCount,
    rssNewsCount,
    garbageCollectionAreaCount
  };
}
