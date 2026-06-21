import { describe, expect, it } from "vitest";
import { normalizeText } from "../data/normalize.js";
import type { Facility } from "../types/facility.js";
import { searchFacilities } from "./searchFacilities.js";

const facilities: Facility[] = [
  {
    name: "練馬区役所",
    category: "庁舎",
    address: "東京都練馬区豊玉北6丁目12番1号",
    latitude: 35.735605,
    longitude: 139.652198,
    phone: "03-3993-1111",
    notes: ""
  },
  {
    name: "光が丘図書館",
    category: "図書館",
    address: "東京都練馬区光が丘4丁目1番5号",
    latitude: null,
    longitude: null,
    phone: "",
    notes: "欠損座標のテスト"
  }
];

describe("normalizeText", () => {
  it("normalizes width, case, and whitespace", () => {
    expect(normalizeText(" Ａ Bｃ ")).toBe("abc");
  });
});

describe("searchFacilities", () => {
  it("searches by partial keyword and area", () => {
    const result = searchFacilities(facilities, { keyword: "図書", area: "光が丘" });

    expect(result.count).toBe(1);
    expect(result.results[0]?.name).toBe("光が丘図書館");
  });

  it("searches by category", () => {
    const result = searchFacilities(facilities, { category: "庁" });

    expect(result.count).toBe(1);
    expect(result.results[0]?.name).toBe("練馬区役所");
  });

  it("returns zero results without throwing", () => {
    const result = searchFacilities(facilities, { keyword: "存在しない施設" });

    expect(result).toEqual({ count: 0, results: [] });
  });

  it("applies limit", () => {
    const result = searchFacilities(facilities, { limit: 1 });

    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
  });
});
