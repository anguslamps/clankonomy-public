import { type Address } from "viem";
import { getNetwork } from "./networks";
import { AUTH_TYPES, SUBMISSION_TYPES } from "./auth";

// ─── Active Network ─────────────────────────────────────────────────────────
// All chain-specific values derived from the active network config.
// Set NEXT_PUBLIC_NETWORK=mainnet or NETWORK=mainnet to switch.

const network = getNetwork();

export const BASE_CHAIN_ID = network.chainId;

// ─── Tokens ─────────────────────────────────────────────────────────────────

export const USDC_ADDRESS: Address = network.usdc;

export const ALLOWED_TOKENS = [USDC_ADDRESS] as const;

export const TOKEN_DECIMALS: Record<Address, number> = {
  [USDC_ADDRESS]: 6,
};

export const TOKEN_SYMBOLS: Record<Address, string> = {
  [USDC_ADDRESS]: "USDC",
};

// ─── Contract ────────────────────────────────────────────────────────────────

export const BOUNTY_CONTRACT_ADDRESS: Address = network.bountyContract;

// ─── Platform ────────────────────────────────────────────────────────────────

export const PLATFORM_FEE_BPS = 250; // 2.5% (legacy default)
export const DETERMINISTIC_FEE_BPS = 250; // 2.5% flat fee for deterministic script evals
export const LLM_JUDGE_MAX_RUBRIC_LENGTH = 10_000;

// ─── Eval Model Tiers ──────────────────────────────────────────────────────

export const EVAL_MODEL_TIERS = {
  haiku: {
    model: "claude-haiku-4-5",
    label: "Haiku 4.5",
    description: "Fast, lightweight",
    feeBps: 100,
    feePercent: "1%",
  },
  sonnet: {
    model: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Balanced",
    feeBps: 250,
    feePercent: "2.5%",
  },
  opus: {
    model: "claude-opus-4-6",
    label: "Opus 4.6",
    description: "Most capable",
    feeBps: 500,
    feePercent: "5%",
  },
} as const;

export type EvalModelTier = keyof typeof EVAL_MODEL_TIERS;
export const MIN_BOUNTY_DURATION_HOURS = 1;
export const GRACE_PERIOD_DAYS = 7;
export const MAX_WINNERS = 3;
export const MIN_BOUNTY_AMOUNT = 1_000_000; // 1 USDC (6 decimals)
export const REVEAL_TOP_N = 20;
export const REVEAL_MIN_PRICE = 5_000_000; // 5 USDC
export const REVEAL_MAX_PRICE = 100_000_000; // 100 USDC
export const REVEAL_PRICE_BPS = 500; // 5%
export const REVEAL_CONSENT_VERSION = "buy-top-20-v1";

// ─── Payout Presets ──────────────────────────────────────────────────────────

export const PAYOUT_PRESETS = {
  single: { numWinners: 1, sharesBps: [10000] },
  top2: { numWinners: 2, sharesBps: [7000, 3000] },
  top3: { numWinners: 3, sharesBps: [6000, 3000, 1000] },
} as const;

// ─── Categories ──────────────────────────────────────────────────────────────

export type SecurityProfile = "solidity" | "security-audit" | "code-execution" | "generic";

export interface CategoryConfig {
  readonly name: string;
  readonly description: string;
  readonly allowedFileTypes: readonly string[];
  readonly securityProfile: SecurityProfile;
  readonly evalGuidance: string;
}

const _CATEGORY_CONFIGS = {
  "smart-contracts": {
    name: "Smart Contracts",
    description: "Write, audit, or optimize smart contracts",
    allowedFileTypes: ["sol", "md"],
    securityProfile: "solidity",
    evalGuidance:
      "Compile the .sol (parse solc JSON output or Foundry test results), or score the .md report against a ground truth vulnerability/requirement list. SCORE based on test pass rate, gas efficiency, or finding coverage.",
  },
  security: {
    name: "Security",
    description: "Audit contracts, find vulnerabilities, write security recommendations",
    allowedFileTypes: ["sol", "md", "json"],
    securityProfile: "security-audit",
    evalGuidance:
      "Compare findings against ground truth vulnerability list. For JSON: parse findings array, score precision/recall. For .md: extract finding headers, match against expected issues. SCORE as F1 or weighted coverage.",
  },
  "ai-agents": {
    name: "AI & Agents",
    description: "Prompt engineering, agent building, model orchestration, MCP integrations, evaluation pipelines",
    allowedFileTypes: ["py", "js", "ts", "json", "md"],
    securityProfile: "code-execution",
    evalGuidance:
      "Test agent/prompt against scenario suite. For prompts: run against test inputs, score output quality. For agent code: execute with mock tools, measure task completion. SCORE as success rate or quality metric.",
  },
  algorithms: {
    name: "Algorithms & Data",
    description: "Optimize functions, process datasets, solve computational challenges",
    allowedFileTypes: ["py", "js", "ts", "rs", "go", "csv", "json"],
    securityProfile: "code-execution",
    evalGuidance:
      "Run submitted code against test cases or validate data output against expected results. Measure correctness (pass/fail), then efficiency (runtime/memory). For data: compare against ground truth. Single SCORE.",
  },
  miscellaneous: {
    name: "Miscellaneous",
    description: "Catch-all for bounties that don't fit other categories",
    allowedFileTypes: ["py", "js", "ts", "sol", "rs", "go", "csv", "json", "md", "txt"],
    securityProfile: "generic",
    evalGuidance:
      "Define your own criteria. Read SUBMISSION_FILE, print SCORE: <number>. Be explicit about scoring in your bounty description.",
  },
} as const satisfies Record<string, CategoryConfig>;

export type CategorySlug = keyof typeof _CATEGORY_CONFIGS;

export const CATEGORY_CONFIGS: { readonly [K in CategorySlug]: CategoryConfig } = _CATEGORY_CONFIGS;

export const CATEGORY_SLUGS: CategorySlug[] = Object.keys(_CATEGORY_CONFIGS) as CategorySlug[];

export const CATEGORY_NAMES: Record<CategorySlug, string> = Object.fromEntries(
  Object.entries(_CATEGORY_CONFIGS).map(([slug, cfg]) => [slug, cfg.name]),
) as Record<CategorySlug, string>;

// ─── Reputation ──────────────────────────────────────────────────────────────

export const REPUTATION = {
  DECAY_HALF_LIFE_DAYS: 90,
  PLACEMENT_MULTIPLIERS: [1.0, 0.5, 0.25] as const,
  PARTICIPATION_MULTIPLIER: 0.05,
  HIRE_COMPLETED_MULTIPLIER: 0.75,
  HIRE_FAILED_MULTIPLIER: -0.5,
  CACHE_REFRESH_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
} as const;

// ─── EIP-712 ─────────────────────────────────────────────────────────────────

export const EIP712_DOMAIN = {
  name: "Clankonomy",
  version: "1",
  chainId: BASE_CHAIN_ID,
} as const;

export { AUTH_TYPES, SUBMISSION_TYPES };
