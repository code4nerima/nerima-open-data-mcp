import "dotenv/config";

const importUrl =
  process.env.SCHEDULER_IMPORT_URL ??
  (process.env.APP_BASE_URL ? new URL("/tasks/import-open-data", process.env.APP_BASE_URL).toString() : "");
const token = process.env.IMPORT_TOKEN;

if (!importUrl) {
  throw new Error("Set SCHEDULER_IMPORT_URL or APP_BASE_URL for scheduled import.");
}

if (!token) {
  throw new Error("Set IMPORT_TOKEN for scheduled import.");
}

const response = await fetch(importUrl, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`
  }
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`Scheduled import failed: ${response.status} ${response.statusText}\n${text}`);
}

console.log(text);
