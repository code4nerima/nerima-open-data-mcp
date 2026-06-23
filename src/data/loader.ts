import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AedLocation, Facility, Park, Shelter } from "../types/facility.js";
import type {
  CachedDataSet,
  GarbageCollectionCache,
  OpenDataCacheManifest,
  RssNewsCache
} from "../types/openData.js";
import { getCacheStore } from "./cacheStore.js";
import { hydrateCachedDataSet } from "./cacheHydration.js";
import {
  mapAedFromCache,
  mapFacilitiesFromCache,
  mapParksFromCache,
  mapSheltersFromCache
} from "./mappers.js";

export interface OpenDataSets {
  facilities: Facility[];
  aed: AedLocation[];
  shelters: Shelter[];
  parks: Park[];
}

let cache: OpenDataSets | null = null;
let openDataCache: { manifest: OpenDataCacheManifest | null; datasets: CachedDataSet[] } | null = null;
let manifestCache: OpenDataCacheManifest | null | undefined;
let newsCache: RssNewsCache | null | undefined;
let garbageCollectionCache: GarbageCollectionCache | null | undefined;

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(process.cwd(), "data", fileName);
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function loadDataSets(): Promise<OpenDataSets> {
  if (cache) {
    return cache;
  }

  const imported = await loadToolDataSets();
  const importedDataSets = {
    facilities: mapFacilitiesFromCache(imported.datasets),
    aed: mapAedFromCache(imported.datasets),
    shelters: mapSheltersFromCache(imported.datasets),
    parks: mapParksFromCache(imported.datasets)
  };

  cache = {
    facilities:
      importedDataSets.facilities.length > 0
        ? importedDataSets.facilities
        : await readJson<Facility[]>("facilities.json"),
    aed: importedDataSets.aed.length > 0 ? importedDataSets.aed : await readJson<AedLocation[]>("aed.json"),
    shelters:
      importedDataSets.shelters.length > 0
        ? importedDataSets.shelters
        : await readJson<Shelter[]>("shelters.json"),
    parks: importedDataSets.parks.length > 0 ? importedDataSets.parks : await readJson<Park[]>("parks.json")
  };

  return cache;
}

export function clearDataSetCache(): void {
  cache = null;
  openDataCache = null;
  manifestCache = undefined;
  newsCache = undefined;
  garbageCollectionCache = undefined;
}

export async function loadOpenDataManifest(): Promise<OpenDataCacheManifest | null> {
  if (manifestCache !== undefined) {
    return manifestCache;
  }

  manifestCache = await getCacheStore().readManifest();
  return manifestCache;
}

export async function loadOpenDataCache(): Promise<{
  manifest: OpenDataCacheManifest | null;
  datasets: CachedDataSet[];
}> {
  if (openDataCache) {
    return openDataCache;
  }

  const cacheStore = getCacheStore();
  openDataCache = {
    manifest: await cacheStore.readManifest(),
    datasets: await cacheStore.readAllDataSets()
  };

  return openDataCache;
}

export async function loadNewsItems(): Promise<RssNewsCache | null> {
  if (newsCache !== undefined) {
    return newsCache;
  }

  newsCache = await getCacheStore().readNewsItems();
  return newsCache;
}

export async function loadGarbageCollection(): Promise<GarbageCollectionCache | null> {
  if (garbageCollectionCache !== undefined) {
    return garbageCollectionCache;
  }

  garbageCollectionCache = await getCacheStore().readGarbageCollection();
  return garbageCollectionCache;
}

const TOOL_DATASET_TITLES = [
  "公共施設一覧",
  "AED設置箇所一覧",
  "指定緊急避難場所一覧",
  "避難拠点",
  "公園トイレ一覧"
];

async function loadToolDataSets(): Promise<{
  manifest: OpenDataCacheManifest | null;
  datasets: CachedDataSet[];
}> {
  const manifest = await loadOpenDataManifest();
  if (!manifest) {
    return { manifest: null, datasets: [] };
  }

  const cacheStore = getCacheStore();
  const targets = manifest.datasets.filter((dataset) => TOOL_DATASET_TITLES.includes(dataset.title));
  const datasets = (
    await Promise.all(
      targets.map(async (dataset) => {
        const cachedDataSet = await cacheStore.readDataSet(dataset.path);
        return cachedDataSet ? hydrateCachedDataSet(cacheStore, cachedDataSet) : null;
      })
    )
  ).filter((dataset): dataset is CachedDataSet => Boolean(dataset));

  return { manifest, datasets };
}
