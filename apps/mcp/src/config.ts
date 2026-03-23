const DEFAULT_API_URL = "https://api.clankonomy.com";
const DEFAULT_PUBLIC_BASE_URL = "https://mcp.clankonomy.com";

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const config = {
  apiBaseUrl: process.env.CLANKONOMY_API_URL ?? DEFAULT_API_URL,
  publicBaseUrl: process.env.MCP_PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL,
  port: Number(process.env.PORT ?? 8788),
  allowedOrigins: splitCsv(process.env.MCP_ALLOWED_ORIGINS),
  rateLimitWindowMs: Number(process.env.MCP_RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMaxRequests: Number(process.env.MCP_RATE_LIMIT_MAX_REQUESTS ?? 120),
  rateLimitMaxTrackedClients: Number(process.env.MCP_RATE_LIMIT_MAX_TRACKED_CLIENTS ?? 10_000),
  apiTimeoutMs: Number(process.env.MCP_API_TIMEOUT_MS ?? 15_000),
} as const;
