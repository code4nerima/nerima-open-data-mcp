import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { CacheStore } from "../data/cacheStore.js";
import { hydrateCachedDataSet } from "../data/cacheHydration.js";
import type { SearchResult } from "../types/facility.js";
import type {
  CachedDataSet,
  OpenDataCacheManifest,
  ProcedureInfo,
  ServiceCounterInfo
} from "../types/openData.js";
import { isProcedureDataSet, toProcedureInfo } from "./searchProcedures.js";

export interface ServiceCounterSearchArgs {
  keyword?: string;
  location?: string;
  department?: string;
  limit?: number;
}

function counterKey(item: ProcedureInfo): string {
  return [item.location, item.department, item.section, item.phone].join("\u001f");
}

function addProcedureExample(counter: ServiceCounterInfo, procedureName: string): void {
  if (!procedureName || counter.procedureExamples.includes(procedureName)) {
    return;
  }

  if (counter.procedureExamples.length < 5) {
    counter.procedureExamples.push(procedureName);
  }
}

function buildServiceCounters(datasets: CachedDataSet[]): ServiceCounterInfo[] {
  const counters = new Map<string, ServiceCounterInfo>();

  for (const dataset of datasets.filter(isProcedureDataSet)) {
    for (const file of dataset.files) {
      for (const row of file.rows ?? []) {
        const procedure = toProcedureInfo({ ...dataset, files: [file] }, row);
        const key = counterKey(procedure);
        const counter =
          counters.get(key) ??
          {
            location: procedure.location,
            department: procedure.department,
            section: procedure.section,
            phone: procedure.phone,
            procedureCount: 0,
            procedureExamples: [],
            sourceUrl: procedure.sourceUrl,
            fileUrl: procedure.fileUrl
          };

        counter.procedureCount += 1;
        addProcedureExample(counter, procedure.name);
        counters.set(key, counter);
      }
    }
  }

  return [...counters.values()];
}

export function searchServiceCounters(
  datasets: CachedDataSet[],
  args: ServiceCounterSearchArgs
): SearchResult<ServiceCounterInfo> {
  const limit = normalizeLimit(args.limit);
  const results = buildServiceCounters(datasets)
    .filter((counter) => includesNormalized(counter.location, args.location))
    .filter((counter) => includesNormalized(counter.department, args.department))
    .filter((counter) =>
      anyFieldIncludes(
        [
          counter.location,
          counter.department,
          counter.section,
          counter.phone,
          ...counter.procedureExamples
        ],
        args.keyword
      )
    )
    .sort((a, b) => b.procedureCount - a.procedureCount)
    .slice(0, limit);

  return {
    count: results.length,
    results
  };
}

export async function searchServiceCountersFromStore(
  cacheStore: CacheStore,
  manifest: OpenDataCacheManifest | null,
  args: ServiceCounterSearchArgs
): Promise<SearchResult<ServiceCounterInfo>> {
  const target = manifest?.datasets.find((dataset) => dataset.title === "行政手続情報");
  if (!target) {
    return { count: 0, results: [] };
  }

  const dataset = await cacheStore.readDataSet(target.path);
  if (!dataset) {
    return { count: 0, results: [] };
  }

  return searchServiceCounters([await hydrateCachedDataSet(cacheStore, dataset)], args);
}
