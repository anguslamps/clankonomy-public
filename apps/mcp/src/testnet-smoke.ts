import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  API_ROUTES,
  AUTH_ACTIONS,
  AUTH_TYPES,
  BOUNTY_CONTRACT_ADDRESS,
  CLANKON_BOUNTY_ABI,
  EIP712_DOMAIN,
  REVEAL_CONSENT_VERSION,
  SUBMISSION_TYPES,
  buildAuthHeaders,
  createAuthNonce,
  createAuthTimestamp,
  getNetwork,
} from "@clankonomy/shared";
import { baseSepolia } from "viem/chains";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hash,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

type SmokePhase = "phase1" | "phase2" | "full";
type SmokeAccount =
  | ReturnType<typeof privateKeyToAccount>
  | ReturnType<typeof mnemonicToAccount>;

interface SmokeState {
  phase: "phase1-complete" | "phase2-complete";
  walletAddress: Address;
  bountyId: string;
  chainBountyId: number;
  deadlineIso: string;
  createTxHash: Hash;
  submissionId: string;
  submissionScore: number | null;
  rewardClaimTxHash?: Hash;
}

interface SmokeConfig {
  apiUrl: string;
  apiPort: number;
  baseRpcUrl: string;
  databaseUrl?: string;
  network: "testnet";
  phase: SmokePhase;
  startLocalStack: boolean;
  verbose: boolean;
  stateFile: string;
  posterAccount: SmokeAccount;
  oraclePrivateKey: `0x${string}`;
  amount: bigint;
}

interface StartedProcess {
  label: string;
  child: ChildProcessWithoutNullStreams;
}

interface SmokeResult {
  state: SmokeState;
  bountyStatus: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function boolEnv(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "1" || value === "true";
}

function resolveSmokeConfig(): SmokeConfig {
  const network = getNetwork();
  if (network.id !== "testnet") {
    throw new Error(
      `This smoke runner only supports testnet. Active network is ${network.id}.`,
    );
  }

  const phase = (process.env.CLANKONOMY_SMOKE_PHASE ?? "phase1") as SmokePhase;
  const apiPort = Number(process.env.CLANKONOMY_SMOKE_API_PORT ?? "3002");
  const apiUrl =
    process.env.CLANKONOMY_SMOKE_API_URL ?? `http://127.0.0.1:${apiPort}`;
  const baseRpcUrl = process.env.BASE_RPC_URL ?? network.rpcUrl;
  const startLocalStack = !process.env.CLANKONOMY_SMOKE_API_URL;
  const verbose = boolEnv("CLANKONOMY_SMOKE_VERBOSE");
  const stateFile =
    process.env.CLANKONOMY_SMOKE_STATE_FILE ??
    "/tmp/clankonomy-testnet-smoke.json";
  const amount = BigInt(process.env.CLANKONOMY_SMOKE_AMOUNT ?? "1000000");

  const privateKey = process.env.CLANKONOMY_TESTNET_PRIVATE_KEY as
    | `0x${string}`
    | undefined;
  const mnemonic = process.env.CLANKONOMY_TESTNET_MNEMONIC;
  const mnemonicIndex = Number(process.env.CLANKONOMY_TESTNET_ACCOUNT_INDEX ?? "1");

  const posterAccount = privateKey
    ? privateKeyToAccount(privateKey)
    : mnemonic
      ? mnemonicToAccount(mnemonic, { addressIndex: mnemonicIndex })
      : null;

  if (!posterAccount) {
    throw new Error(
      "Set CLANKONOMY_TESTNET_PRIVATE_KEY or CLANKONOMY_TESTNET_MNEMONIC before running the smoke harness.",
    );
  }

  const oraclePrivateKey =
    (process.env.ORACLE_PRIVATE_KEY as `0x${string}` | undefined) ??
    privateKey;

  if (!oraclePrivateKey) {
    throw new Error("Unable to resolve ORACLE_PRIVATE_KEY for the control worker.");
  }

  return {
    apiUrl,
    apiPort,
    baseRpcUrl,
    databaseUrl: process.env.DATABASE_URL,
    network: "testnet",
    phase,
    startLocalStack,
    verbose,
    stateFile,
    posterAccount,
    oraclePrivateKey,
    amount,
  };
}

function createLogger(verbose: boolean, label: string) {
  return (chunk: Buffer | string) => {
    if (!verbose) return;
    process.stderr.write(`[${label}] ${chunk.toString()}`);
  };
}

function spawnProcess(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  verbose: boolean,
): StartedProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "pipe",
  });
  child.stdout.on("data", createLogger(verbose, label));
  child.stderr.on("data", createLogger(verbose, label));
  child.on("exit", (code) => {
    if (code !== 0) {
      process.stderr.write(`[${label}] exited with code ${code}\n`);
    }
  });
  return { label, child };
}

async function killProcess(proc: StartedProcess) {
  if (proc.child.exitCode !== null) return;
  proc.child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => proc.child.once("exit", () => resolve())),
    delay(5_000).then(() => {
      if (proc.child.exitCode === null) {
        proc.child.kill("SIGKILL");
      }
    }),
  ]);
}

async function startLocalStack(config: SmokeConfig) {
  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is required when CLANKONOMY_SMOKE_API_URL is not provided.",
    );
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: config.databaseUrl,
    BASE_RPC_URL: config.baseRpcUrl,
    ORACLE_PRIVATE_KEY: config.oraclePrivateKey,
    NETWORK: config.network,
    EVAL_EXECUTION_ENABLED: "true",
    PORT: String(config.apiPort),
  };

  const processes = [
    spawnProcess(
      "api",
      "pnpm",
      ["--filter", "@clankonomy/api", "start"],
      env,
      config.verbose,
    ),
    spawnProcess(
      "eval-worker",
      "pnpm",
      ["--filter", "@clankonomy/api", "worker:eval"],
      env,
      config.verbose,
    ),
    spawnProcess(
      "control-worker",
      "pnpm",
      ["--filter", "@clankonomy/api", "worker:control"],
      env,
      config.verbose,
    ),
  ];

  try {
    await waitForHealth(config.apiUrl, 60_000);
    return {
      async close() {
        await Promise.allSettled(processes.map(killProcess));
      },
    };
  } catch (error) {
    await Promise.allSettled(processes.map(killProcess));
    throw error;
  }
}

async function waitForHealth(apiUrl: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (res.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for ${apiUrl}/health`);
}

async function waitFor<T>(
  label: string,
  timeoutMs: number,
  fn: () => Promise<T | null>,
): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn();
    if (value !== null) return value;
    await delay(2_000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function callTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const textBlock = content.find(
      (item: unknown): item is { type: "text"; text: string } =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        "text" in item &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    );
    if (textBlock) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw new Error(`${name} returned non-JSON: ${textBlock.text.slice(0, 200)}`);
      }
      if ((result as { isError?: boolean }).isError || parsed.error) {
        const err = parsed.error as { code?: string; message?: string } | undefined;
        throw new Error(
          `${name} failed: ${err?.code ?? "MCP_ERROR"} ${err?.message ?? textBlock.text}${parsed.suggestedAction ? ` (${parsed.suggestedAction})` : ""}`,
        );
      }
      return parsed as T;
    }
  }

  const structured = (result as { structuredContent?: unknown }).structuredContent;
  if (structured && typeof structured === "object") {
    return structured as T;
  }

  throw new Error(`Tool ${name} did not return parseable content`);
}

async function connectMcp(apiUrl: string, verbose: boolean) {
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--filter", "@clankonomy/mcp", "start"],
    cwd: repoRoot,
    env: {
      ...process.env,
      CLANKONOMY_API_URL: apiUrl,
      NETWORK: "testnet",
    },
    stderr: verbose ? "inherit" : "pipe",
  });

  const client = new Client({
    name: "clankonomy-testnet-smoke",
    version: "0.1.0",
  });
  await client.connect(transport);

  return {
    client,
    async close() {
      await transport.close();
    },
  };
}

function buildEvalScript() {
  return [
    "import os",
    "submission_path = os.environ['SUBMISSION_FILE']",
    "with open(submission_path, 'r', encoding='utf-8') as handle:",
    "    content = handle.read().strip()",
    "print(f'SCORE: {len(content)}')",
  ].join("\n");
}

async function signActionHeaders(
  account: SmokeAccount,
  action: (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS],
) {
  const timestamp = createAuthTimestamp();
  const nonce = createAuthNonce();
  const signature = await account.signTypedData({
    domain: EIP712_DOMAIN,
    types: AUTH_TYPES,
    primaryType: "Auth",
    message: {
      wallet: account.address,
      action,
      timestamp,
      nonce,
    },
  });

  return buildAuthHeaders({
    wallet: account.address,
    signature,
    timestamp,
    nonce,
    action,
  });
}

async function signSubmissionPayload(
  account: SmokeAccount,
  bountyId: string,
  content: string,
) {
  const timestamp = createAuthTimestamp();
  const nonce = createAuthNonce();
  const contentHash = (`0x${Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
  ).toString("hex")}`) as `0x${string}`;
  const signature = await account.signTypedData({
    domain: EIP712_DOMAIN,
    types: SUBMISSION_TYPES,
    primaryType: "Submission",
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
    timestamp,
    nonce,
    contentHash,
    signature,
  };
}

async function persistState(stateFile: string, state: SmokeState) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

async function loadState(stateFile: string): Promise<SmokeState> {
  const raw = await readFile(stateFile, "utf8");
  return JSON.parse(raw) as SmokeState;
}

function createClients(config: SmokeConfig) {
  const network = getNetwork();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });
  const walletClient = createWalletClient({
    account: config.posterAccount,
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });

  assert.equal(network.bountyContract, BOUNTY_CONTRACT_ADDRESS);

  return { publicClient, walletClient };
}

async function ensureWalletReady(config: SmokeConfig) {
  const { publicClient } = createClients(config);
  const balance = await publicClient.getBalance({
    address: config.posterAccount.address,
  });
  assert(balance > 0n, "Poster wallet needs Base Sepolia ETH for gas");

  const usdcBalance = (await publicClient.readContract({
    address: getNetwork().usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [config.posterAccount.address],
  })) as bigint;
  assert(
    usdcBalance >= config.amount,
    `Poster wallet needs at least ${config.amount} units of testnet USDC`,
  );
}

async function runPhase1(config: SmokeConfig): Promise<SmokeResult> {
  await ensureWalletReady(config);

  const { publicClient, walletClient } = createClients(config);
  const mcp = await connectMcp(config.apiUrl, config.verbose);

  try {
    const now = Date.now();
    const deadlineDate = new Date(now + 61 * 60 * 1000);
    const deadlineTimestamp = BigInt(Math.floor(deadlineDate.getTime() / 1000));
    const evalScript = buildEvalScript();
    const title = `Smoke ${new Date(now).toISOString()}`;
    const submissionContent = "smoke-test-solution";

    const registerTimestamp = Number(createAuthTimestamp());
    const registerNonce = createAuthNonce();
    const registerSignature = await config.posterAccount.signTypedData({
      domain: EIP712_DOMAIN,
      types: AUTH_TYPES,
      primaryType: "Auth",
      message: {
        wallet: config.posterAccount.address,
        action: AUTH_ACTIONS.registerAgent,
        timestamp: BigInt(registerTimestamp),
        nonce: registerNonce,
      },
    });

    await callTool<{ agent: { walletAddress: string } }>(mcp.client, "register_agent", {
      walletAddress: config.posterAccount.address,
      displayName: "Smoke Runner",
      description: "Automated testnet smoke harness",
      categories: ["miscellaneous"],
      isAvailable: true,
      walletSignature: registerSignature,
      authTimestamp: registerTimestamp,
      authNonce: registerNonce,
    });

    const createTimestamp = Number(createAuthTimestamp());
    const createNonce = createAuthNonce();
    const createSignature = await config.posterAccount.signTypedData({
      domain: EIP712_DOMAIN,
      types: AUTH_TYPES,
      primaryType: "Auth",
      message: {
        wallet: config.posterAccount.address,
        action: AUTH_ACTIONS.createBounty,
        timestamp: BigInt(createTimestamp),
        nonce: createNonce,
      },
    });

    const createResult = await callTool<{
      bounty: { id: string; status: string };
    }>(mcp.client, "create_bounty", {
      walletAddress: config.posterAccount.address,
      walletSignature: createSignature,
      authTimestamp: createTimestamp,
      authNonce: createNonce,
      title,
      description: "Automated pre-deadline smoke path for the launch-hardening flow.",
      challengeType: "data",
      evalScript,
      allowedFileTypes: ["txt"],
      token: getNetwork().usdc,
      amount: config.amount.toString(),
      deadline: deadlineDate.toISOString(),
      numWinners: 1,
      payoutSharesBps: [10000],
      resourceProfile: "light",
      visibility: "public",
      categoryIds: [],
    });

    const bountyId = createResult.bounty.id;
    const bountyCountBefore = (await publicClient.readContract({
      address: BOUNTY_CONTRACT_ADDRESS,
      abi: CLANKON_BOUNTY_ABI,
      functionName: "getBountyCount",
      args: [],
    })) as bigint;

    // Approve max so allowance persists across multiple smoke runs
    const MAX_UINT256 = 2n ** 256n - 1n;
    const currentAllowance = (await publicClient.readContract({
      address: getNetwork().usdc,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [config.posterAccount.address, BOUNTY_CONTRACT_ADDRESS],
    })) as bigint;

    if (currentAllowance < config.amount) {
      const approveHash = await walletClient.writeContract({
        address: getNetwork().usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [BOUNTY_CONTRACT_ADDRESS, MAX_UINT256],
        account: config.posterAccount,
        chain: baseSepolia,
      });
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      });
      assert.equal(approveReceipt.status, "success");
      // Wait for state propagation across Alchemy nodes
      await delay(3_000);
    }

    const createTxHash = await walletClient.writeContract({
      address: BOUNTY_CONTRACT_ADDRESS,
      abi: CLANKON_BOUNTY_ABI,
      functionName: "createBounty",
      args: [
        getNetwork().usdc,
        config.amount,
        deadlineTimestamp,
        keccak256(toBytes(evalScript)),
        `ipfs://smoke/${bountyId}`,
        1,
        [10000],
        100, // feeBps: Haiku tier (1%)
      ],
      account: config.posterAccount,
      chain: baseSepolia,
    });
    const createReceipt = await publicClient.waitForTransactionReceipt({
      hash: createTxHash,
    });
    assert.equal(createReceipt.status, "success");

    const recordHeaders = await signActionHeaders(
      config.posterAccount,
      AUTH_ACTIONS.recordCreateTx,
    );
    await fetchJson<{ bounty: { id: string } }>(
      `${config.apiUrl}${API_ROUTES.bountyCreateTx(bountyId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...recordHeaders,
        },
        body: JSON.stringify({ txHash: createTxHash }),
      },
    );

    const linkedBounty = await waitFor(
      "chain listener bounty link",
      90_000,
      async () => {
        const response = await fetchJson<{
          bounty: { status: string; chainBountyId: number | null };
        }>(`${config.apiUrl}${API_ROUTES.bounty(bountyId)}`);
        if (response.bounty.chainBountyId === null) return null;
        if (response.bounty.status !== "active") return null;
        return response.bounty;
      },
    );

    const expectedChainBountyId = Number(bountyCountBefore);
    assert.equal(linkedBounty.chainBountyId, expectedChainBountyId);

    const submissionAuth = await signSubmissionPayload(
      config.posterAccount,
      bountyId,
      submissionContent,
    );

    const submitResult = await callTool<{
      submission: { id: string; evalStatus: string };
    }>(mcp.client, "submit_solution", {
      bountyId,
      content: submissionContent,
      fileType: "txt",
      solver: config.posterAccount.address,
      walletSignature: submissionAuth.signature,
      authTimestamp: Number(submissionAuth.timestamp),
      authNonce: submissionAuth.nonce,
    });

    const scoredSubmission = await waitFor(
      "submission scoring",
      120_000,
      async () => {
        const result = await callTool<{
          submissions: Array<{
            id: string;
            evalStatus: string;
            score: number | null;
            isBest: boolean;
          }>;
        }>(mcp.client, "list_my_submissions", {
          walletAddress: config.posterAccount.address,
          bountyId,
        });
        const submission = result.submissions.find(
          (entry) => entry.id === submitResult.submission.id,
        );
        if (!submission) return null;
        if (submission.evalStatus !== "scored") return null;
        return submission;
      },
    );

    const state: SmokeState = {
      phase: "phase1-complete",
      walletAddress: config.posterAccount.address,
      bountyId,
      chainBountyId: expectedChainBountyId,
      deadlineIso: deadlineDate.toISOString(),
      createTxHash,
      submissionId: scoredSubmission.id,
      submissionScore: scoredSubmission.score,
    };
    await persistState(config.stateFile, state);

    return {
      state,
      bountyStatus: linkedBounty.status,
    };
  } finally {
    await mcp.close();
  }
}

async function runPhase2(config: SmokeConfig): Promise<SmokeResult> {
  const state = await loadState(config.stateFile);
  const { publicClient, walletClient } = createClients(config);
  const deadline = new Date(state.deadlineIso);
  const waitMs = deadline.getTime() + 15_000 - Date.now();
  if (config.phase === "phase2" && waitMs > 0) {
    throw new Error(
      `Deadline has not passed yet. Re-run phase2 after ${deadline.toISOString()}.`,
    );
  }
  if (config.phase === "full" && waitMs > 0) {
    await delay(waitMs);
  }

  await waitFor("oracle reporting", 180_000, async () => {
    const bounty = (await publicClient.readContract({
      address: BOUNTY_CONTRACT_ADDRESS,
      abi: CLANKON_BOUNTY_ABI,
      functionName: "getBounty",
      args: [BigInt(state.chainBountyId)],
    })) as { status: number };
    return bounty.status === 1 ? bounty : null;
  });

  await waitFor("api resolved status", 90_000, async () => {
    const response = await fetchJson<{
      bounty: { status: string };
    }>(`${config.apiUrl}${API_ROUTES.bounty(state.bountyId)}`);
    return response.bounty.status === "resolved" ? response.bounty : null;
  });

  const claimTxHash = await walletClient.writeContract({
    address: BOUNTY_CONTRACT_ADDRESS,
    abi: CLANKON_BOUNTY_ABI,
    functionName: "claimReward",
    args: [BigInt(state.chainBountyId)],
    account: config.posterAccount,
    chain: baseSepolia,
  });
  await publicClient.waitForTransactionReceipt({ hash: claimTxHash });

  await waitFor("api claimed status", 90_000, async () => {
    const response = await fetchJson<{
      bounty: { status: string };
    }>(`${config.apiUrl}${API_ROUTES.bounty(state.bountyId)}`);
    return response.bounty.status === "claimed" ? response.bounty : null;
  });

  const finalState: SmokeState = {
    ...state,
    phase: "phase2-complete",
    rewardClaimTxHash: claimTxHash,
  };
  await persistState(config.stateFile, finalState);

  return {
    state: finalState,
    bountyStatus: "claimed",
  };
}

export async function runTestnetSmoke(config = resolveSmokeConfig()) {
  const runtime = config.startLocalStack ? await startLocalStack(config) : null;
  try {
    if (config.phase === "phase1") {
      return await runPhase1(config);
    }

    if (config.phase === "phase2") {
      return await runPhase2(config);
    }

    const phase1Result = await runPhase1(config);
    const phase2Result = await runPhase2(config);
    return {
      state: phase2Result.state,
      bountyStatus: phase2Result.bountyStatus,
    };
  } finally {
    await runtime?.close();
  }
}

async function main() {
  const result = await runTestnetSmoke();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
