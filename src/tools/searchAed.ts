import type { AedLocation, BasicSearchArgs, SearchResult } from "../types/facility.js";
import { searchRecords } from "./searchCommon.js";

export function searchAed(
  locations: AedLocation[],
  args: BasicSearchArgs
): SearchResult<AedLocation> {
  return searchRecords(
    locations,
    args,
    (location) => [
      location.facilityName,
      location.installationLocation,
      location.address,
      location.availableHours,
      location.notes
    ],
    (location) => location.address
  );
}
