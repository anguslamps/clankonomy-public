import { config } from "./config.js";
import {
  AUTH_ACTIONS,
  TOKEN_SYMBOLS,
  buildAuthHeaders,
  buildSubmissionAuthHeaders,
  EIP712_DOMAIN,
  AUTH_TYPES,
  SUBMISSION_TYPES,
  createAuthTimestamp,
  createAuthNonce,
  type AuthAction,
} from "@clankonomy/shared";
import type { Address } from "viem";
import { REVEAL_CONSENT_VERSION } from "@clankonomy/shared";
import { getWalletAccount } from "./tools/wallet.js";

// ─── API Client ─────────────────────────────────────────────────────────────

export async function callApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const signal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(config.apiTimeoutMs)])
    : AbortSignal.timeout(config.apiTimeoutMs);

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Pass through structured API errors
    if (body?.error?.code) {
      throw { code: body.error.code, message: body.error.message, suggestedAction: body.error.suggestedAction };
    }
    throw { code: "API_ERROR", message: body?.error ?? `API returned ${res.status}`, suggestedAction: "Retry the request." };
  }
  return res.json() as Promise<T>;
}

// ─── Response Helpers ───────────────────────────────────────────────────────

/**
 * Format a successful MCP tool result with structured JSON and a nextAction hint.
 */
export function successResponse(data: Record<string, unknown>, nextAction: string) {
  const structured = { ...data, nextAction };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structured, null, 2),
      },
    ],
    structuredContent: structured,
  };
}

/**
 * Format an error MCP tool result with structured error information.
 */
export function errorResponse(
  code: string,
  message: string,
  suggestedAction: string,
) {
  const structured = {
    error: { code, message },
    suggestedAction,
  };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structured, null, 2),
      },
    ],
    isError: true as const,
  };
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

export function tokenLabel(addr: string): string {
  return TOKEN_SYMBOLS[addr as Address] ?? addr.slice(0, 10);
}

export function formatAmount(raw: string, decimals = 6): string {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildSignedActionHeaders(params: {
  walletAddress: Address;
  walletSignature: string;
  authTimestamp: number;
  authNonce: string;
  action: (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];
}) {
  return buildAuthHeaders({
    wallet: params.walletAddress,
    signature: params.walletSignature,
    timestamp: BigInt(params.authTimestamp),
    nonce: params.authNonce,
    action: params.action,
  });
}

export function buildSignedSubmissionHeaders(params: {
  walletAddress: Address;
  walletSignature: string;
  authTimestamp: number;
  authNonce: string;
  bountyId: string;
  contentHash: `0x${string}`;
  consentVersion?: string;
  allowPaidReveal?: boolean;
}) {
  return buildSubmissionAuthHeaders({
    wallet: params.walletAddress,
    signature: params.walletSignature,
    timestamp: BigInt(params.authTimestamp),
    nonce: params.authNonce,
    bountyId: params.bountyId,
    contentHash: params.contentHash,
    consentVersion: params.consentVersion ?? "buy-top-20-v1",
    allowPaidReveal: params.allowPaidReveal ?? true,
  });
}

// ─── Auto-signing helpers (local wallet) ────────────────────────────────────

export interface SignedAuthParams {
  walletAddress: Address;
  walletSignature: string;
  authTimestamp: number;
  authNonce: string;
}

/**
 * Sign an EIP-712 Auth message using the local wallet.
 * Returns the wallet address, signature, timestamp, and nonce.
 */
export async function signAuthAction(action: AuthAction): Promise<SignedAuthParams> {
  const account = await getWalletAccount();
  if (!account) {
    throw {
      code: "NO_WALLET",
      message: "No local wallet found. Call create_wallet first, or provide wallet signature parameters manually.",
      suggestedAction: "Call create_wallet to generate a local wallet.",
    };
  }

  const timestamp = createAuthTimestamp();
  const nonce = createAuthNonce();

  const signature = await account.signTypedData({
    domain: EIP712_DOMAIN,
    types: AUTH_TYPES,
    primaryType: "Auth" as const,
    message: {
      wallet: account.address,
      action,
      timestamp,
      nonce,
    },
  });

  return {
    walletAddress: account.address,
    walletSignature: signature,
    authTimestamp: Number(timestamp),
    authNonce: nonce,
  };
}

/**
 * Sign an EIP-712 Submission message using the local wallet.
 * Returns the wallet address, signature, timestamp, and nonce.
 */
export async function signSubmission(
  bountyId: string,
  contentHash: `0x${string}`,
): Promise<SignedAuthParams> {
  const account = await getWalletAccount();
  if (!account) {
    throw {
      code: "NO_WALLET",
      message: "No local wallet found. Call create_wallet first, or provide wallet signature parameters manually.",
      suggestedAction: "Call create_wallet to generate a local wallet.",
    };
  }

  const timestamp = createAuthTimestamp();
  const nonce = createAuthNonce();

  const signature = await account.signTypedData({
    domain: EIP712_DOMAIN,
    types: SUBMISSION_TYPES,
    primaryType: "Submission" as const,
    message: {
      bountyId,
      contentHash,
      solver: account.address,
      consentVersion: REVEAL_CONSENT_VERSION,
      allowPaidReveal: true,
      timestamp,
      nonce,
    },
  });

  return {
    walletAddress: account.address,
    walletSignature: signature,
    authTimestamp: Number(timestamp),
    authNonce: nonce,
  };
}
