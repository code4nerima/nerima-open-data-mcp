import path from "node:path";
import { decodeCsvBuffer, parseCsvRows } from "./csv.js";
import { getCacheStore } from "./cacheStore.js";
import type { CachedCsvFile, CachedDataSet, CatalogRow, OpenDataCacheManifest } from "../types/openData.js";

export const NERIMA_OPEN_DATA_BASE_URL =
  "https://www.city.nerima.tokyo.jp/kusei/tokei/opendata/opendatasite/";
export const NERIMA_OPEN_DATA_LIST_URL = new URL(
  "index.files/131202_open_data_list.csv",
  NERIMA_OPEN_DATA_BASE_URL
).toString();

const CSV_LINK_PATTERN = /<a\b[^>]*href=["']([^"']+\.csv(?:\?[^"']*)?)["'][^>]*>(.*?)<\/a>/gis;
const PAGE_LINK_PATTERN = /<a\b[^>]*href=["']([^"']+\.html(?:\?[^"']*)?)["'][^>]*>(.*?)<\/a>/gis;

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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
  return parseCsvRows(csvText)
    .map(toCatalogRow)
    .filter((row) => row.id && row.pageUrl && hasCsvFormat(row.fileFormats))
    .filter((row) => !row.status || row.status === "配信中");
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

export interface ImportOpenDataSummary {
  generatedAt: string;
  sourceCatalogUrl: string;
  datasetCount: number;
  csvFileCount: number;
  totalRowCount: number;
}

export async function importOpenData(): Promise<ImportOpenDataSummary> {
  const generatedAt = new Date().toISOString();
  const catalogRows = await fetchCatalogRows();
  const cacheStore = getCacheStore();

  await cacheStore.reset();

  const manifestDatasets: OpenDataCacheManifest["datasets"] = [];
  let csvFileCount = 0;
  let totalRowCount = 0;

  for (const row of catalogRows) {
    try {
      const dataSet = await fetchDataSet(row, generatedAt);
      if (!dataSet) {
        continue;
      }

      const fileName = `${row.id}-${slugify(path.basename(row.pageUrl, ".html") || row.title)}.json`;
      const relativePath = await cacheStore.writeDataSet(fileName, dataSet);
      const rowCount = dataSet.files.reduce((sum, file) => sum + file.rowCount, 0);

      csvFileCount += dataSet.files.length;
      totalRowCount += rowCount;

      manifestDatasets.push({
        id: dataSet.id,
        title: dataSet.title,
        category: dataSet.category,
        updatedAt: dataSet.updatedAt,
        path: relativePath,
        csvFileCount: dataSet.files.length,
        rowCount
      });
    } catch (error) {
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

  await cacheStore.writeManifest(manifest);

  return {
    generatedAt,
    sourceCatalogUrl: NERIMA_OPEN_DATA_LIST_URL,
    datasetCount: manifest.datasetCount,
    csvFileCount: manifest.csvFileCount,
    totalRowCount: manifest.totalRowCount
  };
}
