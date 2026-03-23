// ─── Network Configuration ──────────────────────────────────────────────────
// Single source of truth for testnet vs mainnet chain-specific values.
// Controlled by NEXT_PUBLIC_NETWORK (frontend) or NETWORK (backend) env var.
// Defaults to "mainnet" if not set.

import type { Address } from "viem";

export type NetworkId = "testnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  blockExplorer: string;
  usdc: Address;
  bountyContract: Address;
  lzChainKey: string;
  erc8004IdentityRegistry: Address;
  erc8004ReputationRegistry: Address;
  erc8183Adapter: Address;
}

// ─── Base Sepolia (Testnet) ─────────────────────────────────────────────────

export const TESTNET: NetworkConfig = {
  id: "testnet",
  chainId: 84532,
  chainName: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  bountyContract: "0xeB098B29fA51BE684Fc47114d49338edBD4fD0dD",
  lzChainKey: "base-sepolia",
  erc8004IdentityRegistry: "0x8004A8180091dE6a790b6D4e75e06673bbc8B9C1",
  erc8004ReputationRegistry: "0x8004B663C27f0e7C2C2b2a5D8E6F4e2b5D3E1A0F",
  erc8183Adapter: "0x0000000000000000000000000000000000000000", // TBD: deploy
};

// ─── Base Mainnet ───────────────────────────────────────────────────────────

export const MAINNET: NetworkConfig = {
  id: "mainnet",
  chainId: 8453,
  chainName: "Base",
  rpcUrl: "https://mainnet.base.org",
  blockExplorer: "https://basescan.org",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  bountyContract: "0x2366bc493e30d9C73bd7e749f62Bc1e707a6e6a2",
  lzChainKey: "base",
  erc8004IdentityRegistry: "0x0000000000000000000000000000000000000000", // TBD: deploy to mainnet
  erc8004ReputationRegistry: "0x0000000000000000000000000000000000000000", // TBD: deploy to mainnet
  erc8183Adapter: "0x0000000000000000000000000000000000000000", // TBD: deploy to mainnet
};

// ─── Network Selection ──────────────────────────────────────────────────────

const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: TESTNET,
  mainnet: MAINNET,
};

/**
 * Get the active network config.
 *
 * Reads from:
 *   - NEXT_PUBLIC_NETWORK (inlined at build time by Next.js)
 *   - NETWORK (runtime, for Bun/Node backends)
 *   - Defaults to "mainnet"
 */
export function getNetwork(): NetworkConfig {
  let env = "mainnet";
  try {
    const g = globalThis as Record<string, unknown>;
    const p = g["process"] as { env?: Record<string, string | undefined> } | undefined;
    if (p?.env) {
      env = p.env["NEXT_PUBLIC_NETWORK"] || p.env["NETWORK"] || "mainnet";
    }
  } catch {
    // No process available (browser without bundler inlining)
  }
  return NETWORKS[env as NetworkId] ?? MAINNET;
}
