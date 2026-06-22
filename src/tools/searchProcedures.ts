import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { CacheStore } from "../data/cacheStore.js";
import type { SearchResult } from "../types/facility.js";
import type { CachedDataSet, OpenDataCacheManifest, ProcedureInfo } from "../types/openData.js";

const PROCEDURE_DATASET_TITLE = "行政手続情報";

export interface ProcedureSearchArgs {
  keyword?: string;
  department?: string;
  location?: string;
  hasOnlineApplication?: boolean;
  limit?: number;
}

export function isProcedureDataSet(dataset: CachedDataSet): boolean {
  return dataset.title === PROCEDURE_DATASET_TITLE;
}

export function toProcedureInfo(dataset: CachedDataSet, row: Record<string, string>): ProcedureInfo {
  return {
    name: row["手続名称"] ?? "",
    documentName: row["書類正式名称"] ?? "",
    department: row["担当課"] ?? "",
    section: row["担当係"] ?? "",
    location: row["場所"] ?? "",
    purpose: row["用途"] ?? "",
    notes: row["留意事項"] ?? "",
    phone: row["電話番号"] ?? "",
    url: row["URL"] ?? "",
    onlineApplication: row["電子申請"] ?? "",
    sourceUrl: dataset.pageUrl,
    fileUrl: dataset.files[0]?.url ?? ""
  };
}

export function searchProcedures(
  datasets: CachedDataSet[],
  args: ProcedureSearchArgs
): SearchResult<ProcedureInfo> {
  const limit = normalizeLimit(args.limit);
  const results: ProcedureInfo[] = [];

  for (const dataset of datasets.filter(isProcedureDataSet)) {
    for (const file of dataset.files) {
      for (const row of file.rows) {
        const item = toProcedureInfo({ ...dataset, files: [file] }, row);

        if (!includesNormalized(item.department, args.department)) {
          continue;
        }
        if (!includesNormalized(item.location, args.location)) {
          continue;
        }
        if (args.hasOnlineApplication === true && !item.onlineApplication) {
          continue;
        }
        if (args.hasOnlineApplication === false && item.onlineApplication) {
          continue;
        }
        if (
          !anyFieldIncludes(
            [
              item.name,
              item.documentName,
              item.department,
              item.section,
              item.location,
              item.purpose,
              item.notes,
              item.phone,
              item.url,
              item.onlineApplication
            ],
            args.keyword
          )
        ) {
          continue;
        }

        results.push(item);

        if (results.length >= limit) {
          return { count: results.length, results };
        }
      }
    }
  }

  return {
    count: results.length,
    results
  };
}

export async function searchProceduresFromStore(
  cacheStore: CacheStore,
  manifest: OpenDataCacheManifest | null,
  args: ProcedureSearchArgs
): Promise<SearchResult<ProcedureInfo>> {
  const target = manifest?.datasets.find((dataset) => dataset.title === PROCEDURE_DATASET_TITLE);
  if (!target) {
    return { count: 0, results: [] };
  }

  const dataset = await cacheStore.readDataSet(target.path);
  if (!dataset) {
    return { count: 0, results: [] };
  }

  return searchProcedures([dataset], args);
}
