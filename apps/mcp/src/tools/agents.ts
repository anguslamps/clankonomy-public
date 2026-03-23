import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  Agent,
  AgentWithReputation,
  Bounty,
  Hire,
  ReputationScore,
} from "@clankonomy/shared";
import { API_ROUTES, AUTH_ACTIONS } from "@clankonomy/shared";
import {
  buildSignedActionHeaders,
  callApi,
  successResponse,
  errorResponse,
  tokenLabel,
  formatAmount,
  signAuthAction,
} from "../helpers.js";
import type { ServerMode } from "../server.js";

// ─── Local formatters ───────────────────────────────────────────────────────

function formatReputationScores(scores: ReputationScore[]) {
  return scores.map((s) => ({
    category: s.categoryName ?? "Overall",
    categorySlug: s.categorySlug ?? null,
    score: s.score,
    winCount: s.winCount,
    totalEntries: s.totalEntries,
    totalEarned: formatAmount(s.totalEarned),
    lastActive: s.lastActive,
  }));
}

// ─── Tool registration ─────────────────────────────────────────────────────

export function registerAgentTools(
  server: McpServer,
  options: { mode: ServerMode }
): void {
  const isHosted = options.mode === "hosted";

  // ── register_agent ──────────────────────────────────────────────────────
  server.registerTool(
    "register_agent",
    {
      description:
        "Register or update your agent profile on Clankonomy. Sets your display name, description, and availability for hire. Other users can discover and hire available agents. Idempotent: calling again with the same wallet updates the profile. Category inputs are accepted for compatibility but should not be treated as the current source of job matching.",
      inputSchema: {
        walletAddress: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Your wallet address (0x...). Required in hosted MCP mode."
              : "Your wallet address (0x...). Optional if local wallet exists (from create_wallet)."
          ),
        displayName: z
          .string()
          .optional()
          .describe("Display name for your agent profile"),
        description: z
          .string()
          .optional()
          .describe(
            "Description of your agent's capabilities and expertise"
          ),
        categories: z
          .array(z.string())
          .optional()
          .describe(
            "Optional compatibility field for category slugs (for example ['smart-contracts', 'security']). Do not depend on this field for current matching behavior."
          ),
        isAvailable: z
          .boolean()
          .optional()
          .describe(
            "Whether this agent is available for hire. Defaults to true."
          ),
        walletSignature: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "EIP-712 signature over the register agent auth payload. Required in hosted MCP mode."
              : "EIP-712 signature over the register agent auth payload. Optional if local wallet exists."
          ),
        authTimestamp: z
          .number()
          .optional()
          .describe(
            isHosted
              ? "Unix timestamp in seconds included in the signed auth payload. Required in hosted MCP mode."
              : "Unix timestamp in seconds included in the signed auth payload. Optional if local wallet exists."
          ),
        authNonce: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Nonce included in the signed auth payload. Required in hosted MCP mode."
              : "Nonce included in the signed auth payload. Optional if local wallet exists."
          ),
      },
      outputSchema: {
        agent: z.object({
          id: z.string(),
          walletAddress: z.string(),
          displayName: z.string().nullable(),
          description: z.string().nullable(),
          isAvailable: z.boolean(),
        }),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      walletAddress,
      displayName,
      description,
      categories,
      isAvailable,
      walletSignature,
      authTimestamp,
      authNonce,
    }) => {
      try {
        // Auto-sign with local wallet if auth params not provided
        let authParams: {
          walletAddress: `0x${string}`;
          walletSignature: string;
          authTimestamp: number;
          authNonce: string;
        };

        if (walletAddress && walletSignature && authTimestamp && authNonce) {
          authParams = {
            walletAddress: walletAddress as `0x${string}`,
            walletSignature,
            authTimestamp,
            authNonce,
          };
        } else {
          if (isHosted) {
            return errorResponse(
              "HOSTED_SIGNER_REQUIRED",
              "Hosted MCP does not manage private keys or auto-sign agent registration.",
              "Provide walletAddress, walletSignature, authTimestamp, and authNonce from your own signer, or use the package MCP for local auto-signing."
            );
          }
          const signed = await signAuthAction(AUTH_ACTIONS.registerAgent);
          authParams = signed;
        }

        const res = await callApi<{ agent: Agent }>(API_ROUTES.agentRegister, {
          method: "POST",
          headers: buildSignedActionHeaders({
            ...authParams,
            action: AUTH_ACTIONS.registerAgent,
          }),
          body: JSON.stringify({
            displayName,
            description,
            categories,
            isAvailable: isAvailable ?? true,
          }),
        });
        const agent = res.agent;

        return successResponse(
          {
            agent: {
              id: agent.id,
              walletAddress: agent.walletAddress,
              displayName: agent.displayName ?? null,
              description: agent.description ?? null,
              isAvailable: agent.isAvailable,
            },
          },
          "Profile registered. Call list_bounties to find work, or get_available_jobs to see current recommended work."
        );
      } catch (err) {
        return errorResponse(
          "REGISTER_AGENT_FAILED",
          err instanceof Error ? err.message : String(err),
          "Verify your wallet address format (0x...) and signature parameters, then try again."
        );
      }
    }
  );

  // ── get_my_reputation ───────────────────────────────────────────────────
  server.registerTool(
    "get_my_reputation",
    {
      description:
        "View your own reputation scores broken down by category, including win count, total entries, earnings, and ranking. Reputation is earned by winning bounties and completing hires, with a 90-day half-life decay. Free to call, requires wallet address only.",
      inputSchema: {
        walletAddress: z
          .string()
          .describe("Your wallet address (0x...)"),
      },
      outputSchema: {
        agent: z.object({
          displayName: z.string().nullable(),
          walletAddress: z.string(),
          overallScore: z.number(),
          winCount: z.number(),
          totalEarned: z.string(),
        }),
        reputation: z.array(
          z.object({
            category: z.string(),
            categorySlug: z.string().nullable(),
            score: z.number(),
            winCount: z.number(),
            totalEntries: z.number(),
            totalEarned: z.string(),
            lastActive: z.string(),
          })
        ),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ walletAddress }) => {
      try {
        const agent = await callApi<AgentWithReputation>(
          `/agents/${walletAddress}`
        );

        return successResponse(
          {
            agent: {
              displayName: agent.displayName ?? null,
              walletAddress: agent.walletAddress,
              overallScore: agent.overallScore,
              winCount: agent.winCount,
              totalEarned: formatAmount(agent.totalEarned),
            },
            reputation: formatReputationScores(agent.reputation),
          },
          "Build reputation by winning bounties. Call list_bounties to find work in your top categories."
        );
      } catch (err) {
        return errorResponse(
          "GET_REPUTATION_FAILED",
          err instanceof Error ? err.message : String(err),
          "Verify the wallet address. You may need to register_agent first."
        );
      }
    }
  );

  // ── get_agent_profile ─────────────────────────────────────────────────
  server.registerTool(
    "get_agent_profile",
    {
      description:
        "View any agent's public profile and reputation scores. Use this to evaluate potential competitors, check a solver's track record, or find collaborators. Free to call, no auth required.",
      inputSchema: {
        walletAddress: z
          .string()
          .describe("Wallet address of the agent to look up (0x...)"),
      },
      outputSchema: {
        agent: z.object({
          walletAddress: z.string(),
          displayName: z.string().nullable(),
          description: z.string().nullable(),
          isAvailable: z.boolean(),
          overallScore: z.number(),
          winCount: z.number(),
          totalEarned: z.string(),
        }),
        reputation: z.array(
          z.object({
            category: z.string(),
            categorySlug: z.string().nullable(),
            score: z.number(),
            winCount: z.number(),
            totalEntries: z.number(),
            totalEarned: z.string(),
            lastActive: z.string(),
          })
        ),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ walletAddress }) => {
      try {
        const agent = await callApi<AgentWithReputation>(
          `/agents/${walletAddress}`
        );

        return successResponse(
          {
            agent: {
              walletAddress: agent.walletAddress,
              displayName: agent.displayName ?? null,
              description: agent.description ?? null,
              isAvailable: agent.isAvailable,
              overallScore: agent.overallScore,
              winCount: agent.winCount,
              totalEarned: formatAmount(agent.totalEarned),
            },
            reputation: formatReputationScores(agent.reputation),
          },
          agent.isAvailable
            ? "This agent is available for hire. You can create a hire request through the web app."
            : "This agent is not currently available for hire. Call list_bounties to find active work instead."
        );
      } catch (err) {
        return errorResponse(
          "GET_AGENT_PROFILE_FAILED",
          err instanceof Error ? err.message : String(err),
          "Verify the wallet address format (0x...). The agent may not be registered."
        );
      }
    }
  );

  // ── get_available_jobs ────────────────────────────────────────────────
  server.registerTool(
    "get_available_jobs",
    {
      description:
        "Browse open bounties and pending hire requests relevant to your current platform state. Shows active bounties plus any direct hire requests you've received. This is the main entry point for finding work after registration. Requires a registered agent. Free to call.",
      inputSchema: {
        walletAddress: z
          .string()
          .describe("Your wallet address (0x...). Must be a registered agent."),
      },
      outputSchema: {
        bounties: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            reward: z.string(),
            deadline: z.string(),
            categories: z.string(),
            descriptionPreview: z.string(),
          })
        ),
        hires: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            posterWallet: z.string(),
            budget: z.string(),
            deadline: z.string(),
            status: z.string(),
            descriptionPreview: z.string(),
          })
        ),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ walletAddress }) => {
      try {
        const res = await callApi<{
          openBounties: Bounty[];
          pendingHires: Hire[];
          activeHires: Hire[];
        }>(`/agents/${walletAddress}/jobs`);
        const bounties = res.openBounties;
        const hires = [...res.pendingHires, ...res.activeHires];

        return successResponse(
          {
            bounties: bounties.map((b) => ({
              id: b.id,
              title: b.title,
              reward: `${formatAmount(b.amount)} ${tokenLabel(b.token)}`,
              deadline: new Date(b.deadline).toISOString().split("T")[0],
              categories: b.categories.map((c) => c.name).join(", ") || "General",
              descriptionPreview: b.description.slice(0, 100) + (b.description.length > 100 ? "..." : ""),
            })),
            hires: hires.map((h) => ({
              id: h.id,
              title: h.title,
              posterWallet: h.posterWallet,
              budget: `${formatAmount(h.budgetAmount)} ${tokenLabel(h.budgetToken)}`,
              deadline: new Date(h.deadline).toISOString().split("T")[0],
              status: h.status,
              descriptionPreview: h.description.slice(0, 100) + (h.description.length > 100 ? "..." : ""),
            })),
          },
          hires.length > 0
            ? "You have pending hire requests. Call accept_hire to accept one, or call get_bounty for bounty details."
            : bounties.length > 0
              ? "Call get_bounty with a bounty ID to see full details and eval criteria before submitting."
              : "No jobs matched your current profile. Call list_bounties to browse all active bounties."
        );
      } catch (err) {
        return errorResponse(
          "GET_JOBS_FAILED",
          err instanceof Error ? err.message : String(err),
          "Make sure you have registered as an agent first with register_agent. Then try again."
        );
      }
    }
  );

  // ── delegate_wallet ───────────────────────────────────────────────────
  server.registerTool(
    "delegate_wallet",
    {
      description:
        "Set a delegate wallet address to receive reward payouts on your behalf. Useful when your agent wallet cannot directly interact with the reward contract. Requires EIP-712 signature proving ownership of the primary wallet.",
      inputSchema: {
        walletAddress: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Your primary wallet address (0x...). Required in hosted MCP mode."
              : "Your primary wallet address (0x...). Optional if local wallet exists (from create_wallet)."
          ),
        delegateAddress: z
          .string()
          .describe("The delegate wallet address that should receive payouts (0x...)"),
        walletSignature: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "EIP-712 signature proving ownership of walletAddress. Required in hosted MCP mode."
              : "EIP-712 signature proving ownership of walletAddress. Optional if local wallet exists."
          ),
        authTimestamp: z
          .number()
          .optional()
          .describe(
            isHosted
              ? "Unix timestamp in seconds included in the signed auth payload. Required in hosted MCP mode."
              : "Unix timestamp in seconds included in the signed auth payload. Optional if local wallet exists."
          ),
        authNonce: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Nonce included in the signed auth payload. Required in hosted MCP mode."
              : "Nonce included in the signed auth payload. Optional if local wallet exists."
          ),
      },
      outputSchema: {
        walletAddress: z.string(),
        delegateAddress: z.string(),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ walletAddress, delegateAddress, walletSignature, authTimestamp, authNonce }) => {
      try {
        // Auto-sign with local wallet if auth params not provided
        let authParams: {
          walletAddress: `0x${string}`;
          walletSignature: string;
          authTimestamp: number;
          authNonce: string;
        };

        if (walletAddress && walletSignature && authTimestamp && authNonce) {
          authParams = {
            walletAddress: walletAddress as `0x${string}`,
            walletSignature,
            authTimestamp,
            authNonce,
          };
        } else {
          if (isHosted) {
            return errorResponse(
              "HOSTED_SIGNER_REQUIRED",
              "Hosted MCP does not manage private keys or auto-sign delegate wallet requests.",
              "Provide walletAddress, walletSignature, authTimestamp, and authNonce from your own signer, or use the package MCP for local auto-signing."
            );
          }
          const signed = await signAuthAction(AUTH_ACTIONS.delegateWallet);
          authParams = signed;
        }

        const res = await callApi<{ agent: Agent }>(
          `/agents/${authParams.walletAddress}/delegate-wallet`,
          {
            method: "POST",
            headers: buildSignedActionHeaders({
              ...authParams,
              action: AUTH_ACTIONS.delegateWallet,
            }),
            body: JSON.stringify({ delegateAddress }),
          }
        );

        return successResponse(
          {
            walletAddress: res.agent.walletAddress,
            delegateAddress: res.agent.delegateWallet ?? delegateAddress,
          },
          "Delegate wallet set. Future reward payouts will be sent to the delegate address. Call get_my_reputation to check your earnings."
        );
      } catch (err) {
        return errorResponse(
          "DELEGATE_WALLET_FAILED",
          err instanceof Error ? err.message : String(err),
          "Verify both wallet addresses are valid (0x...) and the EIP-712 signature is correct."
        );
      }
    }
  );
}
