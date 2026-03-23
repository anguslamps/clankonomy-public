import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { createMcpServer } from "./server.js";

const server: McpServer = createMcpServer("stdio");

// ─── Connect transport ──────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// stderr so it doesn't pollute the stdio MCP channel
console.error(`[clankonomy-mcp] Connected — API: ${config.apiBaseUrl}`);

// Graceful shutdown
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});
