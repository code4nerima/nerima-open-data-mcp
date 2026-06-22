export interface CatalogRow {
  id: string;
  title: string;
  summary: string;
  keywords: string;
  category: string;
  pageUrl: string;
  updateFrequency: string;
  publishedAt: string;
  updatedAt: string;
  fileFormats: string;
  license: string;
  status: string;
}

export interface CachedCsvFile {
  title: string;
  url: string;
  rows: Record<string, string>[];
  rowCount: number;
}

export interface CachedDataSet {
  id: string;
  title: string;
  summary: string;
  keywords: string;
  category: string;
  pageUrl: string;
  updatedAt: string;
  license: string;
  fetchedAt: string;
  files: CachedCsvFile[];
}

export interface OpenDataCacheManifest {
  generatedAt: string;
  sourceCatalogUrl: string;
  datasetCount: number;
  csvFileCount: number;
  totalRowCount: number;
  datasets: Array<{
    id: string;
    title: string;
    category: string;
    updatedAt: string;
    path: string;
    csvFileCount: number;
    rowCount: number;
  }>;
}

export interface OpenDataSearchResultItem {
  datasetId: string;
  datasetTitle: string;
  category: string;
  sourceUrl: string;
  fileTitle: string;
  fileUrl: string;
  row: Record<string, string>;
}

export interface ProcedureInfo {
  name: string;
  documentName: string;
  department: string;
  section: string;
  location: string;
  purpose: string;
  notes: string;
  phone: string;
  url: string;
  onlineApplication: string;
  sourceUrl: string;
  fileUrl: string;
}

export interface ServiceCounterInfo {
  location: string;
  department: string;
  section: string;
  phone: string;
  procedureCount: number;
  procedureExamples: string[];
  sourceUrl: string;
  fileUrl: string;
}

export interface RssNewsItem {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
  categories: string[];
  organization: string;
  source: "nerima-rss-news";
}

export interface RssNewsCache {
  generatedAt: string;
  sourceUrl: string;
  itemCount: number;
  items: RssNewsItem[];
}

export interface GarbageCollectionArea {
  id: string;
  kanaGroup: string;
  town: string;
  district: string;
  burnable: string;
  nonBurnable: string;
  plasticAndPaper: string;
  bottlesAndCans: string;
  plasticBottles: string;
  calendarUrl: string;
  sourceUrl: string;
  updatedAt: string;
}

export interface GarbageCollectionCache {
  generatedAt: string;
  sourceUrl: string;
  itemCount: number;
  items: GarbageCollectionArea[];
}
