import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { createMcpServer } from "./server.js";

const server = createMcpServer("hosted");
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

type RateLimitEntry = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

const rateLimits = new Map<string, RateLimitEntry>();

function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getPathname(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (config.allowedOrigins.length === 0) return false;
  return config.allowedOrigins.includes(origin);
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(origin)) {
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Last-Event-ID, Mcp-Session-Id"
  );
}

function isRateLimited(req: IncomingMessage): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  pruneRateLimits(now);
  const existing = rateLimits.get(ip);

  if (!existing || existing.resetAt <= now) {
    rateLimits.set(ip, {
      count: 1,
      resetAt: now + config.rateLimitWindowMs,
      lastSeenAt: now,
    });
    return false;
  }

  existing.lastSeenAt = now;
  existing.count += 1;
  if (existing.count > config.rateLimitMaxRequests) {
    return true;
  }
  return false;
}

function pruneRateLimits(now: number) {
  for (const [key, entry] of rateLimits.entries()) {
    if (entry.resetAt <= now) {
      rateLimits.delete(key);
    }
  }

  if (rateLimits.size <= config.rateLimitMaxTrackedClients) {
    return;
  }

  const overflow = rateLimits.size - config.rateLimitMaxTrackedClients;
  const oldestKeys = [...rateLimits.entries()]
    .sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)
    .slice(0, overflow)
    .map(([key]) => key);

  for (const key of oldestKeys) {
    rateLimits.delete(key);
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const pathname = getPathname(req);
  setCorsHeaders(req, res);

  if (pathname === "/health") {
    return writeJson(res, 200, {
      status: "ok",
      mode: "hosted",
      transport: "streamable-http",
      apiBaseUrl: config.apiBaseUrl,
      publicBaseUrl: config.publicBaseUrl,
      timestamp: new Date().toISOString(),
    });
  }

  if (pathname !== "/mcp") {
    return writeJson(res, 404, { error: "Not found" });
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!isOriginAllowed(req)) {
    console.error("[clankonomy-mcp:hosted] blocked origin", req.headers.origin);
    return writeJson(res, 403, {
      error: "Origin not allowed",
      suggestedAction:
        "Set MCP_ALLOWED_ORIGINS to a comma-separated allowlist for browser-based clients, or connect without an Origin header from a server/runtime client.",
    });
  }

  if (isRateLimited(req)) {
    console.error("[clankonomy-mcp:hosted] rate limited", getClientIp(req));
    res.setHeader("Retry-After", "60");
    return writeJson(res, 429, { error: "Rate limit exceeded" });
  }

  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("[clankonomy-mcp:hosted] transport error", error);
    if (!res.headersSent) {
      writeJson(res, 500, { error: "Hosted MCP transport error" });
    }
  }
}

transport.onerror = (error) => {
  console.error("[clankonomy-mcp:hosted] MCP transport callback error", error);
};

transport.onclose = () => {
  console.error("[clankonomy-mcp:hosted] transport closed");
};

await server.connect(transport);

const httpServer = createServer((req, res) => {
  void handleRequest(req, res);
});

httpServer.listen(config.port, () => {
  console.error(
    `[clankonomy-mcp:hosted] Listening on port ${config.port} — MCP: ${config.publicBaseUrl}/mcp — API: ${config.apiBaseUrl}`
  );
});

async function shutdown() {
  await server.close();
  await transport.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
