import type { AedLocation, Facility, Park, Shelter } from "../types/facility.js";
import type { CachedDataSet } from "../types/openData.js";

function numberOrNull(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rowsFor(datasets: CachedDataSet[], title: string): Record<string, string>[] {
  const dataset = datasets.find((item) => item.title === title);
  return dataset?.files.flatMap((file) => file.rows) ?? [];
}

function address(row: Record<string, string>): string {
  return row["所在地_連結表記"] ?? "";
}

function disasterTypes(row: Record<string, string>): string {
  const types = Object.entries(row)
    .filter(([key, value]) => key.startsWith("災害種別_") && value === "1")
    .map(([key]) => key.replace("災害種別_", ""));

  return types.join("、");
}

export function mapFacilitiesFromCache(datasets: CachedDataSet[]): Facility[] {
  return rowsFor(datasets, "公共施設一覧").map((row) => ({
    name: row["名称"] ?? "",
    category: row["POIコード"] ? `POIコード:${row["POIコード"]}` : "",
    address: address(row),
    latitude: numberOrNull(row["緯度"]),
    longitude: numberOrNull(row["経度"]),
    phone: row["電話番号"] ?? "",
    notes: row["備考"] || row["説明"] || row["利用可能時間特記事項"] || ""
  }));
}

export function mapAedFromCache(datasets: CachedDataSet[]): AedLocation[] {
  return rowsFor(datasets, "AED設置箇所一覧").map((row) => ({
    facilityName: row["名称"] ?? "",
    installationLocation: row["設置位置"] ?? "",
    address: address(row),
    latitude: numberOrNull(row["緯度"]),
    longitude: numberOrNull(row["経度"]),
    availableHours: [row["利用可能曜日"], row["開始時間"], row["終了時間"]]
      .filter(Boolean)
      .join(" "),
    notes: row["備考"] || row["利用可能日時特記事項"] || ""
  }));
}

export function mapSheltersFromCache(datasets: CachedDataSet[]): Shelter[] {
  const evacuationSites = rowsFor(datasets, "指定緊急避難場所一覧").map((row) => ({
    name: row["名称"] ?? "",
    type: "指定緊急避難場所",
    address: address(row),
    latitude: numberOrNull(row["緯度"]),
    longitude: numberOrNull(row["経度"]),
    targetDisasters: disasterTypes(row),
    notes: row["備考"] || row["想定収容人数"] || ""
  }));

  const bases = rowsFor(datasets, "避難拠点").map((row) => ({
    name: row["名称"] ?? row["施設名"] ?? "",
    type: "避難拠点",
    address: address(row) || row["住所"] || row["所在地"] || "",
    latitude: numberOrNull(row["緯度"]),
    longitude: numberOrNull(row["経度"]),
    targetDisasters: "地震等",
    notes: row["備考"] ?? ""
  }));

  return [...evacuationSites, ...bases];
}

export function mapParksFromCache(datasets: CachedDataSet[]): Park[] {
  return rowsFor(datasets, "公園トイレ一覧").map((row) => ({
    name: row["名称"] ?? "",
    address: address(row),
    latitude: numberOrNull(row["緯度"]),
    longitude: numberOrNull(row["経度"]),
    area: "",
    facilities: [
      "公園トイレ",
      row["バリアフリートイレ数"] ? `バリアフリートイレ数:${row["バリアフリートイレ数"]}` : "",
      row["車椅子使用者用トイレ有無"] ? `車椅子使用者用:${row["車椅子使用者用トイレ有無"]}` : "",
      row["乳幼児用設備設置トイレ有無"] ? `乳幼児用設備:${row["乳幼児用設備設置トイレ有無"]}` : "",
      row["オストメイト設置トイレ有無"] ? `オストメイト:${row["オストメイト設置トイレ有無"]}` : ""
    ]
      .filter(Boolean)
      .join("、"),
    notes: row["備考"] || row["利用可能時間特記事項"] || ""
  }));
}
