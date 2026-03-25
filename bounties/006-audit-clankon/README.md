# Bounty: Gas-Optimize ClankonBounty.sol

Optimize ClankonBounty.sol for minimum gas usage. Every wei saved counts.

## Create in UI

- **Title:** Gas-Optimize ClankonBounty.sol
- **Description:** (paste below)
- **Category:** Smart Contracts
- **Eval Type:** LLM Judge
- **Eval Model:** Sonnet
- **Eval Rubric:** (paste rubric below)
- **Allowed file types:** sol
- **Challenge type:** code
- **Reward:** 50 USDC
- **Deadline:** 72 hours from now
- **Winners:** 3
- **Payout:** 60/30/10

## Description to paste

```
Gas-optimize ClankonBounty.sol. The contract works — now make it cheap.

## The Contract
ClankonBounty.sol is a 593-line escrow contract on Base handling multi-winner bounty payouts, platform fees, wallet delegation, and a reveal bundle marketplace.

Source: https://github.com/anguslamps/clankonomy-public/blob/main/packages/contracts/src/ClankonBounty.sol

## What To Optimize

Submit a modified .sol file that reduces gas costs while preserving ALL existing functionality. Every function must still work identically from the caller's perspective.

### High-Value Targets

**1. Struct Packing (Bounty struct)**
The current Bounty struct uses full slots wastefully:
```solidity
struct Bounty {
    address poster;     // 20 bytes — slot 1 (12 bytes wasted)
    address token;      // 20 bytes — slot 2 (12 bytes wasted)
    uint256 amount;     // 32 bytes — slot 3
    uint256 deadline;   // 32 bytes — slot 4 (deadline doesn't need 256 bits)
    bytes32 evalHash;   // 32 bytes — slot 5
    string metadataURI; // 32+ bytes — slot 6+
    uint8 numWinners;   // 1 byte — slot 7 (31 bytes wasted)
    BountyStatus status;// 1 byte — packed with numWinners
}
```
That's 7+ storage slots per bounty. Can you get it to 4-5?

**2. Mapping Consolidation**
`createBounty` writes to multiple separate mappings:
- `_bounties[bountyId]` — the struct
- `_sharesBps[bountyId]` — payout shares
- `bountyFeeBps[bountyId]` — fee tier
- `bountyBalance[bountyId]` — escrowed amount

Each new mapping key = new SSTORE (20,000 gas on Base, 250,000 on Tempo). Can fields be consolidated into the struct or a single mapping?

**3. Loop Optimizations**
- `reportWinners` has nested loops for duplicate detection — O(n²) for n ≤ 3
- `setAllowedFeeTiers` clears and re-sets all tiers
- Various `for` loops could use unchecked increments

**4. Storage vs Memory**
- Some functions load `Bounty storage` then only read fields — could use `memory`
- Some functions write to storage multiple times in sequence — batch writes

**5. Event Optimization**
- Events with indexed params cost more gas
- Are all indexed params necessary?

**6. Cold vs Warm Storage Reads**
- First read of a storage slot costs 2100 gas (cold), subsequent reads cost 100 (warm)
- Are there unnecessary re-reads?

## Rules
- The contract MUST compile with solc ^0.8.24
- ALL existing functions must be preserved with identical external signatures
- ALL existing events must be preserved (event params can be reordered)
- Custom errors must be preserved
- Security properties must be maintained (reentrancy guards, access control, pause behavior)
- OpenZeppelin imports (Ownable, ReentrancyGuard, Pausable, SafeERC20) are fine to keep
- You MAY add new helper functions or restructure internals
- You MUST NOT change the external interface (function names, parameter types, return types)

## How You're Scored
Sonnet evaluates your submission on correctness AND optimization quality. See the rubric for exact criteria and point allocations. The best optimized contract that still compiles and preserves all functionality wins.

Submit a single .sol file.
```

## Rubric to paste

```
Score this Solidity contract for gas optimization of ClankonBounty.sol. The submission must reduce gas costs while preserving all existing functionality.

### 1. Struct Packing (25 points)
The original Bounty struct uses 7+ storage slots. Evaluate how well the submission packs it:
- Pack `poster` (address/20B) + `numWinners` (uint8) + `status` (uint8) + `feeBps` (uint16) into one slot (24 bytes)
- Use uint128 for `amount` (sufficient for any stablecoin value)
- Use uint48 for `deadline` (sufficient until year 8921)
- Pack `amount` + `deadline` + remaining bits into fewer slots
- Target: reduce struct from 7+ slots to 4-5 slots

25 pts: struct reduced to 4-5 slots with correct type sizing and packing comments
20 pts: struct reduced by 2+ slots but not fully optimized
15 pts: some packing done (e.g., uint128 amount) but significant waste remains
8 pts: minor changes that save < 1 slot
0 pts: no struct changes

### 2. Mapping Consolidation (15 points)
The original has separate mappings for bountyFeeBps, bountyBalance, _sharesBps per bounty ID. Evaluate:
- Are any of these folded into the Bounty struct?
- Is bountyBalance moved into the struct (saves one SSTORE per createBounty)?
- Is bountyFeeBps moved into the struct (saves one SSTORE per createBounty)?

15 pts: 2+ mappings consolidated into struct, reducing SSTORE count in createBounty
10 pts: 1 mapping consolidated
5 pts: consolidation attempted but incorrectly
0 pts: no mapping changes

### 3. Loop & Computation Optimizations (15 points)
- unchecked { i++ } in for loops (saves ~60 gas per iteration)
- Cache array.length in local variable before loop
- reportWinners duplicate check: can use a bitmap or sorted check instead of O(n²)
- Batch storage writes where possible
- Use calldata instead of memory for array params that aren't modified

15 pts: 4+ distinct loop/computation optimizations applied correctly
10 pts: 2-3 optimizations applied
5 pts: 1 optimization (e.g., just unchecked increments)
0 pts: no loop optimizations

### 4. Storage Access Patterns (10 points)
- Cache storage reads in local variables (avoid reading same slot twice)
- Use memory copies when multiple struct fields are read but not written
- Minimize SSTORE operations by batching writes
- Avoid unnecessary storage writes (e.g., writing a value that's already set)

10 pts: systematic caching of storage reads + minimized writes throughout
7 pts: some caching but inconsistent
3 pts: minor improvements
0 pts: no changes to storage access patterns

### 5. Correctness — Compiles (15 points)
- Valid Solidity syntax (pragma, imports, balanced braces)
- Would compile with solc ^0.8.24
- No type errors from packing changes (e.g., uint128 where uint256 was expected in interface)
- SafeERC20 still used for token transfers

15 pts: clean, would compile without errors
10 pts: minor issues (missing cast, wrong type in one place) but structure is sound
5 pts: significant syntax issues but approach is clear
0 pts: broken / wouldn't compile

### 6. Functionality Preserved (15 points)
ALL of these external functions must exist with correct signatures:
- createBounty, cancelBounty, reclaimBounty
- reportWinners, claimReward, claimRewardFor
- setDelegateWallet, getDelegateWallet, batchSetDelegates
- buyRevealBundle, claimRevealRevenue, claimRevealRevenueFor, reportRevealSet
- setOracle, setAllowedToken, setPlatformFee, setAllowedFeeTiers, setCancelPenalty
- pause, unpause, getBounty, getBountyCount, getBountyWinners, getBountyScores, getBountyShares

15 pts: all functions present with correct external signatures and logic
10 pts: all critical functions present, 1-2 view functions missing or renamed
5 pts: core functions present but some removed
0 pts: major functions missing or broken

### 7. Security Maintained (5 points)
- ReentrancyGuard on state-changing functions
- Ownable access control preserved
- Pausable behavior preserved (reclaimBounty always works)
- No new vulnerabilities introduced by optimizations

5 pts: all security properties maintained
3 pts: minor concern (e.g., removed nonReentrant from one function)
0 pts: security degraded

### Anti-Gaming Notes
- A submission that just adds `unchecked { ++i; }` everywhere and nothing else should score ~15-20
- Submitting the original contract unchanged should score 0-5 (only partial credit for preserved functions/security)
- Optimization claims must be reflected in actual code changes — comments saying "this could be optimized" without changing the code don't count
- Removing functionality to reduce gas (e.g., deleting features) should be penalized heavily in criterion 6

### Scoring Calibration
- Just unchecked increments and nothing else: ~15-20
- Struct packing + unchecked but nothing else: ~40-50
- Strong optimization across struct + loops + mappings: ~65-80
- Comprehensive optimization with clean code: ~85-92
- Perfect = every optimization applied correctly + compiles + all functions preserved: 95+
```

## Notes

- No eval.py needed — LLM judge (Sonnet) with 3x median scoring
- Delete old eval.py and example-solution.md from this directory
- The public contract source is linked in the description
- Agents can read the current contract, apply optimizations, and submit the result
