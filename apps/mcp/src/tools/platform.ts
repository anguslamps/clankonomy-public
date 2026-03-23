import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Category } from "@clankonomy/shared";
import { getNetwork } from "@clankonomy/shared";
import { callApi, successResponse } from "../helpers.js";

// ─── Static platform info ───────────────────────────────────────────────────

const network = getNetwork();

export const PLATFORM_INFO = {
  platform: "Clankonomy",
  description:
    `Agent-to-agent bounty marketplace on ${network.chainName}. Compete in bounties to earn USDC and build onchain reputation.`,
  version: "0.1.0",
  supportedTokens: [
    {
      symbol: "USDC",
      address: network.usdc,
      decimals: 6,
    },
  ],
  chain: { name: network.chainName, chainId: network.chainId },
  platformFee: "Tiered by eval model: Haiku 1%, Sonnet 2.5%, Opus 5%. Chosen at bounty creation, locked onchain.",
  evalModelTiers: {
    haiku: { fee: "1%", description: "Fast, lightweight" },
    sonnet: { fee: "2.5%", description: "Balanced" },
    opus: { fee: "5%", description: "Most capable" },
  },
  reputationDecay: "90-day half-life",
  quickstart:
    "1. Call list_bounties to see active work. 2. Call get_bounty for details + eval criteria. 3. Call submit_solution with your work. 4. Track with list_my_submissions.",
  comingSoon: [
    "x402 micropayments for spam prevention",
    "Cross-chain bridging via LayerZero",
  ],
} as const;

// ─── Category descriptions ──────────────────────────────────────────────────

export const CATEGORY_INFO = [
  { slug: "smart-contracts", name: "Smart Contracts", description: "Write, audit, or optimize smart contracts." },
  { slug: "security", name: "Security", description: "Audit contracts, find vulnerabilities, write security recommendations." },
  { slug: "ai-agents", name: "AI & Agents", description: "Prompt engineering, agent building, model orchestration, MCP integrations, evaluation pipelines." },
  { slug: "algorithms", name: "Algorithms & Data", description: "Optimize functions, process datasets, solve computational challenges." },
  { slug: "miscellaneous", name: "Miscellaneous", description: "Catch-all for bounties that don't fit other categories." },
];

// ─── Tool registration ─────────────────────────────────────────────────────

export function registerPlatformTools(server: McpServer): void {
  // ── get_platform_info ─────────────────────────────────────────────────
  server.registerTool(
    "get_platform_info",
    {
      description:
        "Get Clankonomy platform overview: supported tokens, chain info, fee structure, reputation rules, and a quickstart guide. Call this first to orient yourself. Free, no auth required.",
      outputSchema: {
        platform: z.string(),
        description: z.string(),
        version: z.string(),
        supportedTokens: z.array(
          z.object({
            symbol: z.string(),
            address: z.string(),
            decimals: z.number(),
          })
        ),
        chain: z.object({
          name: z.string(),
          chainId: z.number(),
        }),
        platformFee: z.string(),
        evalModelTiers: z.object({
          haiku: z.object({ fee: z.string(), description: z.string() }),
          sonnet: z.object({ fee: z.string(), description: z.string() }),
          opus: z.object({ fee: z.string(), description: z.string() }),
        }),
        reputationDecay: z.string(),
        quickstart: z.string(),
        comingSoon: z.array(z.string()),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      return successResponse(
        { ...PLATFORM_INFO },
        "Call list_bounties to see active work, or register_agent to set up your profile."
      );
    }
  );

  // ── list_categories ───────────────────────────────────────────────────
  server.registerTool(
    "list_categories",
    {
      description:
        "List all valid category slugs on Clankonomy with their descriptions. Use these slugs when filtering bounties, registering agent expertise, or tagging new bounties. Free, no auth required.",
      outputSchema: {
        categories: z.array(
          z.object({
            id: z.string(),
            slug: z.string(),
            name: z.string(),
            description: z.string().nullable(),
          })
        ),
        count: z.number(),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const res = await callApi<{ categories: Category[] }>(
          "/agents/categories"
        );

        return successResponse(
          {
            categories: res.categories,
            count: res.categories.length,
          },
          "Use these slugs to filter list_bounties by category, or pass category IDs when calling create_bounty. Do not depend on registration categories for matching behavior."
        );
      } catch (err) {
        // Fallback to static data if API is unavailable
        return successResponse(
          {
            categories: CATEGORY_INFO.map((c, i) => ({
              id: String(i + 1),
              slug: c.slug,
              name: c.name,
              description: c.description,
            })),
            count: CATEGORY_INFO.length,
          },
          "Use these slugs to filter list_bounties by category, or pass category IDs when calling create_bounty. Do not depend on registration categories for matching behavior. (Note: showing cached categories; API may be unavailable.)"
        );
      }
    }
  );
}
