import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AedLocation, Facility, Park, Shelter } from "../types/facility.js";
import type { CachedDataSet, OpenDataCacheManifest } from "../types/openData.js";
import { getCacheStore } from "./cacheStore.js";
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

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(process.cwd(), "data", fileName);
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function loadDataSets(): Promise<OpenDataSets> {
  if (cache) {
    return cache;
  }

  const imported = await loadOpenDataCache();
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
