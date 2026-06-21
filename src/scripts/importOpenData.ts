import "dotenv/config";
import { importOpenData } from "../data/openDataImport.js";

const summary = await importOpenData();
console.log(JSON.stringify(summary, null, 2));
