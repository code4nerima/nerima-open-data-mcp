import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getCacheStore } from "./data/cacheStore.js";
import {
  clearDataSetCache,
  loadDataSets,
  loadGarbageCollection,
  loadNewsItems,
  loadOpenDataManifest
} from "./data/loader.js";
import { importOpenData } from "./data/openDataImport.js";
import { searchAed } from "./tools/searchAed.js";
import { asJsonToolResponse, asToolResponse } from "./tools/searchCommon.js";
import { searchFacilities } from "./tools/searchFacilities.js";
import {
  listOpenDataDataSets,
  searchOpenDataDataSets,
  searchOpenDataFromStore
} from "./tools/searchOpenData.js";
import { searchParks } from "./tools/searchParks.js";
import { searchShelters } from "./tools/searchShelters.js";
import { listShelters } from "./tools/listShelters.js";
import { getDatasetStats } from "./tools/getDatasetStats.js";
import { listRecentNews, searchNews } from "./tools/searchNews.js";
import { searchGarbageCollection } from "./tools/searchGarbageCollection.js";
import { searchProceduresFromStore } from "./tools/searchProcedures.js";
import { searchServiceCountersFromStore } from "./tools/searchServiceCounters.js";

const optionalLimit = z
  .number()
  .int()
  .min(0)
  .max(50)
  .optional()
  .describe("返す件数の上限。省略時は10件、最大50件。");

const facilitySearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("施設名、所在地、電話番号、備考などの部分一致。例: 図書館、地域集会所、区民館、体育館。"),
  category: z
    .string()
    .optional()
    .describe("施設分類の部分一致。例: 図書館、区民館、地域集会所、スポーツ施設、庁舎。"),
  area: z.string().optional().describe("住所・地域名の部分一致。例: 光が丘、石神井、練馬、豊玉北。"),
  limit: optionalLimit
};

const basicSearchSchema = {
  keyword: z.string().optional().describe("名称、住所、種別、備考などの部分一致。"),
  area: z.string().optional().describe("住所・地域名の部分一致。例: 光が丘、石神井、練馬、豊玉。"),
  limit: optionalLimit
};

const openDataSearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("全CSV行の項目名・値を横断検索する語句。例: 住民基本台帳、人口、保育園、防災、文化財。"),
  category: z
    .string()
    .optional()
    .describe("オープンデータ分類の部分一致。例: 統計・区政情報、防災・安全安心、子育て・教育。"),
  dataset: z
    .string()
    .optional()
    .describe(
      "データセット名・概要・キーワードの部分一致。例: 行政手続情報、公共施設一覧、AED設置箇所一覧、指定緊急避難場所一覧、避難拠点、公園トイレ一覧。"
    ),
  limit: optionalLimit
};

const openDataDataSetSearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("データセットID、タイトル、分類、更新日、保存パス、行数などの部分一致。例: 人口、文化財、行政手続、防災、子育て。"),
  category: z
    .string()
    .optional()
    .describe("オープンデータ分類の部分一致。例: 統計・区政情報、防災・安全安心、子育て・教育。"),
  sortBy: z
    .enum(["title", "rowCount", "updatedAt"])
    .optional()
    .describe("並び替え項目。titleはタイトル順、rowCountは行数順、updatedAtは更新日順。"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("並び順。ascは昇順、descは降順。省略時はasc。"),
  limit: optionalLimit
};

const openDataDataSetListSchema = {
  category: z
    .string()
    .optional()
    .describe("オープンデータ分類の部分一致。例: 統計・区政情報、防災・安全安心、子育て・教育。"),
  sortBy: z
    .enum(["title", "rowCount", "updatedAt"])
    .optional()
    .describe("並び替え項目。titleはタイトル順、rowCountは行数順、updatedAtは更新日順。"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("並び順。ascは昇順、descは降順。省略時はasc。"),
  limit: optionalLimit
};

const newsSearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("新着情報のタイトル、本文概要、担当組織、カテゴリの部分一致。例: 区報、報道発表、募集、イベント。"),
  category: z.string().optional().describe("RSSカテゴリの部分一致。例: お知らせ、イベント情報、子育て、事業者向け。"),
  from: z.string().optional().describe("公開日の開始日。例: 2026-06-01。"),
  to: z.string().optional().describe("公開日の終了日。例: 2026-06-30。"),
  limit: optionalLimit
};

const recentNewsSchema = {
  category: z.string().optional().describe("RSSカテゴリの部分一致。例: お知らせ、イベント情報、子育て、事業者向け。"),
  from: z.string().optional().describe("公開日の開始日。例: 2026-06-01。"),
  to: z.string().optional().describe("公開日の終了日。例: 2026-06-30。"),
  limit: optionalLimit
};

const garbageCollectionSearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("町名、丁目、ごみ種別、収集曜日を横断検索する語句。例: 南大泉、不燃、古紙、水曜。"),
  town: z.string().optional().describe("町名の部分一致。例: 旭丘、南大泉、光が丘、石神井町。"),
  district: z.string().optional().describe("丁目・地域条件の部分一致。例: 1丁目、2・3丁目、全域、上記以外。"),
  day: z.string().optional().describe("収集曜日や週条件の部分一致。例: 月曜、水曜、第1･3、第2･4。"),
  wasteType: z
    .string()
    .optional()
    .describe("ごみ・資源種別の部分一致。例: 可燃ごみ、不燃ごみ、容器包装プラスチック、古紙、びん、缶、ペットボトル。"),
  limit: optionalLimit
};

const procedureSearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("手続名称、書類正式名称、用途、留意事項、URL、電子申請URLなどの部分一致。例: 証明書、申請、届出、相談、区報。"),
  department: z.string().optional().describe("担当課の部分一致。例: 広聴広報課、危機管理課、戸籍住民課。"),
  location: z.string().optional().describe("窓口・場所の部分一致。例: 本庁舎7階、東庁舎、石神井庁舎。"),
  hasOnlineApplication: z
    .boolean()
    .optional()
    .describe("trueなら電子申請URLがある手続だけ、falseなら電子申請URLがない手続だけ返す。"),
  limit: optionalLimit
};

const serviceCounterSearchSchema = {
  keyword: z
    .string()
    .optional()
    .describe("窓口、担当課、担当係、電話番号、扱う手続き名の部分一致。例: 証明書、相談、区報、危機管理。"),
  location: z.string().optional().describe("窓口・場所の部分一致。例: 本庁舎7階、東庁舎、石神井庁舎。"),
  department: z.string().optional().describe("担当課の部分一致。例: 広聴広報課、危機管理課、戸籍住民課。"),
  limit: optionalLimit
};

const listSheltersSchema = {
  area: z.string().optional().describe("住所・地域名の部分一致。例: 光が丘、石神井、練馬、豊玉。"),
  disasterType: z.string().optional().describe("対応災害種別の部分一致。例: 地震、火災、洪水、土砂災害。"),
  sortBy: z.enum(["name", "capacity"]).optional().describe("並び替え項目。capacityなら収容人数順、nameなら名称順。"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("並び順。ascは昇順、descは降順。省略時はdesc。"),
  limit: optionalLimit
};

async function runLoggedTool<T>(name: string, args: unknown, handler: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  console.log(`MCP tool ${name} started`, JSON.stringify(args));

  try {
    const result = await handler();
    console.log(`MCP tool ${name} completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    console.error(`MCP tool ${name} failed after ${Date.now() - startedAt}ms`, error);
    throw error;
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "nerima-open-data-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "search_facilities",
    {
      title: "練馬区の公共施設を検索",
      description:
        "練馬区オープンデータの「公共施設一覧」を検索します。区役所、図書館、地域集会所、区民館、体育館、文化施設、住所、電話番号、施設分類を調べる質問で使います。",
      inputSchema: facilitySearchSchema
    },
    async (args) => {
      return runLoggedTool("search_facilities", args, async () => {
        const data = await loadDataSets();
        return asToolResponse(searchFacilities(data.facilities, args));
      });
    }
  );

  server.registerTool(
    "search_aed",
    {
      title: "練馬区のAED設置場所を検索",
      description:
        "練馬区オープンデータの「AED設置箇所一覧」を検索します。AED、救命設備、設置施設、住所、地域、公共施設内のAEDを探す質問で使います。",
      inputSchema: basicSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_aed", args, async () => {
        const data = await loadDataSets();
        return asToolResponse(searchAed(data.aed, args));
      });
    }
  );

  server.registerTool(
    "search_shelters",
    {
      title: "練馬区の避難所・防災施設を検索",
      description:
        "練馬区オープンデータの「指定緊急避難場所一覧」「避難拠点」を検索します。避難所、避難場所、防災、地震、火災、洪水、災害時の行き先、住所、地域で探す質問で使います。",
      inputSchema: basicSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_shelters", args, async () => {
        const data = await loadDataSets();
        return asToolResponse(searchShelters(data.shelters, args));
      });
    }
  );

  server.registerTool(
    "list_shelters",
    {
      title: "練馬区の避難所一覧を表示",
      description:
        "練馬区の指定緊急避難場所・避難拠点を一覧表示します。収容人数が多い避難所、地域別の避難所、災害種別ごとの避難場所を比較したい質問で使います。",
      inputSchema: listSheltersSchema
    },
    async (args) => {
      return runLoggedTool("list_shelters", args, async () => {
        const data = await loadDataSets();
        return asToolResponse(listShelters(data.shelters, args));
      });
    }
  );

  server.registerTool(
    "search_parks",
    {
      title: "練馬区の公園を検索",
      description:
        "練馬区オープンデータ由来の公園情報を検索します。公園名、所在地、地域、公園トイレ、近くの公園を探す質問で使います。",
      inputSchema: basicSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_parks", args, async () => {
        const data = await loadDataSets();
        return asToolResponse(searchParks(data.parks, args));
      });
    }
  );

  server.registerTool(
    "search_open_data",
    {
      title: "練馬区オープンデータ全CSVを横断検索",
      description:
        "練馬区オープンデータサイトから取り込んだ全CSVの中身を横断検索します。公共施設一覧、AED設置箇所一覧、行政手続情報、人口統計、文化財、防災、子育て、教育、産業、まちづくりなど、専用toolがないデータセットや幅広い調査で使います。",
      inputSchema: openDataSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_open_data", args, async () => {
        const manifest = await loadOpenDataManifest();
        return asToolResponse(await searchOpenDataFromStore(getCacheStore(), manifest, args));
      });
    }
  );

  server.registerTool(
    "search_open_data_datasets",
    {
      title: "練馬区オープンデータのデータセットを検索",
      description:
        "練馬区オープンデータサイトから取り込んだデータセット一覧を検索します。練馬について調べるときに、人口、施設、防災、子育て、教育、文化財、行政手続、産業、まちづくりなど、どのデータセットが存在するか探す質問で使います。",
      inputSchema: openDataDataSetSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_open_data_datasets", args, async () => {
        const manifest = await loadOpenDataManifest();
        return asToolResponse(searchOpenDataDataSets(manifest, args));
      });
    }
  );

  server.registerTool(
    "list_open_data_datasets",
    {
      title: "練馬区オープンデータのデータセット一覧を表示",
      description:
        "練馬区オープンデータサイトから取り込んだデータセット一覧を表示します。利用可能なデータ、カテゴリ別のデータ、行数が多いデータ、更新されたデータを把握したい質問で使います。",
      inputSchema: openDataDataSetListSchema
    },
    async (args) => {
      return runLoggedTool("list_open_data_datasets", args, async () => {
        const manifest = await loadOpenDataManifest();
        return asToolResponse(listOpenDataDataSets(manifest, args));
      });
    }
  );

  server.registerTool(
    "search_news",
    {
      title: "練馬区公式サイトの新着情報を検索",
      description:
        "練馬区公式サイトの新着情報RSSを検索します。お知らせ、区報、報道発表、募集、イベント、講座、事業者向け情報、最近更新されたページを探す質問で使います。",
      inputSchema: newsSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_news", args, async () => {
        const news = await loadNewsItems();
        return asToolResponse(searchNews(news?.items ?? [], args));
      });
    }
  );

  server.registerTool(
    "list_recent_news",
    {
      title: "練馬区公式サイトの新着情報を新しい順に表示",
      description:
        "練馬区公式サイトの新着情報RSSを新しい順に一覧表示します。最近のお知らせ、直近の区報、最新イベント、報道発表、更新情報を確認する質問で使います。",
      inputSchema: recentNewsSchema
    },
    async (args) => {
      return runLoggedTool("list_recent_news", args, async () => {
        const news = await loadNewsItems();
        return asToolResponse(listRecentNews(news?.items ?? [], args));
      });
    }
  );

  server.registerTool(
    "search_garbage_collection",
    {
      title: "練馬区のごみ・資源収集曜日を検索",
      description:
        "練馬区公式サイトの「地域別収集曜日一覧」を検索します。ごみの日、可燃ごみ、不燃ごみ、容器包装プラスチック、古紙、びん、缶、ペットボトル、町名、丁目、収集カレンダーPDFを調べる質問で使います。",
      inputSchema: garbageCollectionSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_garbage_collection", args, async () => {
        const garbage = await loadGarbageCollection();
        return asToolResponse(searchGarbageCollection(garbage?.items ?? [], args));
      });
    }
  );

  server.registerTool(
    "search_procedures",
    {
      title: "練馬区の行政手続情報を検索",
      description:
        "練馬区オープンデータの「行政手続情報」を検索します。申請、届出、証明書、相談、必要書類、担当課、担当係、窓口、場所、電話番号、電子申請URLを調べる質問で使います。",
      inputSchema: procedureSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_procedures", args, async () => {
        const manifest = await loadOpenDataManifest();
        return asToolResponse(await searchProceduresFromStore(getCacheStore(), manifest, args));
      });
    }
  );

  server.registerTool(
    "search_service_counters",
    {
      title: "練馬区の手続き窓口を検索",
      description:
        "練馬区オープンデータの「行政手続情報」から、場所・担当課・担当係・電話番号ごとに窓口候補を集約して検索します。どこで申請するか、証明書や相談の窓口、担当窓口、本庁舎や石神井庁舎の窓口を調べる質問で使います。",
      inputSchema: serviceCounterSearchSchema
    },
    async (args) => {
      return runLoggedTool("search_service_counters", args, async () => {
        const manifest = await loadOpenDataManifest();
        return asToolResponse(await searchServiceCountersFromStore(getCacheStore(), manifest, args));
      });
    }
  );

  server.registerTool(
    "get_dataset_stats",
    {
      title: "練馬区データセット統計を取得",
      description:
        "GCSキャッシュ済みの練馬区オープンデータ件数、CSVファイル数、総行数、主要データセット件数、避難所の収容人数上位を確認します。データ取り込み状況やキャッシュ規模を知りたい質問で使います。",
      inputSchema: {}
    },
    async () => {
      return runLoggedTool("get_dataset_stats", {}, async () => {
        const [data, manifest] = await Promise.all([loadDataSets(), loadOpenDataManifest()]);
        return asJsonToolResponse(getDatasetStats(data, manifest));
      });
    }
  );

  return server;
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const setMcpCorsHeaders = (res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id"
    );
    res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");
  };

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "nerima-open-data-mcp",
      version: "0.1.0"
    });
  });

  app.get("/open-data/cache", async (_req, res, next) => {
    try {
      const manifest = await loadOpenDataManifest();
      res.json({
        ok: true,
        manifest,
        loadedDatasetCount: manifest?.datasetCount ?? 0
      });
    } catch (error) {
      next(error);
    }
  });

  function validateTaskToken(req: Request, res: Response): boolean {
    const expectedToken = process.env.IMPORT_TOKEN;
    if (!expectedToken) {
      res.status(503).json({
        ok: false,
        error: "IMPORT_TOKEN is not configured."
      });
      return false;
    }

    const providedToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (providedToken !== expectedToken) {
      res.status(401).json({
        ok: false,
        error: "Unauthorized."
      });
      return false;
    }

    return true;
  }

  app.post("/tasks/import-open-data", async (req, res, next) => {
    try {
      if (!validateTaskToken(req, res)) {
        return;
      }

      const summary = await importOpenData({
        forceRefresh: req.body?.forceRefresh === true
      });
      clearDataSetCache();
      res.json({
        ok: true,
        summary
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/tasks/clear-cache", (req, res) => {
    if (!validateTaskToken(req, res)) {
      return;
    }

    clearDataSetCache();
    res.json({
      ok: true,
      clearedAt: new Date().toISOString()
    });
  });

  app.options("/mcp", (_req: Request, res: Response) => {
    setMcpCorsHeaders(res);
    res.status(204).end();
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    setMcpCorsHeaders(res);

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  };

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

export async function importOpenDataIfConfigured(): Promise<void> {
  if (process.env.AUTO_IMPORT_ON_START !== "true") {
    return;
  }

  const manifest = await loadOpenDataManifest();
  if (manifest) {
    return;
  }

  console.log("Open data cache is missing. Importing official CSV datasets...");
  const summary = await importOpenData();
  clearDataSetCache();
  console.log("Open data import completed:", summary);
}
