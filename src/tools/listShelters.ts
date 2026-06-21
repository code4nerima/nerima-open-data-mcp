import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { SearchResult, Shelter } from "../types/facility.js";

export interface ListSheltersArgs {
  area?: string;
  disasterType?: string;
  sortBy?: "name" | "capacity";
  sortOrder?: "asc" | "desc";
  limit?: number;
}

function compareNullableCapacity(a: Shelter, b: Shelter): number {
  const aCapacity = a.capacity ?? -1;
  const bCapacity = b.capacity ?? -1;
  return aCapacity - bCapacity;
}

export function listShelters(shelters: Shelter[], args: ListSheltersArgs): SearchResult<Shelter> {
  const limit = normalizeLimit(args.limit);
  const sortBy = args.sortBy ?? "capacity";
  const sortOrder = args.sortOrder ?? "desc";

  const results = shelters
    .filter((shelter) => includesNormalized(shelter.address, args.area))
    .filter((shelter) => anyFieldIncludes([shelter.targetDisasters, shelter.type], args.disasterType))
    .sort((a, b) => {
      const comparison =
        sortBy === "name" ? a.name.localeCompare(b.name, "ja") : compareNullableCapacity(a, b);
      return sortOrder === "asc" ? comparison : -comparison;
    })
    .slice(0, limit);

  return {
    count: results.length,
    total: shelters.length,
    results
  };
}
