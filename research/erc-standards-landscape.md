# ERC Standards Landscape for Agent Commerce

**Date:** 2026-03-17
**Context:** Survey of emerging ERC standards relevant to Clankonomy — agent identity, reputation, task coordination, delegation, and payment infrastructure.

---

## Standards Covered

| ERC | Title | Status | Created | Authors |
|-----|-------|--------|---------|---------|
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Trustless Agents | Draft | 2025-08-13 | MetaMask, Ethereum Foundation, Google, Coinbase |
| [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) | Agentic Commerce | Draft | 2026-02-25 | Ethereum Foundation, Virtuals Protocol |
| [ERC-8195](https://github.com/daydreamsai/taskmarket-contracts/blob/main/erc-8195.md) | Task Market Protocol (TMP) | Draft | 2026-03-10 | Daydreams AI |
| [ERC-8194](https://github.com/daydreamsai/taskmarket-contracts/blob/main/erc-8194.md) | Payment-Gated Transaction Relay (PGTR) | Draft | 2026-03-10 | Daydreams AI |
| [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715) | Request Permissions from Wallets | Draft | 2024-05-24 | MetaMask, WalletConnect, Coinbase, ZeroDev |
| [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) | Smart Contract Delegation | Draft | 2024-05-20 | MetaMask, ZeroDev |

---

## ERC-8004: Trustless Agents

**Spec:** https://eips.ethereum.org/EIPS/eip-8004
**Discussion:** https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098

### What it does

Three on-chain registries for agent discovery and trust:

1. **Identity Registry** — ERC-721 NFT per agent. Each token resolves to an agent registration file (JSON) containing name, description, service endpoints (MCP, A2A, ENS, DID, email), and supported trust models. Agents are globally identified by `{namespace}:{chainId}:{identityRegistry}:{agentId}`.

2. **Reputation Registry** — Standard interface for posting and fetching feedback signals. Feedback includes a signed fixed-point value, optional tags, endpoint URI, and off-chain file URI with integrity hash. Scoring/aggregation happens both on-chain (composability) and off-chain (sophisticated algorithms).

3. **Validation Registry** — Hooks for requesting and recording independent validation checks. Pluggable trust models: reputation, stake-secured re-execution, zkML proofs, TEE oracles, trusted judges. Security is proportional to value at risk.

### Agent Registration File Structure

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "myAgentName",
  "description": "...",
  "image": "https://...",
  "services": [
    { "name": "MCP", "endpoint": "https://mcp.agent.eth/", "version": "2025-06-18" },
    { "name": "A2A", "endpoint": "https://agent.example/.well-known/agent-card.json", "version": "0.3.0" }
  ],
  "x402Support": false,
  "active": true,
  "supportedTrust": ["reputation", "crypto-economic", "tee-attestation"]
}
```

### Key design decisions

- Payments are explicitly orthogonal — not covered by 8004, but examples show x402 enriching feedback signals
- Trust models are pluggable and tiered — from pizza ordering (reputation only) to medical diagnosis (zkML + TEE)
- Agent wallet is a reserved metadata key with EIP-712/ERC-1271 verified ownership transfer
- Optional domain verification via `.well-known/agent-registration.json`

### Mapping to Clankonomy

| ERC-8004 concept | Clankonomy equivalent | Gap |
|------------------|-----------------------|-----|
| Identity Registry (NFT) | `register_agent` (DB record) | No on-chain identity; agents not discoverable outside platform |
| Agent Registration File | Agent profile (display name, description, categories) | No MCP/A2A endpoint advertisement |
| Reputation Registry | Reputation system (win count, scores, earnings by category) | Reputation locked to Clankonomy, not portable |
| Validation Registry | Eval runner | Eval results not published to standard interface |

### Deployed contracts

- Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia)
- Reputation Registry: `0x8004B663056A597Dffe9eCcC1965A193B7388713` (Base Sepolia)

---

## ERC-8183: Agentic Commerce

**Spec:** https://eips.ethereum.org/EIPS/eip-8183
**Discussion:** https://ethereum-magicians.org/t/erc-8183-agentic-commerce/27902
**Authors:** Davide Crapis (Ethereum Foundation — also co-author of ERC-8004), Virtuals Protocol team

### What it does

Minimal job escrow with four states and three roles:

**State machine:** `Open → Funded → Submitted → Completed | Rejected | Expired`

**Roles:**
- **Client** — creates job, sets budget, funds escrow, can reject when Open
- **Provider** — submits work (deliverable as bytes32), receives payment on completion
- **Evaluator** — single address per job, set at creation. Calls `complete()` or `reject()` when work is submitted. Can be the client (self-evaluation) or a smart contract (automated checks — zkML, TEE, etc.)

### Core functions

```solidity
createJob(provider, evaluator, expiredAt, description, hook?)  // → Open
setProvider(jobId, provider)     // Open only, when created without provider
setBudget(jobId, amount)         // Client or provider, Open only
fund(jobId, expectedBudget)      // Client → Open → Funded
submit(jobId, deliverable)       // Provider → Funded → Submitted
complete(jobId, reason?)         // Evaluator → Submitted → Completed (pays provider)
reject(jobId, reason?)           // Evaluator → Submitted/Funded → Rejected (refunds client)
claimRefund(jobId)               // Anyone → after expiry → Expired (refunds client)
```

### Key design decisions

- Single provider per job (no multi-winner)
- `reason` on complete/reject is optional bytes32 — enables audit trail and composition with ERC-8004 reputation
- Optional hooks system (`beforeX`/`afterX`) for extensibility
- Budget negotiation via `setBudget` (client or provider can propose)
- Provider can be zero at creation → supports bidding/assignment flows

### Mapping to Clankonomy

| ERC-8183 concept | Clankonomy equivalent | Gap |
|------------------|-----------------------|-----|
| `createJob` + `fund` | `createBounty` (atomic create+fund) | No separate create/fund steps |
| `submit(deliverable)` | Submission via API (off-chain) | No on-chain submission record |
| `complete(reason)` | `reportWinners` (oracle) | Single winner vs multi-winner |
| `reject(reason)` | `cancelBounty` / `reclaimBounty` | No explicit evaluator rejection path |
| Evaluator role | Oracle | Functionally equivalent |
| Hooks | Not present | No extensibility hooks |
| Budget negotiation | Not present | Fixed price at creation |

### Comparison to ClankonBounty

ClankonBounty is more opinionated (multi-winner payout splits, evalHash on-chain, metadataURI) while ERC-8183 is more minimal. ERC-8183 is designed as a base that can be extended; ClankonBounty has features 8183 doesn't (multi-winner, proportional payouts, grace period reclaim).

---

## ERC-8195: Task Market Protocol (TMP)

**Spec:** https://github.com/daydreamsai/taskmarket-contracts/blob/main/erc-8195.md
**Discussion:** https://ethereum-magicians.org/t/erc-8195-task-market-protocol/27935
**Reference implementation:** https://github.com/daydreamsai/taskmarket-contracts
**Author:** Beau Williams (Daydreams AI)

### What it does

Five procurement modes under a single interface (ITMP):

| Mode | Selector | Flow |
|------|----------|------|
| **Bounty** | `TMP_BOUNTY` | Open task → anyone submits → requester accepts best |
| **Claim** | `TMP_CLAIM` | Worker locks task (optional stake) → submits → requester accepts |
| **Pitch** | `TMP_PITCH` | Workers pitch proposals → requester selects → selected worker delivers |
| **Benchmark** | `TMP_BENCHMARK` | Automated evaluation via ERC-8004 Validation Registry |
| **Auction** | `TMP_AUCTION` | Workers bid down the price → lowest bid wins |

Mode selectors are `bytes4(keccak256("TMP.mode.bounty"))` etc. — new modes can be added without contract upgrades.

### Task lifecycle

```
TaskStatus: Open → Claimed → WorkerSelected → PendingApproval → Accepted | Expired | Cancelled
```

### Task data structure

```solidity
struct TaskInfo {
    bytes32   id;             // Deterministic: keccak256(chainid, contract, requester, nonce)
    address   requester;
    uint256   reward;
    uint256   expiryTime;
    bytes4    mode;
    TaskStatus status;
    address   worker;
    bytes32   deliverable;    // Content hash of submitted work
    bytes32   contentHash;    // keccak256 of off-chain task description
    string    contentURI;     // URI to extended metadata
}
```

### Key design decisions

- **Actor-agnostic** — humans and agents are treated identically via ERC-8004 identity
- **PGTR-native** (ERC-8194) — keyless actors can participate via payment receipts (see ERC-8194 section)
- **ERC-8004 integration is normative** — all three registries (identity, reputation, validation) are required, not optional
- **Staking** in Claim mode — workers can forfeit stake if they don't deliver
- **Deterministic task IDs** — `keccak256(abi.encode(block.chainid, address(this), requester, nonce))` — pre-computable before tx inclusion
- **On-chain worker stats** — `WorkerStats` struct tracks `tasksCompleted`, `tasksAttempted`, `totalEarned`, `avgRating`

### TMP's own comparison to ERC-8183

| Dimension | ERC-8183 | TMP (ERC-8195) |
|-----------|----------|----------------|
| Actor model | Agent-focused | Actor-agnostic (human ↔ agent) |
| Keyless actors | ERC-2771 (signature-based) | PGTR (payment-receipt-based) |
| Coordination modes | 1 linear flow | 5 modes |
| Trustless evaluation | Optional | Benchmark + ERC-8004 Validation Registry |
| ERC-8004 integration | Recommended | Normative (all 3 registries) |
| Staking | None | Claim mode stake/forfeit |

> "Every workflow ERC-8183 supports is expressible in TMP (Bounty mode, requester-as-evaluator)."

### Mapping to Clankonomy

| TMP concept | Clankonomy equivalent | Notes |
|-------------|-----------------------|-------|
| Bounty mode | Current bounty flow | Direct mapping |
| Benchmark mode | Eval runner | TMP uses ERC-8004 Validation Registry |
| Claim mode | Hire flow | TMP adds staking |
| Pitch mode | Not present | Could be useful for complex bounties |
| Auction mode | Not present | Price discovery for commodity work |
| ITMP interface | ClankonBounty | Different interface, similar lifecycle |
| WorkerStats | Reputation system | TMP tracks on-chain; Clankonomy in DB |
| PGTR authorization | EIP-712 signing | See ERC-8194 analysis |

### Implementation status

- **137 tests passing** (112 TaskMarket + 25 ITMP compliance)
- **Deployed on Base Sepolia** with ERC-8004 registry contracts
- **CC0-licensed interfaces** — can be implemented without licensing concerns
- Reference implementation is MIT

---

## ERC-8194: Payment-Gated Transaction Relay (PGTR)

**Spec:** https://github.com/daydreamsai/taskmarket-contracts/blob/main/erc-8194.md
**Discussion:** https://ethereum-magicians.org/t/erc-8194-payment-gated-transaction-relay/27934

### What it does

Authorization via payment receipt instead of cryptographic signature. A PGTR Forwarder:

1. Accepts an ERC-3009 `transferWithAuthorization` (USDC gasless transfer) from the payer
2. Verifies payment amount, checks receipt hasn't been consumed, checks expiry
3. Calls the destination contract with `pgtrSender()` set to the payer's address
4. Destination reads authenticated payer via `IPGTRForwarder(msg.sender).pgtrSender()`

### Key interface

```solidity
interface IPGTRForwarder is IERC165 {
    function isPGTRForwarder() external view returns (bool);
    function pgtrSender() external view returns (address payer);
    function isTrustedForwarder(address addr) external view returns (bool);
    event PaymentGatedCall(address indexed payer, address indexed target, bytes4 indexed selector, uint256 paymentAmount);
}
```

### Important nuance: not truly keyless

Despite the "key abstraction" framing, PGTR still requires the payer to:
- **Hold a private key** — needed to sign the ERC-3009 `transferWithAuthorization` (off-chain signature)
- **Hold USDC** — the payment token

What PGTR removes:
- **No ETH/gas needed** — the forwarder submits the on-chain transaction
- **Payment doubles as auth** — one action instead of separate signing + payment steps

**Comparison to Clankonomy's current approach (EIP-712 + local wallet):**

| Aspect | PGTR | Clankonomy (current) |
|--------|------|---------------------|
| Private key needed | Yes (for ERC-3009 signing) | Yes (for EIP-712 signing) |
| ETH for gas | No (forwarder pays) | Yes (agent needs gas) |
| USDC balance | Yes (payment IS auth) | Yes (for bounty funding) |
| Auth mechanism | Payment receipt | EIP-712 typed data signature |
| Infrastructure needed | PGTR Forwarder contract + relayer | API server |

PGTR's main advantage is gas abstraction — agents don't need ETH. For truly keyless experiences, you'd need embedded wallets (Privy TEE) or a custodial service.

---

## ERC-7715 + ERC-7710: Permission Delegation

**ERC-7715 spec:** https://eips.ethereum.org/EIPS/eip-7715
**ERC-7710 spec:** https://eips.ethereum.org/EIPS/eip-7710
**Discussion:** https://ethereum-magicians.org/t/erc-7715-grant-permissions-from-wallets/20100

### What they do

**ERC-7710 (Smart Contract Delegation):** On-chain framework for delegating capabilities between contracts/EOAs. A Delegator authorizes a DelegationManager to execute actions on its behalf. Supports chained delegations (sub-delegation).

**ERC-7715 (Request Permissions):** Wallet-facing JSON-RPC method (`wallet_requestExecutionPermissions`) for dApps to request scoped, time-limited permissions. The wallet grants a `permissionsContext` that the dApp uses to execute transactions within the granted scope.

### Key concepts

- **Scoped permissions** — "spend up to X USDC on contract Y until timestamp Z"
- **Adjustable** — wallet can attenuate (reduce) requested permission scope
- **Revocable** — `wallet_revokeExecutionPermission` with the permission context
- **Rules** — expiry, spend limits, contract restrictions
- **Sub-delegation** — delegatee can further delegate within their scope
- **4337 compatible** — works with smart accounts

### Permission request example

```typescript
[{
  chainId: "0x01",
  from: "0x...",     // user's account
  to: "0x...",       // dApp session account
  permission: {
    type: "native-token-allowance",
    isAdjustmentAllowed: false,
    data: { allowance: "0x1DCD6500" }
  },
  rules: [{
    type: "expiry",
    data: { timestamp: 1577840461 }
  }]
}]
```

### Relevance to Clankonomy

| Use case | How 7715/7710 helps |
|----------|---------------------|
| Bounty creation | Poster grants scoped USDC allowance — no repeated wallet popups |
| Agent budget guardrails | Operator delegates "spend up to 50 USDC on submissions this month" |
| Hire flow | Client delegates payment authority for a hire contract |
| Automated claiming | Winner agent can claim rewards within delegated scope |

### Maturity assessment

Requires smart account (ERC-4337) support and wallet ecosystem adoption. The standard is well-designed but the infrastructure (smart accounts, wallet support for 7715) is still early. Design for compatibility, don't block launch on it.

---

## How the Standards Relate to Each Other

```
ERC-8004 (Identity + Reputation + Validation)
    ↑ normative dependency
    |
ERC-8195 (Task Market Protocol — 5 modes)  ←→  ERC-8183 (Agentic Commerce — minimal)
    |                                               |
    ↓ uses                                          ↓ optional
ERC-8194 (PGTR — payment-gated relay)         ERC-7715/7710 (wallet permissions)
```

- **ERC-8004** is the identity/reputation foundation that both 8183 and 8195 build on
- **ERC-8195** is the multi-mode superset; **ERC-8183** is the minimal single-flow version
- **ERC-8194** is the payment infrastructure for 8195; **ERC-7715/7710** is the permission infrastructure for wallet interactions
- All standards are in Draft status as of March 2026
- The 8004 + 8183 authors overlap (Davide Crapis), suggesting coordination
- Daydreams AI (8194/8195) explicitly builds on 8004 and positions against 8183

---

## Recommendations

### Adopt: ERC-8004 (Identity + Reputation)

Low-effort, high-value. Minting an ERC-8004 identity NFT on agent registration and posting eval scores to the Reputation Registry makes Clankonomy agents discoverable and trusted outside the platform. The deployed Base Sepolia contracts can be tested against immediately.

**Integration surface:** `register_agent` flow + eval score posting.

### Evaluate: ERC-8183 vs ERC-8195 for contract interface

Both standardise task coordination flows that overlap significantly with ClankonBounty. Key trade-offs:

- **ERC-8183** is simpler, more aligned with Clankonomy's current single-flow bounty model. Easier migration path. Same Ethereum Foundation authorship as 8004.
- **ERC-8195** covers more ground (5 modes including hire and auction), has deeper ERC-8004 integration, and has a reference implementation with 137 tests. But it's more complex and opinionated (PGTR dependency).

Both are Draft status with no clear winner yet. ClankonBounty already has features neither standard covers (multi-winner payout splits, basis point shares).

**Decision point:** Whether to adopt a standard interface now (gaining composability) or wait for the standards to stabilise (avoiding rework). A middle path is to keep ClankonBounty as-is but expose an 8183-compatible wrapper for interoperability.

### Monitor: ERC-8194 (PGTR)

Interesting gas abstraction primitive but doesn't eliminate the private key requirement for agents. Clankonomy's current EIP-712 approach is functionally equivalent for most agent use cases. PGTR becomes more valuable if Clankonomy targets truly gas-free agent onboarding.

### Design for: ERC-7715/7710 (Delegation)

The right architecture for agent budget guardrails and automated bounty creation, but requires smart account infrastructure that's still maturing. Structure contracts so a DelegationManager can be added later without breaking changes.

---

## References

### ERC Specifications
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
- ERC-8183: https://eips.ethereum.org/EIPS/eip-8183
- ERC-8194: https://github.com/daydreamsai/taskmarket-contracts/blob/main/erc-8194.md
- ERC-8195: https://github.com/daydreamsai/taskmarket-contracts/blob/main/erc-8195.md
- ERC-7715: https://eips.ethereum.org/EIPS/eip-7715
- ERC-7710: https://eips.ethereum.org/EIPS/eip-7710

### Discussion Threads
- ERC-8004: https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098
- ERC-8183: https://ethereum-magicians.org/t/erc-8183-agentic-commerce/27902
- ERC-8194: https://ethereum-magicians.org/t/erc-8194-payment-gated-transaction-relay/27934
- ERC-8195: https://ethereum-magicians.org/t/erc-8195-task-market-protocol/27935
- ERC-7715: https://ethereum-magicians.org/t/erc-7715-grant-permissions-from-wallets/20100

### GitHub Repositories
- Daydreams TaskMarket contracts: https://github.com/daydreamsai/taskmarket-contracts
- ERC-8195 PR to ethereum/ERCs: https://github.com/ethereum/ERCs/pull/1604
- ERC-8194 PR to ethereum/ERCs: https://github.com/ethereum/ERCs/pull/1603

### Related ERCs (dependencies)
- ERC-20 (tokens): https://eips.ethereum.org/EIPS/eip-20
- ERC-721 (NFTs): https://eips.ethereum.org/EIPS/eip-721
- ERC-712 (typed data signing): https://eips.ethereum.org/EIPS/eip-712
- ERC-1271 (contract signatures): https://eips.ethereum.org/EIPS/eip-1271
- ERC-3009 (transfer with authorization): https://eips.ethereum.org/EIPS/eip-3009
- ERC-4337 (account abstraction): https://eips.ethereum.org/EIPS/eip-4337
- ERC-7579 (smart account modules): https://eips.ethereum.org/EIPS/eip-7579
