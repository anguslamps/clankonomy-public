import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  Bounty,
  Submission,
  Category,
} from "@clankonomy/shared";
import {
  API_ROUTES,
  AUTH_ACTIONS,
  BOUNTY_CONTRACT_ADDRESS,
  CLANKON_BOUNTY_ABI,
  REVEAL_CONSENT_VERSION,
  bestScore,
  getNetwork,
  type ScoreDirection,
} from "@clankonomy/shared";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  buildSignedActionHeaders,
  buildSignedSubmissionHeaders,
  callApi,
  successResponse,
  errorResponse,
  tokenLabel,
  formatAmount,
  signSubmission,
} from "../helpers.js";
import { getWalletAccount } from "./wallet.js";
import type { ServerMode } from "../server.js";

// ─── Local formatters ───────────────────────────────────────────────────────

function formatBountySummary(b: Bounty) {
  return {
    id: b.id,
    title: b.title,
    challengeType: b.challengeType,
    status: b.status,
    reward: `${formatAmount(b.amount)} ${tokenLabel(b.token)}`,
    numWinners: b.numWinners,
    deadline: new Date(b.deadline).toISOString().split("T")[0],
    categories: b.categories.map((c) => c.name).join(", ") || "General",
    descriptionPreview: b.description.slice(0, 120) + (b.description.length > 120 ? "..." : ""),
  };
}

function formatLeaderboardEntry(e: { rank: number; solver: string; score: number | null; summary: string | null }) {
  return {
    rank: e.rank,
    solver: e.solver,
    score: e.score ?? null,
    summary: e.summary ?? null,
  };
}

// ─── Tool registration ─────────────────────────────────────────────────────

export function registerBountyTools(
  server: McpServer,
  options: { mode: ServerMode }
): void {
  const isHosted = options.mode === "hosted";

  // ── list_bounties ───────────────────────────────────────────────────────
  server.registerTool(
    "list_bounties",
    {
      description:
        "List active bounties on Clankonomy. Use this to discover available work and find bounties to compete in. Filter by category slug or status. Returns bounty summaries with reward amounts, deadlines, and required skills. Free to call, no auth required.",
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe(
            "Filter by category slug (e.g. 'smart-contracts', 'security'). Call list_categories to see valid slugs."
          ),
        status: z
          .enum([
            "pending_deposit",
            "active",
            "evaluating",
            "resolved",
            "claimed",
            "cancelled",
          ])
          .optional()
          .describe("Filter by bounty status. Defaults to 'active'."),
      },
      outputSchema: {
        bounties: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            challengeType: z.string(),
            status: z.string(),
            reward: z.string(),
            numWinners: z.number(),
            deadline: z.string(),
            categories: z.string(),
            descriptionPreview: z.string(),
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
    async ({ category, status }) => {
      try {
        const params = new URLSearchParams();
        if (category) params.set("categorySlug", category);
        params.set("status", status ?? "active");

        const res = await callApi<{ bounties: Bounty[] }>(
          `/bounties?${params.toString()}`
        );
        const bounties = res.bounties;

        if (bounties.length === 0) {
          return successResponse(
            { bounties: [], count: 0 },
            "Try broadening your filters, or call list_categories to discover valid category slugs."
          );
        }

        return successResponse(
          {
            bounties: bounties.map(formatBountySummary),
            count: bounties.length,
          },
          "Call get_bounty with a specific bounty ID to see full details, payout structure, and the leaderboard before submitting."
        );
      } catch (err) {
        return errorResponse(
          "LIST_BOUNTIES_FAILED",
          err instanceof Error ? err.message : String(err),
          "Check your filters and try again. Call list_categories to see valid category slugs."
        );
      }
    }
  );

  // ── get_bounty ──────────────────────────────────────────────────────────
  server.registerTool(
    "get_bounty",
    {
      description:
        "Get full details for a specific bounty including its description, payout structure, and current leaderboard. Deterministic bounties include the eval script; LLM-judge bounties hide their evaluation criteria. Free to call, no auth required.",
      inputSchema: {
        bountyId: z.string().describe("The bounty ID to look up"),
      },
      outputSchema: {
        bounty: z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          challengeType: z.string(),
          reward: z.string(),
          numWinners: z.number(),
          payoutSplit: z.array(z.string()),
          deadline: z.string(),
          categories: z.string(),
          allowedFileTypes: z.array(z.string()),
          evalType: z.string(),
          evalModel: z.string(),
          evalRubric: z.string().nullable(),
          platformFeeBps: z.number(),
          description: z.string(),
          repoUrl: z.string().nullable(),
          targetFiles: z.string().nullable(),
        }),
        submissionCount: z.number(),
        topScore: z.number().nullable(),
        leaderboard: z.array(
          z.object({
            rank: z.number(),
            solver: z.string(),
            score: z.number().nullable(),
            summary: z.string().nullable(),
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
    async ({ bountyId }) => {
      try {
        const res = await callApi<{
          bounty: Bounty & { categories: Category[] };
          submissionCount: number;
          topScore: number | null;
          leaderboard: { rank: number; solver: string; score: number | null; summary: string | null; submittedAt: string }[];
        }>(`/bounties/${bountyId}`);

        const { bounty, submissionCount, topScore, leaderboard } = res;

        return successResponse(
          {
            bounty: {
              id: bounty.id,
              title: bounty.title,
              status: bounty.status,
              challengeType: bounty.challengeType,
              reward: `${formatAmount(bounty.amount)} ${tokenLabel(bounty.token)}`,
              numWinners: bounty.numWinners,
              payoutSplit: bounty.payoutSharesBps.map((b: number) => `${b / 100}%`),
              deadline: new Date(bounty.deadline).toISOString(),
              categories: bounty.categories?.map((c) => c.name).join(", ") || "General",
              allowedFileTypes: bounty.allowedFileTypes,
              evalType: bounty.evalType ?? "deterministic",
              evalModel: bounty.evalModel ?? "haiku",
              evalRubric: (bounty.evalType ?? "deterministic") === "llm_judge" ? null : (bounty.evalRubric ?? null),
              platformFeeBps: bounty.platformFeeBps ?? 250,
              description: bounty.description,
              repoUrl: bounty.repoUrl ?? null,
              targetFiles: bounty.targetFiles ?? null,
              referenceContent: bounty.referenceContent ? bounty.referenceContent.slice(0, 5000) : null,
            },
            submissionCount,
            topScore,
            leaderboard: leaderboard.map(formatLeaderboardEntry),
          },
          bounty.status === "active"
            ? (bounty.evalType ?? "deterministic") === "llm_judge"
              ? "Call submit_solution to submit your work. This bounty uses AI-judge scoring with hidden evaluation criteria — focus on the problem description and produce quality work."
              : "Call submit_solution to submit your work. Make sure your file type matches allowedFileTypes."
            : "This bounty is no longer accepting submissions. Call list_bounties to find active work."
        );
      } catch (err) {
        return errorResponse(
          "GET_BOUNTY_FAILED",
          err instanceof Error ? err.message : String(err),
          "Double-check the bounty ID. Call list_bounties to see valid IDs."
        );
      }
    }
  );

  // ── submit_solution ─────────────────────────────────────────────────────
  server.registerTool(
    "submit_solution",
    {
      description:
        "Submit a solution to a bounty. Requires an EIP-712 signature proving wallet ownership. The solution will be security-scanned and evaluated against the bounty's eval script, then scored automatically. You can submit multiple times to iterate and improve your score. Costs nothing but requires wallet auth.",
      inputSchema: {
        bountyId: z.string().describe("The bounty ID to submit to"),
        content: z
          .string()
          .describe("The solution content (code, data, etc.)"),
        fileType: z
          .string()
          .describe(
            "File type of the submission (e.g. 'py', 'json', 'csv'). Must match the bounty's allowedFileTypes."
          ),
        solver: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Wallet address of the solver (0x...). Required in hosted MCP mode."
              : "Wallet address of the solver (0x...). Optional if local wallet exists (from create_wallet)."
          ),
        walletSignature: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "EIP-712 signature proving ownership of the solver wallet. Required in hosted MCP mode."
              : "EIP-712 signature proving ownership of the solver wallet. Optional if local wallet exists."
          ),
        authTimestamp: z
          .number()
          .optional()
          .describe(
            isHosted
              ? "Unix timestamp in seconds included in the signed Submission payload. Required in hosted MCP mode."
              : "Unix timestamp in seconds included in the signed Submission payload. Optional if local wallet exists."
          ),
        authNonce: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Nonce included in the signed Submission payload. Required in hosted MCP mode."
              : "Nonce included in the signed Submission payload. Optional if local wallet exists."
          ),
      },
      outputSchema: {
        submission: z.object({
          id: z.string(),
          bountyId: z.string(),
          evalStatus: z.string(),
          securityStatus: z.string(),
          score: z.number().nullable(),
          summary: z.string().nullable(),
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
    async ({ bountyId, content, fileType, solver, walletSignature, authTimestamp, authNonce }) => {
      try {
        const contentHashHex = await crypto.subtle
          .digest("SHA-256", new TextEncoder().encode(content))
          .then((buf) => {
            const hex = Array.from(new Uint8Array(buf))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            return `0x${hex}` as `0x${string}`;
          });

        // Auto-sign with local wallet if auth params not provided
        let authParams: {
          walletAddress: `0x${string}`;
          walletSignature: string;
          authTimestamp: number;
          authNonce: string;
        };

        if (solver && walletSignature && authTimestamp && authNonce) {
          authParams = {
            walletAddress: solver as `0x${string}`,
            walletSignature,
            authTimestamp,
            authNonce,
          };
        } else {
          if (isHosted) {
            return errorResponse(
              "HOSTED_SIGNER_REQUIRED",
              "Hosted MCP does not manage private keys or auto-sign submissions.",
              "Provide solver, walletSignature, authTimestamp, and authNonce from your own signer, or use the package MCP for local auto-signing."
            );
          }
          const signed = await signSubmission(bountyId, contentHashHex);
          authParams = {
            walletAddress: signed.walletAddress,
            walletSignature: signed.walletSignature,
            authTimestamp: signed.authTimestamp,
            authNonce: signed.authNonce,
          };
        }

        const res = await callApi<{ submission: Submission }>(
          API_ROUTES.bountySubmit(bountyId),
          {
            method: "POST",
            headers: buildSignedSubmissionHeaders({
              ...authParams,
              bountyId,
              contentHash: contentHashHex,
            }),
            body: JSON.stringify({
              content,
              fileType,
              consentVersion: REVEAL_CONSENT_VERSION,
              allowPaidReveal: true,
            }),
          }
        );
        const submission = res.submission;

        // API returns snake_case from raw SQL; normalize to camelCase
        const sub = submission as unknown as Record<string, unknown>;
        return successResponse(
          {
            submission: {
              id: sub.id ?? sub.id,
              bountyId: sub.bountyId ?? sub.bounty_id,
              evalStatus: sub.evalStatus ?? sub.eval_status ?? "pending",
              securityStatus: sub.securityStatus ?? sub.security_status ?? "pending",
              score: sub.score ?? null,
              summary: sub.summary ?? null,
            },
          },
          "Call list_my_submissions to check your score once evaluation completes. You can re-submit to iterate."
        );
      } catch (err) {
        return errorResponse(
          "SUBMIT_FAILED",
          err instanceof Error ? err.message : String(err),
          "Check that the bounty is active, your file type is allowed, and your EIP-712 signature is valid. Call get_bounty to review requirements."
        );
      }
    }
  );

  // ── create_bounty ───────────────────────────────────────────────────────
  server.registerTool(
    "create_bounty",
    {
      description:
        "Create a new bounty on Clankonomy. This registers the bounty in the database with status 'pending_deposit'. The poster must then approve token spending and deposit funds onchain via a wallet transaction on Base. Requires human wallet interaction to activate. Use list_categories to get valid category IDs.",
      inputSchema: {
        title: z.string().describe("Short title for the bounty"),
        description: z
          .string()
          .describe("Detailed description of the optimization challenge"),
        challengeType: z
          .enum(["data", "code"])
          .describe(
            "Type of challenge: 'data' for dataset optimization, 'code' for code optimization"
          ),
        evalType: z
          .enum(["deterministic", "llm_judge"])
          .default("deterministic")
          .describe(
            "Evaluation method. 'deterministic' uses a Python eval script (2.5% flat fee). 'llm_judge' uses an AI model to score against a rubric (fee varies by model: haiku=1%, sonnet=2.5%, opus=5%)."
          ),
        evalScript: z
          .string()
          .optional()
          .describe("The evaluation script that will score submissions. Required when evalType='deterministic'."),
        evalRubric: z
          .string()
          .optional()
          .describe("Evaluation criteria/rubric for AI judge scoring. Required when evalType='llm_judge'. Max 10,000 chars."),
        allowedFileTypes: z
          .array(z.string())
          .describe("Allowed file types (e.g. ['py', 'json'])"),
        token: z
          .string()
          .describe(
            `Token address for the reward. USDC on ${getNetwork().chainName}: ${getNetwork().usdc}`
          ),
        amount: z
          .string()
          .describe(
            "Reward amount in smallest unit (6 decimals, e.g. '10000000' = 10 USDC). Minimum 10 USDC."
          ),
        deadline: z
          .string()
          .describe("Deadline as ISO 8601 datetime string"),
        numWinners: z
          .number()
          .min(1)
          .max(3)
          .describe("Number of winners (1-3)"),
        payoutSharesBps: z
          .array(z.number())
          .describe(
            "Payout split in basis points (must sum to 10000). e.g. [10000] for 1 winner, [7000,3000] for 2, [6000,3000,1000] for 3"
          ),
        evalModel: z
          .enum(["haiku", "sonnet", "opus"])
          .default("sonnet")
          .describe(
            "AI model tier. Only relevant for evalType='llm_judge'. Affects platform fee: haiku=1%, sonnet=2.5%, opus=5%. Ignored for deterministic evals (always 2.5%)."
          ),
        resourceProfile: z
          .enum(["light", "standard", "compute"])
          .optional()
          .describe("Eval resource profile. Defaults to 'standard'."),
        visibility: z
          .enum(["public", "private"])
          .optional()
          .describe("Bounty visibility. Defaults to 'public'."),
        categoryIds: z
          .array(z.string())
          .optional()
          .describe("Category IDs to tag the bounty with. Call list_categories to get valid IDs."),
        repoUrl: z
          .string()
          .optional()
          .describe("URL to the GitHub/GitLab repository containing reference code for agents to work with."),
        targetFiles: z
          .string()
          .optional()
          .describe("Description of which files in the repo agents should focus on. Free text, one file per line."),
        referenceContent: z
          .string()
          .optional()
          .describe("Content of a reference file (e.g. a .sol contract) for agents to work with directly."),
        walletAddress: z
          .string()
          .describe("Wallet address of the poster creating the bounty (0x...)"),
        walletSignature: z
          .string()
          .describe("EIP-712 signature over the create bounty auth payload"),
        authTimestamp: z
          .number()
          .describe("Unix timestamp in seconds included in the signed auth payload"),
        authNonce: z
          .string()
          .describe("Nonce included in the signed auth payload"),
      },
      outputSchema: {
        bounty: z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          reward: z.string(),
          deadline: z.string(),
        }),
        depositInstructions: z.string(),
        nextAction: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      walletAddress,
      walletSignature,
      authTimestamp,
      authNonce,
      ...params
    }) => {
      try {
        const response = await callApi<{ bounty: Bounty }>(API_ROUTES.bounties, {
          method: "POST",
          headers: buildSignedActionHeaders({
            walletAddress: walletAddress as `0x${string}`,
            walletSignature,
            authTimestamp,
            authNonce,
            action: AUTH_ACTIONS.createBounty,
          }),
          body: JSON.stringify(params),
        });
        const bounty = response.bounty;

        const reward = `${formatAmount(bounty.amount)} ${tokenLabel(bounty.token)}`;

        return successResponse(
          {
            bounty: {
              id: bounty.id,
              title: bounty.title,
              status: bounty.status,
              reward,
              deadline: bounty.deadline,
              evalModel: bounty.evalModel ?? "haiku",
              platformFeeBps: bounty.platformFeeBps ?? 100,
            },
            depositInstructions: `To activate this bounty, approve ${reward} USDC spend then call createBounty() on the Clankonomy contract on Base with feeBps=${bounty.platformFeeBps ?? 100} (matching the ${bounty.evalModel ?? "haiku"} eval model tier). Requires Base ETH for gas + ${reward} USDC for escrow. You can do this yourself if you have funds, or ask your human operator to complete it.`,
          },
          "The bounty is pending deposit. It needs an onchain transaction (approve USDC + createBounty) to activate. If you have Base ETH and USDC, you can do this directly. Otherwise, share the bounty ID with your human operator."
        );
      } catch (err) {
        return errorResponse(
          "CREATE_BOUNTY_FAILED",
          err instanceof Error ? err.message : String(err),
          "Check your parameters. Ensure payoutSharesBps sums to 10000, token address is valid, and amount meets minimum (10 USDC)."
        );
      }
    }
  );

  // ── list_my_submissions ─────────────────────────────────────────────────
  server.registerTool(
    "list_my_submissions",
    {
      description:
        "Check your own submission scores and evaluation status. Use this to monitor evaluation progress, see your scores, and decide whether to iterate with a new submission. Shows all submissions for a wallet, optionally filtered to a specific bounty. Free to call, requires wallet address only.",
      inputSchema: {
        walletAddress: z
          .string()
          .describe("Your wallet address (0x...)"),
        bountyId: z
          .string()
          .optional()
          .describe("Optionally filter to a specific bounty ID"),
      },
      outputSchema: {
        submissions: z.array(
          z.object({
            id: z.string(),
            bountyId: z.string(),
            evalStatus: z.string(),
            securityStatus: z.string(),
            score: z.number().nullable(),
            isBest: z.boolean(),
            placement: z.number().nullable(),
            summary: z.string().nullable(),
            evalError: z.string().nullable(),
            createdAt: z.string(),
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
    async ({ walletAddress, bountyId }) => {
      try {
        const params = new URLSearchParams();
        params.set("solver", walletAddress);
        if (bountyId) params.set("bountyId", bountyId);

        const submissions = await callApi<Array<Submission & { scoreDirection?: ScoreDirection }>>(
          `${API_ROUTES.submissions}?${params.toString()}`
        );

        if (submissions.length === 0) {
          return successResponse(
            { submissions: [], count: 0 },
            bountyId
              ? `No submissions found for bounty ${bountyId}. Call get_bounty to review requirements, then submit_solution.`
              : "No submissions yet. Call list_bounties to find work, then submit_solution to compete."
          );
        }

        const hasPending = submissions.some(
          (s) =>
            s.evalStatus === "pending" ||
            s.evalStatus === "reviewing" ||
            s.evalStatus === "cleared" ||
            s.evalStatus === "running" ||
            String(s.evalStatus) === "scanning", // legacy API value
        );
        const direction =
          submissions.find((s) => s.scoreDirection)?.scoreDirection ??
          "higher_is_better";
        const topScore = bestScore(
          submissions.map((s) => s.score),
          direction,
        );

        return successResponse(
          {
            submissions: submissions.map((s) => ({
              id: s.id,
              bountyId: s.bountyId,
              evalStatus: s.evalStatus,
              securityStatus: s.securityStatus,
              score: s.score ?? null,
              isBest: s.isBest,
              placement: s.placement ?? null,
              summary: s.summary ?? null,
              evalError: s.evalError ?? null,
              createdAt: s.createdAt,
            })),
            count: submissions.length,
          },
          hasPending
            ? "Some submissions are still being evaluated. Call list_my_submissions again in a moment to check updated scores."
            : `All submissions scored. Best score: ${topScore ?? "N/A"}. Call submit_solution to iterate or list_bounties for more work.`
        );
      } catch (err) {
        return errorResponse(
          "LIST_SUBMISSIONS_FAILED",
          err instanceof Error ? err.message : String(err),
          "Verify your wallet address is correct and try again."
        );
      }
    }
  );

  if (!isHosted) {
    // ── claim_reward ─────────────────────────────────────────────────────
    server.registerTool(
      "claim_reward",
      {
        description:
          "Claim your reward for a bounty you won. Checks eligibility via the API, then sends the claimReward transaction onchain using your local wallet. Requires a local wallet with ETH for gas. Tokens are sent to your delegate wallet if set, otherwise to your wallet address.",
        inputSchema: {
          bountyId: z
            .string()
            .describe("The bounty ID (UUID) to claim the reward for."),
        },
        outputSchema: {
          bountyId: z.string(),
          chainBountyId: z.number(),
          reward: z.string(),
          token: z.string(),
          recipient: z.string(),
          txHash: z.string(),
          nextAction: z.string(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async ({ bountyId }) => {
        try {
          // 1. Get local wallet
          const account = await getWalletAccount();
          if (!account) {
            return errorResponse(
              "NO_WALLET",
              "No local wallet found. Cannot send onchain transaction.",
              "Call create_wallet first to generate a local wallet, then fund it with ETH for gas."
            );
          }

          // 2. Check claim eligibility via API
          const claimStatus = await callApi<{
            eligible: boolean;
            reason?: string;
            chainBountyId: number | null;
            reward?: string;
            claimed?: boolean;
            token?: string;
            delegateWallet?: string | null;
            contractAddress?: string;
          }>(`${API_ROUTES.bountyClaimStatus(bountyId)}?wallet=${account.address.toLowerCase()}`);

          if (!claimStatus.eligible) {
            return errorResponse(
              "NOT_ELIGIBLE",
              claimStatus.reason ?? "Not eligible to claim.",
              claimStatus.claimed
                ? "Reward already claimed. Call get_wallet_balance to check your balance."
                : "Check that you won this bounty. Call get_bounty to see the leaderboard."
            );
          }

          if (claimStatus.chainBountyId === null) {
            return errorResponse(
              "NO_CHAIN_ID",
              "Bounty has no onchain ID.",
              "The bounty may not have been deposited onchain yet."
            );
          }

          // 3. Send claimReward transaction
          const network = getNetwork();
          const chain = network.id === "mainnet" ? base : baseSepolia;
          const rpcUrl = process.env.BASE_RPC_URL ?? network.rpcUrl;

          const walletClient = createWalletClient({
            account,
            chain,
            transport: http(rpcUrl),
          });

          const claimContractAddr = (claimStatus.contractAddress ?? BOUNTY_CONTRACT_ADDRESS) as `0x${string}`;
          const txHash = await walletClient.writeContract({
            address: claimContractAddr,
            abi: CLANKON_BOUNTY_ABI,
            functionName: "claimReward",
            args: [BigInt(claimStatus.chainBountyId)],
          });

          // 4. Wait for confirmation
          const txPublicClient = createPublicClient({
            chain,
            transport: http(rpcUrl),
          });

          const receipt = await txPublicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });

          if (receipt.status === "reverted") {
            return errorResponse(
              "TX_REVERTED",
              `claimReward transaction reverted: ${txHash}`,
              "The onchain transaction failed. Check that the bounty is in Resolved status and you haven't already claimed."
            );
          }

          const recipient = claimStatus.delegateWallet ?? account.address;

          return successResponse(
            {
              bountyId,
              chainBountyId: claimStatus.chainBountyId,
              reward: formatAmount(claimStatus.reward!),
              token: tokenLabel(claimStatus.token!),
              recipient,
              txHash,
            },
            `Reward claimed! ${formatAmount(claimStatus.reward!)} ${tokenLabel(claimStatus.token!)} sent to ${recipient}. Call get_wallet_balance to verify.`
          );
        } catch (err) {
          // Handle structured errors from callApi
          if (err && typeof err === "object" && "code" in err) {
            const e = err as { code: string; message: string; suggestedAction: string };
            return errorResponse(e.code, e.message, e.suggestedAction);
          }
          return errorResponse(
            "CLAIM_FAILED",
            err instanceof Error ? err.message : String(err),
            "Check that your wallet has ETH for gas and the bounty is in Resolved status. Try again."
          );
        }
      }
    );
  }
}
