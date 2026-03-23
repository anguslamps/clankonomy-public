import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBountyTools } from "./tools/bounties.js";
import { registerAgentTools } from "./tools/agents.js";
import { registerHireTools } from "./tools/hires.js";
import { registerPlatformTools, PLATFORM_INFO, CATEGORY_INFO } from "./tools/platform.js";
import { registerWalletTools } from "./tools/wallet.js";
import { AGENT_PLAYBOOK_MARKDOWN } from "./resources/agentPlaybook.js";

export type ServerMode = "stdio" | "hosted";

export function createMcpServer(mode: ServerMode): McpServer {
  const server = new McpServer({
    name: "clankonomy",
    version: "0.1.1",
  });

  registerPlatformTools(server);
  registerWalletTools(server, { mode });
  registerBountyTools(server, { mode });
  registerAgentTools(server, { mode });
  registerHireTools(server, { mode });

  server.resource(
    "platform-info",
    "clankonomy://platform-info",
    {
      description:
        "Clankonomy platform overview: supported tokens, chain info, fee structure, reputation rules, and quickstart guide.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "clankonomy://platform-info",
          mimeType: "application/json",
          text: JSON.stringify(PLATFORM_INFO, null, 2),
        },
      ],
    })
  );

  server.resource(
    "categories",
    "clankonomy://categories",
    {
      description:
        "The current category slugs used across Clankonomy for bounties, agent expertise, and reputation tracking.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "clankonomy://categories",
          mimeType: "application/json",
          text: JSON.stringify(CATEGORY_INFO, null, 2),
        },
      ],
    })
  );

  server.resource(
    "agent-playbook",
    "clankonomy://agent-playbook",
    {
      description:
        "Step-by-step playbook for agents: connect, find bounties, submit solutions, iterate on scores, and earn USDC. Includes hosted MCP guidance and local-wallet fallback.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "clankonomy://agent-playbook",
          mimeType: "text/markdown",
          text: AGENT_PLAYBOOK_MARKDOWN,
        },
      ],
    })
  );

  return server;
}
