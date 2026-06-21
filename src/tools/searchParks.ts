import type { BasicSearchArgs, Park, SearchResult } from "../types/facility.js";
import { searchRecords } from "./searchCommon.js";

export function searchParks(parks: Park[], args: BasicSearchArgs): SearchResult<Park> {
  return searchRecords(
    parks,
    args,
    (park) => [park.name, park.address, park.area, park.facilities, park.notes],
    (park) => park.address
  );
}
