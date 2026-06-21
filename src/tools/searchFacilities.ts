import type { Facility, FacilitySearchArgs, SearchResult } from "../types/facility.js";
import { searchRecords } from "./searchCommon.js";

export function searchFacilities(
  facilities: Facility[],
  args: FacilitySearchArgs
): SearchResult<Facility> {
  return searchRecords(
    facilities,
    args,
    (facility) => [
      facility.name,
      facility.category,
      facility.address,
      facility.phone,
      facility.notes
    ],
    (facility) => facility.address,
    (facility) => facility.category
  );
}
