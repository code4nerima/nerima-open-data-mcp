import type { AedLocation, Facility, Park, Shelter } from "../types/facility.js";
import type { OpenDataCacheManifest } from "../types/openData.js";

export interface DatasetStats {
  [key: string]: unknown;
  cache: {
    generatedAt: string | null;
    datasetCount: number;
    csvFileCount: number;
    totalRowCount: number;
  };
  facilities: {
    total: number;
  };
  aed: {
    total: number;
  };
  shelters: {
    total: number;
    withCapacity: number;
    maxCapacity: number | null;
    topByCapacity: Shelter[];
  };
  parks: {
    total: number;
  };
}

export function getDatasetStats(
  datasets: {
    facilities: Facility[];
    aed: AedLocation[];
    shelters: Shelter[];
    parks: Park[];
  },
  manifest: OpenDataCacheManifest | null
): DatasetStats {
  const sheltersWithCapacity = datasets.shelters.filter((shelter) => shelter.capacity !== null);
  const topByCapacity = [...sheltersWithCapacity]
    .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
    .slice(0, 10);

  return {
    cache: {
      generatedAt: manifest?.generatedAt ?? null,
      datasetCount: manifest?.datasetCount ?? 0,
      csvFileCount: manifest?.csvFileCount ?? 0,
      totalRowCount: manifest?.totalRowCount ?? 0
    },
    facilities: {
      total: datasets.facilities.length
    },
    aed: {
      total: datasets.aed.length
    },
    shelters: {
      total: datasets.shelters.length,
      withCapacity: sheltersWithCapacity.length,
      maxCapacity: topByCapacity[0]?.capacity ?? null,
      topByCapacity
    },
    parks: {
      total: datasets.parks.length
    }
  };
}
