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
});
