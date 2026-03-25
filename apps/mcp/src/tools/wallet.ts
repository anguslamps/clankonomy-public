import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir, chmod, access } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, getAddress, formatEther, formatUnits, erc20Abi } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Address } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { getNetwork, USDC_ADDRESS } from "@clankonomy/shared";
import { successResponse, errorResponse } from "../helpers.js";
import type { ServerMode } from "../server.js";

// ─── Wallet path ─────────────────────────────────────────────────────────────

const WALLET_DIR = join(homedir(), ".clankonomy");
const WALLET_PATH = join(WALLET_DIR, "wallet.json");

// ─── Memoized public client (reused across calls) ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
let _clientNetworkId: string | null = null;

function getPublicClient() {
  const network = getNetwork();
  // Recreate if network changed (testnet ↔ mainnet)
  if (_client && _clientNetworkId === network.id) return _client;

  const chain = network.id === "mainnet" ? base : baseSepolia;
  _client = createPublicClient({
    chain,
    transport: http(network.rpcUrl),
    batch: {
      multicall: true, // Batch concurrent reads into a single multicall3 call
    },
  });
  _clientNetworkId = network.id;
  return _client;
}

// ─── Wallet loader (exported for signing helpers) ────────────────────────────

export async function getWalletAccount(): Promise<PrivateKeyAccount | null> {
  try {
    await access(WALLET_PATH);
    const raw = await readFile(WALLET_PATH, "utf-8");
    const { privateKey } = JSON.parse(raw) as { privateKey: string };
    return privateKeyToAccount(privateKey as `0x${string}`);
  } catch {
    return null;
  }
}

// ─── Suggested wallet path for agents ────────────────────────────────────────

const SUGGESTED_WALLET_PATH = "~/.clankonomy/wallet.json";

// ─── Tool registration ──────────────────────────────────────────────────────

export function registerWalletTools(
  server: McpServer,
  options: { mode: ServerMode }
): void {
  const isHosted = options.mode === "hosted";

  // ── create_wallet ─────────────────────────────────────────────────────
  if (!isHosted) {
    // Local/stdio mode: generate and store on disk
    server.registerTool(
      "create_wallet",
      {
        description:
          "Create a local wallet for signing Clankonomy transactions. Generates a keypair and stores it at ~/.clankonomy/wallet.json. If a wallet already exists, returns the existing address. The private key is never returned in responses. Call this first if you don't have an external wallet.",
        inputSchema: {},
        outputSchema: {
          walletAddress: z.string(),
          created: z.boolean(),
          walletPath: z.string(),
          nextAction: z.string(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        try {
          // Check if wallet already exists
          const existing = await getWalletAccount();
          if (existing) {
            return successResponse(
              {
                walletAddress: existing.address,
                created: false,
                walletPath: WALLET_PATH,
              },
              "Wallet already exists. Call register_agent to set up your profile, or submit_solution to compete on a bounty."
            );
          }

          // Generate new wallet
          const privateKey = generatePrivateKey();
          const account = privateKeyToAccount(privateKey);

          // Write wallet file
          await mkdir(WALLET_DIR, { recursive: true });
          await writeFile(
            WALLET_PATH,
            JSON.stringify(
              { address: account.address, privateKey },
              null,
              2
            ),
            { mode: 0o600 }
          );
          // Ensure permissions even if mode flag is ignored
          await chmod(WALLET_PATH, 0o600);

          return successResponse(
            {
              walletAddress: account.address,
              created: true,
              walletPath: WALLET_PATH,
            },
            "Wallet created. Call register_agent to set up your agent profile on Clankonomy."
          );
        } catch (err) {
          return errorResponse(
            "CREATE_WALLET_FAILED",
            err instanceof Error ? err.message : String(err),
            "Check file system permissions for ~/.clankonomy/ and try again."
          );
        }
      }
    );
  }

  // ── get_wallet_balance ────────────────────────────────────────────────
  server.registerTool(
    "get_wallet_balance",
    {
      description:
        "Check USDC and ETH balances for a wallet on Base. Defaults to your local wallet if no address is provided. Use this to verify you have funds before creating bounties or to check reward payouts.",
      inputSchema: {
        walletAddress: z
          .string()
          .optional()
          .describe(
            isHosted
              ? "Wallet address to check (0x...). Required in hosted MCP mode because the server does not manage local wallets."
              : "Wallet address to check (0x...). Defaults to the local wallet from create_wallet."
          ),
      },
      outputSchema: {
        walletAddress: z.string(),
        ethBalance: z.string(),
        usdcBalance: z.string(),
        chain: z.string(),
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
        let address: Address;

        if (walletAddress) {
          address = getAddress(walletAddress); // Checksum-validate input
        } else {
          if (isHosted) {
            return errorResponse(
              "HOSTED_WALLET_ADDRESS_REQUIRED",
              "Hosted MCP does not manage or inspect a local wallet.",
              "Provide walletAddress explicitly, or use the package MCP if you want local-wallet defaults."
            );
          }
          const account = await getWalletAccount();
          if (!account) {
            return errorResponse(
              "NO_WALLET",
              "No local wallet found and no walletAddress provided.",
              "Call create_wallet first, or provide a walletAddress parameter."
            );
          }
          address = account.address;
        }

        const client = getPublicClient();
        const network = getNetwork();

        // Multicall batching combines these into a single RPC round-trip
        const [ethBalance, usdcBalance] = await Promise.all([
          client.getBalance({ address }),
          client.readContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        ]);

        return successResponse(
          {
            walletAddress: address,
            ethBalance: `${formatEther(ethBalance)} ETH`,
            usdcBalance: `${formatUnits(usdcBalance, 6)} USDC`,
            chain: network.chainName,
          },
          "Agent wallets don't need ETH — all actions use off-chain EIP-712 signatures. USDC rewards route to your delegate (cold) wallet if set."
        );
      } catch (err) {
        return errorResponse(
          "BALANCE_CHECK_FAILED",
          err instanceof Error ? err.message : String(err),
          "Check the wallet address format and try again. The RPC endpoint may be temporarily unavailable."
        );
      }
    }
  );
}
