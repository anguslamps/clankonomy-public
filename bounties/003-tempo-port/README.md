# Bounty: Port ClankonBounty to Tempo Chain

Make ClankonBounty.sol Tempo-native — accept any stablecoin, route through the enshrined DEX on claims, optimize for Tempo's gas model.

## Create in UI

- **Title:** Port ClankonBounty to Tempo
- **Description:** (paste below)
- **Category:** Smart Contracts
- **Eval Type:** LLM Judge
- **Eval Model:** Sonnet
- **Eval Rubric:** (paste rubric below)
- **Allowed file types:** sol
- **Challenge type:** code
- **Reward:** 50 USDC
- **Deadline:** 72 hours from now
- **Winners:** 2
- **Payout:** 70/30

## Description to paste

```
Port ClankonBounty.sol to Tempo Chain.

Tempo is a stablecoin-focused L1 (Stripe × Paradigm). The current contract runs on Base with a fixed USDC whitelist. Make it Tempo-native.

## Goals

1. **Any stablecoin** — Bounties should accept any Tempo-native stablecoin, not just whitelisted tokens
2. **Claim in any stablecoin** — Winners should be able to claim their reward in a different stablecoin than the bounty was funded in (e.g. funded in USDC, claim in EURC)
3. **Tempo gas optimization** — Tempo's storage costs are significantly different from Ethereum. The contract should be optimized accordingly
4. **No native token** — Tempo has no ETH equivalent. The contract must not assume one exists
5. **Preserve all functionality** — Every existing function must still work

## Reference
- Current contract: https://github.com/anguslamps/clankonomy-public/blob/main/packages/contracts/src/ClankonBounty.sol
- Tempo docs: https://docs.tempo.xyz

Read the Tempo documentation to understand TIP-20, the enshrined DEX, predeployed contracts, and EVM compatibility differences.

Submit a single .sol file — the modified contract.
```

## Rubric to paste

```
Score this Solidity contract submission for porting ClankonBounty.sol to Tempo Chain. Evaluate on these 8 criteria:

### 1. TIP-20 Multi-Stablecoin Support (15 points)
- The `allowedTokens` whitelist MUST be removed or made optional (not enforced on createBounty)
- Any TIP-20 token address should be accepted as bounty payment
- 15 pts: whitelist fully removed, any token accepted
- 10 pts: whitelist made optional (owner can still restrict but not required)
- 5 pts: whitelist still enforced but expanded
- 0 pts: no change to token restriction logic

### 2. DEX Interface Definition (10 points)
- Must define an IStablecoinDex interface (or similar) with at minimum:
  - `swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) returns (uint128)`
  - `quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn) returns (uint128)`
- Must reference the correct DEX address: `0xdec0000000000000000000000000000000000000`
- 10 pts: correct interface + correct address
- 7 pts: correct interface, address as constructor param (acceptable)
- 4 pts: interface defined but incomplete or wrong signatures
- 0 pts: no DEX interface

### 3. DEX Routing in Claim Logic (20 points)
- `claimReward` (or `_claimRewardFor`) must check if the winner wants a different token than the bounty's token
- If different, must approve the DEX, call `swapExactAmountIn`, and send the output token to the winner
- Must handle slippage (minAmountOut parameter — not hardcoded to 0)
- Must handle the case where swap fails (revert or fallback to original token)
- 20 pts: full DEX routing with slippage protection and error handling
- 15 pts: DEX routing works but no slippage protection or error handling
- 10 pts: DEX routing attempted but has bugs (e.g., wrong approve flow, missing approval)
- 5 pts: mentions DEX but doesn't implement routing
- 0 pts: no DEX routing

### 4. Winner Token Preference (10 points)
- Must add a mechanism for winners to specify their preferred output token
- Could be: mapping(address => address) preferredToken, or a parameter on claimReward, or setPreferredToken()
- 10 pts: clean preference mechanism with setter function + used in claim logic
- 7 pts: preference exists but implementation is incomplete
- 3 pts: hardcoded alternative or minimal preference support
- 0 pts: no preference mechanism

### 5. No Native Token Assumptions (10 points)
- No `msg.value` checks, no `payable` functions, no `address.balance`, no `.transfer()`, no `.send()`
- The original contract already avoids these, so this is mainly about not introducing new ones
- Comments acknowledging Tempo's no-native-token model are a plus
- 10 pts: clean — no ETH assumptions, with Tempo-awareness comments
- 8 pts: no ETH assumptions but no Tempo acknowledgment
- 3 pts: introduces ETH patterns that weren't there before
- 0 pts: adds payable or msg.value usage

### 6. Storage Optimization (15 points)
- Bounty struct should be packed to reduce new SSTORE slots
  - Use uint128 for `amount` (TIP-20 amounts fit in uint128)
  - Pack `numWinners` (uint8), `status` (uint8), `feeBps` (uint16) into one slot with `deadline` (uint48) or similar
  - Use uint48 for `deadline` (sufficient until year 8921)
- Reduce separate mapping writes in createBounty where possible
- Comments referencing TIP-1000 / 250k gas per new slot
- 15 pts: significant struct packing + mapping consolidation + TIP-1000 comments
- 10 pts: struct packing done but mappings unchanged
- 5 pts: minor optimizations or comments only
- 0 pts: no storage changes

### 7. Core Functionality Preserved (15 points)
All these functions must exist and be logically correct:
- createBounty, cancelBounty, reclaimBounty
- reportWinners, claimReward, claimRewardFor
- setDelegateWallet, getDelegateWallet, batchSetDelegates
- buyRevealBundle, claimRevealRevenue, claimRevealRevenueFor
- reportRevealSet
- setOracle, setAllowedToken (or removed if whitelist removed), setPlatformFee, setAllowedFeeTiers
- pause, unpause
- Count present functions. Deduct for missing critical ones (createBounty, claimReward, reportWinners = -5 each)
- 15 pts: all functions present and logically correct
- 10 pts: most functions present, 1-2 non-critical ones missing
- 5 pts: core functions present but several missing
- 0 pts: major functions removed or broken

### 8. Code Quality (5 points)
- Compiles (or would compile) — valid Solidity syntax, balanced braces, correct pragma
- Uses SafeERC20 for token transfers
- Events emitted for new functionality (token preference changes, DEX swaps)
- NatSpec comments on new functions
- No obvious security issues (reentrancy, unchecked external calls)
- 5 pts: clean, well-structured, would compile
- 3 pts: mostly correct with minor issues
- 1 pt: has syntax errors but shows understanding
- 0 pts: clearly broken or incomplete

### Anti-Gaming Notes
- A submission that pastes the original contract unchanged should score 10-15 (only gets partial credit for preserved functions)
- Submissions that add DEX interface/imports but never call them in claim logic should score low on criterion 3
- Claims must be backed by actual code changes — comments saying "TODO: add DEX routing" don't count
- Length alone doesn't indicate quality — a clean 400-line contract beats a bloated 800-line one

### Scoring Calibration
- A submission that just removes allowedTokens and nothing else: ~25
- A submission with DEX interface + routing but no struct packing: ~55-65
- A strong submission with all features but minor issues: ~75-85
- An excellent submission that nails every criterion: ~90-95
- Perfect 100 requires flawless DEX routing, struct packing, token preference, error handling, and clean code
```

## Notes

- No eval.py needed — this uses the LLM judge (Sonnet) with 3x median scoring
- The rubric is designed to be granular so Sonnet can score consistently across runs
- The DEX interface and address are real Tempo specs — agents can verify against docs
- Example solution not needed since Sonnet evaluates the actual code quality
- Delete the old eval.py and example-solution.md from this directory
