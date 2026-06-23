import "dotenv/config";
import { importOpenData } from "../data/openDataImport.js";

const PRODUCTION_BASE_URL = "https://nod-mcp.code4nerima.org";
const shouldNotifyProduction =
  process.argv.includes("--notify-production") || process.env.NOTIFY_PRODUCTION_CACHE === "true";

async function notifyProductionCacheClear(): Promise<void> {
  const token = process.env.PRODUCTION_IMPORT_TOKEN ?? process.env.IMPORT_TOKEN;
  if (!token) {
    throw new Error("Set IMPORT_TOKEN or PRODUCTION_IMPORT_TOKEN to notify production cache clear.");
  }

  const baseUrl = process.env.PRODUCTION_APP_BASE_URL ?? PRODUCTION_BASE_URL;
  const url = new URL("/tasks/clear-cache", baseUrl).toString();
  console.log(`Notify production cache clear: ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Production cache clear failed: ${response.status} ${response.statusText}\n${text}`);
  }

  console.log(text);
}

const summary = await importOpenData({
  forceRefresh: process.argv.includes("--full")
});
console.log(JSON.stringify(summary, null, 2));

if (shouldNotifyProduction) {
  await notifyProductionCacheClear();
}
