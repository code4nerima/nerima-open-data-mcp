import path from "node:path";
import { Readable } from "node:stream";
import { decodeCsvBuffer, parseCsvRows, parseCsvRowsFromStream } from "./csv.js";
import { fetchOfficial } from "./fetchOfficial.js";
import { getCacheStore, type CacheStore } from "./cacheStore.js";
import type {
  CachedCsvChunk,
  CachedCsvFile,
  CachedDataSet,
  CatalogRow,
  OpenDataCacheManifest
} from "../types/openData.js";
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
const DEFAULT_CSV_CHUNK_ROW_COUNT = 5000;

function csvChunkRowCount(): number {
  const value = Number(process.env.CSV_CHUNK_ROW_COUNT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_CSV_CHUNK_ROW_COUNT;
}

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
  const response = await fetchOfficial(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  return decodeCsvBuffer(await fetchBuffer(url));
}

async function fetchStream(url: string): Promise<NodeJS.ReadableStream> {
  const response = await fetchOfficial(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`Failed to fetch ${url}: response body is empty`);
  }

  return Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream);
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

async function fetchCsvFile(
  cacheStore: CacheStore,
  datasetId: string,
  fileIndex: number,
  link: { title: string; url: string }
): Promise<CachedCsvFile> {
  const chunkSize = csvChunkRowCount();
  const chunks: CachedCsvChunk[] = [];
  let chunkRows: Record<string, string>[] = [];
  let rowCount = 0;

  console.log(`Import CSV start: dataset=${datasetId} file=${fileIndex + 1} title="${link.title}" url=${link.url}`);

  async function flushChunk(): Promise<void> {
    if (chunkRows.length === 0) {
      return;
    }

    const chunkIndex: number = chunks.length + 1;
    const chunkPath: string = [
      "dataset-files",
      datasetId,
      `${String(fileIndex + 1).padStart(3, "0")}-${slugify(path.basename(new URL(link.url).pathname, ".csv") || link.title)}`,
      `${String(chunkIndex).padStart(5, "0")}.json`
    ].join("/");

    await cacheStore.writeCsvRowChunk(chunkPath, {
      rows: chunkRows,
      rowCount: chunkRows.length
    });
    chunks.push({
      path: chunkPath,
      rowCount: chunkRows.length
    });
    if (chunks.length % 10 === 0) {
      console.log(`Import CSV progress: dataset=${datasetId} file=${fileIndex + 1} chunks=${chunks.length} rows=${rowCount}`);
    }
    chunkRows = [];
  }

  await parseCsvRowsFromStream(await fetchStream(link.url), async (row) => {
    chunkRows.push(row);
    rowCount += 1;

    if (chunkRows.length >= chunkSize) {
      await flushChunk();
    }
  });

  await flushChunk();

  console.log(`Import CSV done: dataset=${datasetId} file=${fileIndex + 1} chunks=${chunks.length} rows=${rowCount}`);

  return {
    title: link.title,
    url: link.url,
    chunks,
    rowCount
  };
}

async function fetchDataSet(
  cacheStore: CacheStore,
  catalogRow: CatalogRow,
  fetchedAt: string
): Promise<CachedDataSet | null> {
  const pageUrl = await resolveDataSetPageUrl(catalogRow);
  const pageHtml = await fetchText(pageUrl);
  const csvLinks = extractCsvLinks(pageHtml, pageUrl);

  if (csvLinks.length === 0) {
    return null;
  }

  const files: CachedCsvFile[] = [];
  for (const [index, link] of csvLinks.entries()) {
    try {
      files.push(await fetchCsvFile(cacheStore, catalogRow.id, index, link));
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
  console.log(`Open data import start: generatedAt=${generatedAt} forceRefresh=${options.forceRefresh === true}`);
  const catalogRows = await fetchCatalogRows();
  console.log(`Open data catalog loaded: rows=${catalogRows.length}`);
  const cacheStore = getCacheStore();
  const previousManifest = options.forceRefresh ? null : await cacheStore.readManifest();
  const previousDataSetsById = new Map(previousManifest?.datasets.map((dataset) => [dataset.id, dataset]) ?? []);

  if (options.forceRefresh || !previousManifest) {
    console.log("Open data cache reset start");
    await cacheStore.reset();
    console.log("Open data cache reset done");
  }

  const manifestDatasets: OpenDataCacheManifest["datasets"] = [];
  let csvFileCount = 0;
  let totalRowCount = 0;
  let importedDatasetCount = 0;
  let reusedDatasetCount = 0;
  let skippedDatasetCount = 0;

  for (const [index, row] of catalogRows.entries()) {
    const ordinal = `${index + 1}/${catalogRows.length}`;
    try {
      const previousDataSet = previousDataSetsById.get(row.id);
      if (previousDataSet && canReuseManifestEntry(row, previousDataSet)) {
        console.log(`Reuse dataset ${ordinal}: ${row.id} "${row.title}" rows=${previousDataSet.rowCount}`);
        manifestDatasets.push({
          ...previousDataSet,
          pageUrl: row.pageUrl
        });
        csvFileCount += previousDataSet.csvFileCount;
        totalRowCount += previousDataSet.rowCount;
        reusedDatasetCount += 1;
        continue;
      }

      console.log(`Import dataset start ${ordinal}: ${row.id} "${row.title}"`);
      const dataSet = await fetchDataSet(cacheStore, row, generatedAt);
      if (!dataSet) {
        skippedDatasetCount += 1;
        console.warn(`Skip dataset ${ordinal}: ${row.id} "${row.title}" no CSV files`);
        continue;
      }

      const fileName = `${row.id}-${slugify(path.basename(row.pageUrl, ".html") || row.title)}.json`;
      const relativePath = await cacheStore.writeDataSet(fileName, dataSet);
      const manifestEntry = manifestEntryFromDataSet(dataSet, relativePath);

      csvFileCount += manifestEntry.csvFileCount;
      totalRowCount += manifestEntry.rowCount;
      importedDatasetCount += 1;

      manifestDatasets.push(manifestEntry);
      console.log(
        `Import dataset done ${ordinal}: ${row.id} "${row.title}" files=${manifestEntry.csvFileCount} rows=${manifestEntry.rowCount}`
      );
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
    console.log("Import RSS news start");
    const newsItems = await fetchRssNewsItems();
    rssNewsCount = newsItems.length;
    await cacheStore.writeNewsItems({
      generatedAt,
      sourceUrl: NERIMA_RSS_NEWS_URL,
      itemCount: newsItems.length,
      items: newsItems
    });
    console.log(`Import RSS news done: items=${rssNewsCount}`);
  } catch (error) {
    console.warn(`Skipping RSS news ${NERIMA_RSS_NEWS_URL}:`, error);
  }

  let garbageCollectionAreaCount = 0;
  try {
    console.log("Import garbage collection start");
    const garbageCollectionAreas = await fetchGarbageCollectionAreas();
    garbageCollectionAreaCount = garbageCollectionAreas.length;
    await cacheStore.writeGarbageCollection({
      generatedAt,
      sourceUrl: NERIMA_GARBAGE_COLLECTION_INDEX_URL,
      itemCount: garbageCollectionAreas.length,
      items: garbageCollectionAreas
    });
    console.log(`Import garbage collection done: items=${garbageCollectionAreaCount}`);
  } catch (error) {
    console.warn(`Skipping garbage collection days ${NERIMA_GARBAGE_COLLECTION_INDEX_URL}:`, error);
  }

  console.log("Open data manifest write start");
  await cacheStore.writeManifest(manifest);
  console.log(
    `Open data import done: datasets=${manifest.datasetCount} imported=${importedDatasetCount} reused=${reusedDatasetCount} skipped=${skippedDatasetCount} csvFiles=${manifest.csvFileCount} rows=${manifest.totalRowCount}`
  );

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
