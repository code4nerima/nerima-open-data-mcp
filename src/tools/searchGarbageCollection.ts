import { anyFieldIncludes, includesNormalized, normalizeLimit } from "../data/normalize.js";
import type { SearchResult } from "../types/facility.js";
import type { GarbageCollectionArea } from "../types/openData.js";

export interface GarbageCollectionSearchArgs {
  keyword?: string;
  town?: string;
  district?: string;
  day?: string;
  wasteType?: string;
  limit?: number;
}

function scheduleFields(item: GarbageCollectionArea): string[] {
  return [
    item.burnable,
    item.nonBurnable,
    item.plasticAndPaper,
    item.bottlesAndCans,
    item.plasticBottles
  ];
}

function wasteTypeFields(item: GarbageCollectionArea, wasteType: string | undefined): string[] {
  if (!wasteType) {
    return scheduleFields(item);
  }

  const targets = [
    ["可燃ごみ", item.burnable],
    ["不燃ごみ", item.nonBurnable],
    ["容器包装プラスチック 古紙 プラスチック 資源", item.plasticAndPaper],
    ["びん 缶", item.bottlesAndCans],
    ["ペットボトル", item.plasticBottles]
  ].filter(([label]) => includesNormalized(label, wasteType));

  return targets.map(([, value]) => value);
}

export function searchGarbageCollection(
  items: GarbageCollectionArea[],
  args: GarbageCollectionSearchArgs
): SearchResult<GarbageCollectionArea> {
  const limit = normalizeLimit(args.limit);
  const results = items
    .filter((item) => includesNormalized(item.town, args.town))
    .filter((item) => includesNormalized(item.district, args.district))
    .filter((item) => {
      const fields = wasteTypeFields(item, args.wasteType);
      return fields.length > 0 && anyFieldIncludes(fields, args.day);
    })
    .filter((item) =>
      anyFieldIncludes(
        [
          item.kanaGroup,
          item.town,
          item.district,
          item.burnable,
          item.nonBurnable,
          item.plasticAndPaper,
          item.bottlesAndCans,
          item.plasticBottles
        ],
        args.keyword
      )
    )
    .slice(0, limit);

  return {
    count: results.length,
    results
  };
}
