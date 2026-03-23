import type { Address } from "viem";

export const AUTH_HEADER_NAMES = {
  wallet: "x-wallet-address",
  signature: "x-signature",
  timestamp: "x-timestamp",
  nonce: "x-nonce",
  action: "x-action",
  bountyId: "x-bounty-id",
  contentHash: "x-content-hash",
  consentVersion: "x-consent-version",
  allowPaidReveal: "x-allow-paid-reveal",
} as const;

export const AUTH_ACTIONS = {
  createBounty: "bounties:create",
  recordCreateTx: "bounties:record_create_tx",
  cancelBounty: "bounties:cancel",
  viewSubmission: "submissions:view",
  createHire: "hires:create",
  acceptHire: "hires:accept",
  addHireContext: "hires:add_context",
  registerAgent: "agents:register",
  delegateWallet: "agents:delegate_wallet",
  updateUserProfile: "users:update_profile",
  recordRevealPurchaseTx: "bounties:record_reveal_purchase_tx",
  viewRevealedSubmissions: "bounties:view_revealed_submissions",
} as const;

export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];

export interface AuthMessage {
  wallet: Address;
  action: AuthAction;
  timestamp: bigint;
  nonce: string;
}

export interface SubmissionAuthMessage {
  bountyId: string;
  contentHash: `0x${string}`;
  solver: Address;
  consentVersion: string;
  allowPaidReveal: boolean;
  timestamp: bigint;
  nonce: string;
}

export const AUTH_TYPES = {
  Auth: [
    { name: "wallet", type: "address" },
    { name: "action", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;

export const SUBMISSION_TYPES = {
  Submission: [
    { name: "bountyId", type: "string" },
    { name: "contentHash", type: "bytes32" },
    { name: "solver", type: "address" },
    { name: "consentVersion", type: "string" },
    { name: "allowPaidReveal", type: "bool" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;

export function createAuthTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function createAuthNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildAuthMessage(
  wallet: Address,
  action: AuthAction,
  timestamp: bigint,
  nonce: string,
): AuthMessage {
  return { wallet, action, timestamp, nonce };
}

export function buildSubmissionAuthMessage(
  bountyId: string,
  contentHash: `0x${string}`,
  solver: Address,
  consentVersion: string,
  allowPaidReveal: boolean,
  timestamp: bigint,
  nonce: string,
): SubmissionAuthMessage {
  return {
    bountyId,
    contentHash,
    solver,
    consentVersion,
    allowPaidReveal,
    timestamp,
    nonce,
  };
}

export function buildAuthHeaders(params: {
  wallet: Address;
  signature: `0x${string}` | string;
  timestamp: bigint;
  nonce: string;
  action: AuthAction;
}): Record<string, string> {
  return {
    [AUTH_HEADER_NAMES.wallet]: params.wallet,
    [AUTH_HEADER_NAMES.signature]: params.signature,
    [AUTH_HEADER_NAMES.timestamp]: params.timestamp.toString(),
    [AUTH_HEADER_NAMES.nonce]: params.nonce,
    [AUTH_HEADER_NAMES.action]: params.action,
  };
}

export function buildSubmissionAuthHeaders(params: {
  wallet: Address;
  signature: `0x${string}` | string;
  timestamp: bigint;
  nonce: string;
  bountyId: string;
  contentHash: `0x${string}`;
  consentVersion: string;
  allowPaidReveal: boolean;
}): Record<string, string> {
  return {
    [AUTH_HEADER_NAMES.wallet]: params.wallet,
    [AUTH_HEADER_NAMES.signature]: params.signature,
    [AUTH_HEADER_NAMES.timestamp]: params.timestamp.toString(),
    [AUTH_HEADER_NAMES.nonce]: params.nonce,
    [AUTH_HEADER_NAMES.bountyId]: params.bountyId,
    [AUTH_HEADER_NAMES.contentHash]: params.contentHash,
    [AUTH_HEADER_NAMES.consentVersion]: params.consentVersion,
    [AUTH_HEADER_NAMES.allowPaidReveal]: String(params.allowPaidReveal),
  };
}
