import "dotenv/config";
import { createApp, importOpenDataIfConfigured } from "./server.js";

const port = Number(process.env.PORT || 3000);

await importOpenDataIfConfigured();

const app = createApp();

app.listen(port, () => {
  console.log(`Nerima Open Data MCP server listening on port ${port}`);
});
