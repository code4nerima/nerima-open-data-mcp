import { describe, expect, it } from "vitest";
import { parseGarbageCollectionAreas } from "../data/garbageCollectionImport.js";
import { normalizeText } from "../data/normalize.js";
import { parseRssNewsItems } from "../data/rssNewsImport.js";
import type { Facility } from "../types/facility.js";
import type { GarbageCollectionArea, RssNewsItem } from "../types/openData.js";
import { searchFacilities } from "./searchFacilities.js";
import { searchGarbageCollection } from "./searchGarbageCollection.js";
import { searchNews } from "./searchNews.js";
import { searchProcedures } from "./searchProcedures.js";

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

describe("parseRssNewsItems", () => {
  it("parses Nerima RSS items", () => {
    const items = parseRssNewsItems(`
      <rss><channel><item>
        <title>練馬産業見本市2026出展事業者募集</title>
        <link>https://www.city.nerima.tokyo.jp/example.html</link>
        <description>募集します</description>
        <category>お知らせ</category>
        <category>事業者向け</category>
        <pubDate>Mon, 22 Jun 2026 00:00:00 GMT</pubDate>
        <guid isPermaLink="false">51c019d1</guid>
        <cms:orgShortName>産業経済部　経済課</cms:orgShortName>
      </item></channel></rss>
    `);

    expect(items).toEqual([
      {
        id: "51c019d1",
        title: "練馬産業見本市2026出展事業者募集",
        link: "https://www.city.nerima.tokyo.jp/example.html",
        summary: "募集します",
        publishedAt: "2026-06-22T00:00:00.000Z",
        categories: ["お知らせ", "事業者向け"],
        organization: "産業経済部 経済課",
        source: "nerima-rss-news"
      }
    ]);
  });
});

describe("searchNews", () => {
  const newsItems: RssNewsItem[] = [
    {
      id: "1",
      title: "区報を発行しました",
      link: "https://www.city.nerima.tokyo.jp/kuho.html",
      summary: "",
      publishedAt: "2026-06-20T15:00:00.000Z",
      categories: ["お知らせ"],
      organization: "広聴広報課",
      source: "nerima-rss-news"
    },
    {
      id: "2",
      title: "講座を開催します",
      link: "https://www.city.nerima.tokyo.jp/event.html",
      summary: "",
      publishedAt: "2026-06-18T00:00:00.000Z",
      categories: ["イベント情報", "講座"],
      organization: "文化・生涯学習課",
      source: "nerima-rss-news"
    }
  ];

  it("searches by keyword and category", () => {
    const result = searchNews(newsItems, { keyword: "講座", category: "イベント" });

    expect(result.count).toBe(1);
    expect(result.results[0]?.id).toBe("2");
  });

  it("filters by published date", () => {
    const result = searchNews(newsItems, { from: "2026-06-19" });

    expect(result.count).toBe(1);
    expect(result.results[0]?.id).toBe("1");
  });
});

describe("parseGarbageCollectionAreas", () => {
  it("parses garbage collection table rows", () => {
    const items = parseGarbageCollectionAreas(
      `
      <p class="update">更新日：2026年4月1日</p>
      <table>
        <caption>あ行の地域（令和8年度）</caption>
        <tr><th>町名</th><th>丁目</th><th>可燃ごみ</th><th>不燃ごみ</th><th>容器包装プラスチック・古紙</th><th>びん・缶</th><th>ペットボトル</th><th>令和8年4月～9年3月</th></tr>
        <tr>
          <td>旭丘</td><td>全域</td><td>水曜･土曜</td><td>第1･3 月曜</td><td>火曜</td><td>火曜</td><td>火曜</td>
          <td><a href="a_gyochiiki.files/1_asahigaokaR8.pdf">カレンダー</a></td>
        </tr>
      </table>
      `,
      "https://www.city.nerima.tokyo.jp/kurashi/gomi/wakekata/ichiran/a_gyochiiki.html"
    );

    expect(items).toMatchObject([
      {
        id: "あ行-旭丘-全域",
        kanaGroup: "あ行",
        town: "旭丘",
        district: "全域",
        burnable: "水曜･土曜",
        nonBurnable: "第1･3 月曜",
        plasticAndPaper: "火曜",
        bottlesAndCans: "火曜",
        plasticBottles: "火曜",
        calendarUrl:
          "https://www.city.nerima.tokyo.jp/kurashi/gomi/wakekata/ichiran/a_gyochiiki.files/1_asahigaokaR8.pdf",
        updatedAt: "2026年4月1日"
      }
    ]);
  });
});

describe("searchGarbageCollection", () => {
  const garbageItems: GarbageCollectionArea[] = [
    {
      id: "あ行-旭丘-全域",
      kanaGroup: "あ行",
      town: "旭丘",
      district: "全域",
      burnable: "水曜･土曜",
      nonBurnable: "第1･3 月曜",
      plasticAndPaper: "火曜",
      bottlesAndCans: "火曜",
      plasticBottles: "火曜",
      calendarUrl: "https://example.com/asahigaoka.pdf",
      sourceUrl: "https://example.com/a.html",
      updatedAt: "2026年4月1日"
    },
    {
      id: "ま行・や行-南大泉-2丁目",
      kanaGroup: "ま行・や行",
      town: "南大泉",
      district: "2丁目",
      burnable: "火曜･金曜",
      nonBurnable: "第2･4 土曜",
      plasticAndPaper: "木曜",
      bottlesAndCans: "月曜",
      plasticBottles: "月曜",
      calendarUrl: "https://example.com/minamiooizumi.pdf",
      sourceUrl: "https://example.com/maya.html",
      updatedAt: "2026年4月1日"
    }
  ];

  it("searches by town and waste type", () => {
    const result = searchGarbageCollection(garbageItems, { town: "南大泉", wasteType: "不燃" });

    expect(result.count).toBe(1);
    expect(result.results[0]?.nonBurnable).toBe("第2･4 土曜");
  });

  it("filters by collection day", () => {
    const result = searchGarbageCollection(garbageItems, { day: "水曜" });

    expect(result.count).toBe(1);
    expect(result.results[0]?.town).toBe("旭丘");
  });
});

describe("searchProcedures", () => {
  const datasets = [
    {
      id: "0000000118",
      title: "行政手続情報",
      summary: "",
      keywords: "",
      category: "統計・区政情報",
      pageUrl: "https://www.city.nerima.tokyo.jp/tetuzuki.html",
      updatedAt: "",
      license: "",
      fetchedAt: "",
      files: [
        {
          title: "行政手続情報",
          url: "https://www.city.nerima.tokyo.jp/tetuzuki.csv",
          rowCount: 2,
          rows: [
            {
              "手続名称": "被災証明書交付申請",
              "書類正式名称": "被災証明書交付申請書",
              "担当課": "危機管理課",
              "担当係": "防災調整係",
              "場所": "本庁舎7階",
              "用途": "被害の事実を証明する。",
              "留意事項": "区長が必要と認める書類が必要",
              "電話番号": "(03)5984-1686",
              "URL": "https://www.city.nerima.tokyo.jp/risaisyoumei.html",
              "電子申請": ""
            },
            {
              "手続名称": "区民のひろば申込",
              "書類正式名称": "掲載申込書",
              "担当課": "広聴広報課",
              "担当係": "広報係",
              "場所": "本庁舎7階",
              "用途": "区報掲載を申し込む。",
              "留意事項": "",
              "電話番号": "(03)5984-2690",
              "URL": "https://www.city.nerima.tokyo.jp/hiroba.html",
              "電子申請": "https://www.city.nerima.tokyo.jp/form"
            }
          ]
        }
      ]
    }
  ];

  it("searches procedures by keyword and department", () => {
    const result = searchProcedures(datasets, { keyword: "証明書", department: "危機" });

    expect(result.count).toBe(1);
    expect(result.results[0]).toMatchObject({
      name: "被災証明書交付申請",
      department: "危機管理課",
      sourceUrl: "https://www.city.nerima.tokyo.jp/tetuzuki.html",
      fileUrl: "https://www.city.nerima.tokyo.jp/tetuzuki.csv"
    });
  });

  it("filters procedures by online application availability", () => {
    const result = searchProcedures(datasets, { hasOnlineApplication: true });

    expect(result.count).toBe(1);
    expect(result.results[0]?.name).toBe("区民のひろば申込");
  });
});
