import type { BasicSearchArgs, SearchResult, Shelter } from "../types/facility.js";
import { searchRecords } from "./searchCommon.js";

export function searchShelters(
  shelters: Shelter[],
  args: BasicSearchArgs
): SearchResult<Shelter> {
  return searchRecords(
    shelters,
    args,
    (shelter) => [
      shelter.name,
      shelter.type,
      shelter.address,
      shelter.targetDisasters,
      shelter.notes
    ],
    (shelter) => shelter.address
  );
}
