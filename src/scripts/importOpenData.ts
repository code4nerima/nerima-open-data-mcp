import "dotenv/config";
import { importOpenData } from "../data/openDataImport.js";

const summary = await importOpenData({
  forceRefresh: process.argv.includes("--full")
});
console.log(JSON.stringify(summary, null, 2));
