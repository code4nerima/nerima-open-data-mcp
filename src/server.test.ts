import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./server.js";

describe("HTTP server", () => {
  afterEach(() => {
    delete process.env.IMPORT_TOKEN;
  });

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

  it("clears cache with task token", async () => {
    process.env.IMPORT_TOKEN = "test-token";

    const response = await request(createApp())
      .post("/tasks/clear-cache")
      .set("Authorization", "Bearer test-token")
      .expect(200);

    expect(response.body).toMatchObject({ ok: true });
    expect(response.body.clearedAt).toBeTruthy();
  });

  it("rejects clear cache with invalid task token", async () => {
    process.env.IMPORT_TOKEN = "test-token";

    const response = await request(createApp())
      .post("/tasks/clear-cache")
      .set("Authorization", "Bearer wrong-token")
      .expect(401);

    expect(response.body).toMatchObject({
      ok: false,
      error: "Unauthorized."
    });
  });
});
