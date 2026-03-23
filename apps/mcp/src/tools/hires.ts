import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_ROUTES, AUTH_ACTIONS, type Hire } from "@clankonomy/shared";
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

// ─── Tool registration ─────────────────────────────────────────────────────

export function registerHireTools(
  server: McpServer,
  options: { mode: ServerMode }
): void {
  const isHosted = options.mode === "hosted";

  // ── accept_hire ─────────────────────────────────────────────────────────
  server.registerTool(
    "accept_hire",
    {
      description:
        "Accept a direct hire request from a poster. Once accepted, the full hire context (detailed requirements, datasets, etc.) is revealed. The poster's funds are already escrowed onchain. Complete the work before the deadline to earn the reward. Requires EIP-712 wallet signature. Not idempotent: you can only accept once.",
      inputSchema: {
        hireId: z.string().describe("The hire request ID to accept"),
        walletAddress: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Your wallet address (0x...) -- must match the invited agent. Required in hosted MCP mode."
              : "Your wallet address (0x...) -- must match the invited agent. Optional if local wallet exists."
          ),
        walletSignature: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "EIP-712 signature proving ownership of the wallet. Required in hosted MCP mode."
              : "EIP-712 signature proving ownership of the wallet. Optional if local wallet exists."
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
        hire: z.object({
          id: z.string(),
          title: z.string(),
          budget: z.string(),
          deadline: z.string(),
          status: z.string(),
        }),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ hireId, walletAddress, walletSignature, authTimestamp, authNonce }) => {
      try {
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
              "Hosted MCP does not manage private keys or auto-sign hire acceptance.",
              "Provide walletAddress, walletSignature, authTimestamp, and authNonce from your own signer, or use the package MCP for local auto-signing."
            );
          }

          authParams = await signAuthAction(AUTH_ACTIONS.acceptHire);
        }

        const res = await callApi<{ hire: Hire }>(API_ROUTES.hireAccept(hireId), {
          method: "PATCH",
          headers: buildSignedActionHeaders({
            ...authParams,
            action: AUTH_ACTIONS.acceptHire,
          }),
        });
        const hire = res.hire;

        return successResponse(
          {
            hire: {
              id: hire.id,
              title: hire.title,
              budget: `${formatAmount(hire.budgetAmount)} ${tokenLabel(hire.budgetToken)}`,
              deadline: new Date(hire.deadline).toISOString(),
              status: hire.status,
            },
          },
          "Hire accepted. Call get_hire_details to view the full context, requirements, and any attached datasets. Then submit your work via the associated bounty."
        );
      } catch (err) {
        return errorResponse(
          "ACCEPT_HIRE_FAILED",
          err instanceof Error ? err.message : String(err),
          "Verify the hire ID, that your wallet matches the invited agent, and your EIP-712 signature is valid. Call get_available_jobs to see pending hires."
        );
      }
    }
  );

  // ── get_hire_details ──────────────────────────────────────────────────
  server.registerTool(
    "get_hire_details",
    {
      description:
        "Get full details of a hire request including the private context (requirements, datasets, etc.). Only available after you've accepted the hire. Use this to understand exactly what needs to be delivered. Free to call once accepted.",
      inputSchema: {
        hireId: z.string().describe("The hire request ID"),
        walletAddress: z
          .string()
          .describe(
            "Your wallet address (0x...) -- must be the accepted agent"
          ),
      },
      outputSchema: {
        hire: z.object({
          id: z.string(),
          title: z.string(),
          posterWallet: z.string(),
          status: z.string(),
          budget: z.string(),
          deadline: z.string(),
          acceptedAt: z.string().nullable(),
          bountyId: z.string().nullable(),
          description: z.string(),
          context: z.string().nullable(),
        }),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ hireId, walletAddress }) => {
      try {
        const res = await callApi<{ hire: Hire }>(`/hires/${hireId}`, {
          headers: {
            "x-wallet-address": walletAddress,
          },
        });
        const hire = res.hire;

        return successResponse(
          {
            hire: {
              id: hire.id,
              title: hire.title,
              posterWallet: hire.posterWallet,
              status: hire.status,
              budget: `${formatAmount(hire.budgetAmount)} ${tokenLabel(hire.budgetToken)}`,
              deadline: new Date(hire.deadline).toISOString(),
              acceptedAt: hire.acceptedAt ?? null,
              bountyId: hire.bountyId ?? null,
              description: hire.description,
              context: hire.context ?? null,
            },
          },
          hire.bountyId
            ? `Submit your work via submit_solution to bounty ${hire.bountyId}. Review the requirements in the context field carefully.`
            : "Review the requirements in the description and context fields. Work will be submitted via the associated bounty once it is created."
        );
      } catch (err) {
        return errorResponse(
          "GET_HIRE_DETAILS_FAILED",
          err instanceof Error ? err.message : String(err),
          "You must accept the hire first with accept_hire. Verify the hire ID and that your wallet matches the accepted agent."
        );
      }
    }
  );
}
