import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { clearDataSetCache, loadDataSets, loadOpenDataCache } from "./data/loader.js";
import { importOpenData } from "./data/openDataImport.js";
import { searchAed } from "./tools/searchAed.js";
import { asToolResponse } from "./tools/searchCommon.js";
import { searchFacilities } from "./tools/searchFacilities.js";
import { searchOpenData } from "./tools/searchOpenData.js";
import { searchParks } from "./tools/searchParks.js";
import { searchShelters } from "./tools/searchShelters.js";

const optionalLimit = z
  .number()
  .int()
  .min(0)
  .max(50)
  .optional()
  .describe("Maximum number of results. Defaults to 10.");

const facilitySearchSchema = {
  keyword: z.string().optional().describe("Partial text to search for."),
  category: z.string().optional().describe("Facility category partial match."),
  area: z.string().optional().describe("Address or area partial match."),
  limit: optionalLimit
};

const basicSearchSchema = {
  keyword: z.string().optional().describe("Partial text to search for."),
  area: z.string().optional().describe("Address or area partial match."),
  limit: optionalLimit
};

const openDataSearchSchema = {
  keyword: z.string().optional().describe("Partial text to search across all cached CSV rows."),
  category: z.string().optional().describe("Dataset category partial match."),
  dataset: z.string().optional().describe("Dataset title, summary, or keyword partial match."),
  limit: optionalLimit
};

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "nerima-open-data-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "search_facilities",
    {
      title: "Search Nerima Facilities",
      description: "Search public facilities in Nerima City by keyword, category, and area.",
      inputSchema: facilitySearchSchema
    },
    async (args) => {
      const data = await loadDataSets();
      return asToolResponse(searchFacilities(data.facilities, args));
    }
  );

  server.registerTool(
    "search_aed",
    {
      title: "Search Nerima AED Locations",
      description: "Search AED installation locations in Nerima City by keyword and area.",
      inputSchema: basicSearchSchema
    },
    async (args) => {
      const data = await loadDataSets();
      return asToolResponse(searchAed(data.aed, args));
    }
  );

  server.registerTool(
    "search_shelters",
    {
      title: "Search Nerima Shelters",
      description: "Search evacuation sites and disaster prevention facilities in Nerima City.",
      inputSchema: basicSearchSchema
    },
    async (args) => {
      const data = await loadDataSets();
      return asToolResponse(searchShelters(data.shelters, args));
    }
  );

  server.registerTool(
    "search_parks",
    {
      title: "Search Nerima Parks",
      description: "Search park records extracted from Nerima City public facility data.",
      inputSchema: basicSearchSchema
    },
    async (args) => {
      const data = await loadDataSets();
      return asToolResponse(searchParks(data.parks, args));
    }
  );

  server.registerTool(
    "search_open_data",
    {
      title: "Search All Cached Nerima Open Data",
      description:
        "Search across all CSV datasets imported from the Nerima City open data site.",
      inputSchema: openDataSearchSchema
    },
    async (args) => {
      const cache = await loadOpenDataCache();
      return asToolResponse(searchOpenData(cache.datasets, args));
    }
  );

  return server;
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "nerima-open-data-mcp",
      version: "0.1.0"
    });
  });

  app.get("/open-data/cache", async (_req, res, next) => {
    try {
      const cache = await loadOpenDataCache();
      res.json({
        ok: true,
        manifest: cache.manifest,
        loadedDatasetCount: cache.datasets.length
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/tasks/import-open-data", async (req, res, next) => {
    try {
      const expectedToken = process.env.IMPORT_TOKEN;
      if (!expectedToken) {
        res.status(503).json({
          ok: false,
          error: "IMPORT_TOKEN is not configured."
        });
        return;
      }

      const providedToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");
      if (providedToken !== expectedToken) {
        res.status(401).json({
          ok: false,
          error: "Unauthorized."
        });
        return;
      }

      const summary = await importOpenData();
      clearDataSetCache();
      res.json({
        ok: true,
        summary
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/mcp", async (req: Request, res: Response) => {
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

  const cache = await loadOpenDataCache();
  if (cache.manifest && cache.datasets.length > 0) {
    return;
  }

  console.log("Open data cache is missing. Importing official CSV datasets...");
  const summary = await importOpenData();
  clearDataSetCache();
  console.log("Open data import completed:", summary);
}
