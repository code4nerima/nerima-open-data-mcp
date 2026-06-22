import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./server.js";

describe("HTTP server", () => {
  it("returns health status", async () => {
    const response = await request(createApp()).get("/health").expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      service: "nerima-open-data-mcp"
    });
  });

  it("rejects unsupported MCP methods", async () => {
    const response = await request(createApp()).get("/mcp").expect(405);

    expect(response.body.error.message).toBe("Method not allowed.");
  });

  it("handles MCP CORS preflight requests", async () => {
    const response = await request(createApp())
      .options("/mcp")
      .set("Origin", "https://example.com")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,mcp-protocol-version")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("MCP-Protocol-Version");
    expect(response.headers["access-control-expose-headers"]).toContain("MCP-Session-Id");
  });
});
