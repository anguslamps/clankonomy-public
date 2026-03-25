import type { Address } from "viem";
import type { EvalModelTier } from "./constants";

// ─── On-chain types ──────────────────────────────────────────────────────────

export enum BountyStatus {
  Active = 0,
  Resolved = 1,
  Claimed = 2,
  Cancelled = 3,
}

export interface PayoutConfig {
  numWinners: number; // 1-3
  sharesBps: number[]; // e.g. [6000, 3000, 1000], must sum to 10000
}

export interface OnChainBounty {
  poster: Address;
  token: Address;
  amount: bigint;
  deadline: bigint;
  evalHash: `0x${string}`;
  metadataURI: string;
  numWinners: number;
  status: BountyStatus;
}

// ─── API / DB types ──────────────────────────────────────────────────────────

export type BountyVisibility = "public" | "private";
export type ResourceProfile = "light" | "standard" | "compute";
export type ScoreDirection = "higher_is_better" | "lower_is_better";
export type BountyDbStatus =
  | "pending_deposit"
  | "active"
  | "evaluating"
  | "resolved"
  | "claimed"
  | "cancelled";
export type EvalStatus =
  | "pending"
  | "reviewing"
  | "cleared"
  | "running"
  | "scored"
  | "failed"
  | "flagged"
  | "rejected";
export type SecurityStatus = "pending" | "pass" | "flag" | "reject";
export type HireStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "completed"
  | "disputed"
  | "cancelled";
export type ReputationEventType =
  | "bounty_win"
  | "bounty_place"
  | "hire_completed"
  | "hire_failed";
export type CategorySource = "poster" | "auto";
export type EvalType = "deterministic" | "llm_judge";

export interface Bounty {
  id: string;
  chainBountyId: number | null;
  contractAddress: string | null;
  poster: Address;
  title: string;
  description: string;
  challengeType: string;
  evalType: EvalType;
  evalScript: string | null;
  evalRubric: string | null;
  evalHash: string;
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  token: Address;
  amount: string;
  deadline: string;
  metadataURI: string;
  numWinners: number;
  payoutSharesBps: number[];
  resourceProfile: ResourceProfile;
  scoreDirection: ScoreDirection;
  evalModel: string | null;
  platformFeeBps: number | null;
  evalSummary: string | null;
  exampleSubmissionFormat: string | null;
  repoUrl: string | null;
  targetFiles: string | null;
  referenceContent: string | null;
  status: BountyDbStatus;
  visibility: BountyVisibility;
  hireId: string | null;
  invitedSolvers: string[] | null;
  categories: Category[];
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  bountyId: string;
  solver: Address;
  content: string;
  contentHash: string;
  fileType: string;
  score: number | null;
  isBest: boolean;
  placement: number | null;
  summary: string | null;
  securityStatus: SecurityStatus;
  evalStatus: EvalStatus;
  evalError: string | null;
  evalDurationMs: number | null;
  consentVersion: string | null;
  allowPaidReveal: boolean;
  consentAcceptedAt: string | null;
  consentSignature: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevealBundle {
  bountyId: string;
  chainBountyId: number | null;
  contractAddress: string | null;
  status: "pending" | "available";
  bundlePrice: string | null;
  currencyToken: Address;
  revealCount: number;
  buyerHasAccess: boolean;
  posterHasWinnerAccess: boolean;
  isEligibleSeller: boolean;
  sellerRank: number | null;
  sellerShareBps: number | null;
  revealRevenueClaimed: string | null;
  revealRevenueAvailable: string | null;
  totalRevealRevenue: string | null;
  purchasedAt: string | null;
}

export interface RevealedSubmission {
  rank: number;
  solver: Address;
  score: number | null;
  summary: string | null;
  fileType: string;
  content: string;
  shareBps: number;
  submissionId: string;
  submittedAt: string;
}

export interface BountyWithSubmissions extends Bounty {
  submissions: Submission[];
  submissionCount: number;
  topScore: number | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface Agent {
  id: string;
  walletAddress: string;
  displayName: string | null;
  description: string | null;
  avatarUrl: string | null;
  delegateWallet: string | null;
  erc8004TokenId: number | null;
  erc8004MintTxHash: string | null;
  erc8004MintStatus: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWithReputation extends Agent {
  reputation: ReputationScore[];
  overallScore: number;
  winCount: number;
  totalEarned: string;
}

export interface ReputationScore {
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  score: number;
  winCount: number;
  totalEntries: number;
  totalEarned: string;
  lastActive: string;
}

export interface ReputationEvent {
  id: string;
  agentId: string;
  bountyId: string;
  categoryId: string;
  eventType: ReputationEventType;
  points: number;
  placement: number | null;
  bountyValue: string;
  createdAt: string;
}

export interface Hire {
  id: string;
  posterWallet: string;
  agentId: string;
  bountyId: string | null;
  title: string;
  description: string;
  context: string | null;
  categoryIds: string[];
  budgetToken: string;
  budgetAmount: string;
  status: HireStatus;
  deadline: string;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvalRun {
  id: string;
  submissionId: string;
  containerId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  memoryPeakMb: number;
  startedAt: string;
  completedAt: string;
}

// ─── API request/response types ──────────────────────────────────────────────

export interface CreateBountyRequest {
  title: string;
  description: string;
  challengeType?: string;
  evalType?: EvalType;
  evalScript?: string;
  evalRubric?: string;
  evalModel?: EvalModelTier;
  allowedFileTypes: string[];
  maxFileSizeBytes?: number;
  token: Address;
  amount: string;
  deadline: string;
  numWinners: number;
  payoutSharesBps: number[];
  resourceProfile?: ResourceProfile;
  scoreDirection?: ScoreDirection;
  evalSummary?: string;
  exampleSubmissionFormat?: string;
  visibility?: BountyVisibility;
  repoUrl?: string;
  targetFiles?: string;
  referenceContent?: string;
  categoryIds?: string[];
  invitedSolvers?: string[];
}

export interface SubmitSolutionRequest {
  bountyId: string;
  content: string;
  fileType: string;
  consentVersion: string;
  allowPaidReveal: boolean;
  walletSignature: string;
  solver: Address;
}

export interface CreateHireRequest {
  agentId: string;
  title: string;
  description: string;
  categoryIds: string[];
  budgetToken: string;
  budgetAmount: string;
  deadline: string;
}

export interface LeaderboardEntry {
  rank: number;
  solver: Address;
  score: number;
  summary: string | null;
  submittedAt: string;
}

export interface AgentRecommendation {
  agent: AgentWithReputation;
  relevanceScore: number;
  matchedCategories: Category[];
}

export interface UserProfile {
  id: string;
  walletAddress: string;
  displayName: string | null;
  twitterHandle: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Games types ────────────────────────────────────────────────────────────

export type GameMatchStatus = "created" | "waiting" | "staking" | "executing" | "scoring" | "complete" | "cancelled" | "void";
export type GameMatchResult = "player_a_win" | "player_b_win" | "draw" | "void";
export type GameTypeStatus = "hidden" | "active" | "disabled";
export type GameScenarioStatus = "pending" | "active" | "disabled" | "rejected";
export type LoadoutValidationStatus = "pending" | "safe" | "blocked";
export type GameRoundActor = "player_a" | "player_b" | "system";
export type GameCategory = "standard" | "quick-fire";
