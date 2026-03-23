# ClankonBounty Contract — Interactive Function Review

You are reviewing the `ClankonBounty.sol` smart contract for the Clankonomy project. Your job is to walk the user through **every function** one at a time, explain exactly what it does (including edge cases, access control, and token flows), and ask: **"Is this intended?"**

Wait for the user to respond **yes**, **no**, or provide feedback before moving to the next function. If they say no or give feedback, record their concern and continue.

At the end, produce a summary of all concerns raised.

---

## Contract Overview

- **Inherits:** Ownable (OpenZeppelin), ReentrancyGuard, Pausable
- **Purpose:** Escrow contract for agent bounties. Posters deposit USDC, an oracle reports winners after evaluation, winners claim rewards.
- **Deployed on:** Base Sepolia (testnet) at `0x1860A2A08325447D922e667A93fb09EeFE24ebc1`

---

## Review Format

For each function, present:
1. The function signature and access control
2. A plain-English explanation of what happens step by step
3. All validation checks and revert conditions
4. Edge cases and security considerations
5. Then ask: **"Is this intended? (yes / no + feedback)"**

---

## START REVIEW HERE

Work through the following functions in this exact order. Present ONE at a time, wait for a response, then continue.

---

### 1. Constructor

```solidity
constructor(address _oracle, address _owner) Ownable(_owner)
```

**Access:** Called once at deployment.
**What it does:**
- Sets the `oracle` address (the backend server that will report bounty winners)
- Passes `_owner` to OpenZeppelin's `Ownable`, making that address the contract admin
- The owner and oracle can be the same address or different

**Edge cases:**
- No zero-address check on `_oracle` at construction (there IS one on `setOracle` later, but not here)
- No zero-address check on `_owner` (OpenZeppelin's Ownable does check this)

**Is this intended?**

---

### 2. createBounty (Write — Poster)

```solidity
function createBounty(
    address token, uint256 amount, uint256 deadline,
    bytes32 evalHash, string calldata metadataURI,
    uint8 numWinners, uint16[] calldata sharesBps
) external nonReentrant whenNotPaused returns (uint256 bountyId)
```

**Access:** Anyone (when not paused).
**What it does:**
1. Checks `token` is in the `allowedTokens` whitelist
2. Checks `deadline` is at least 1 hour in the future and at most 90 days out
3. Checks `amount > 0`
4. Checks `numWinners` is 1-3 and `sharesBps` length matches
5. Checks `sharesBps` values sum to exactly 10000 (100%)
6. Assigns an auto-incrementing `bountyId` (starts at 0)
7. Stores the bounty struct in state
8. Calls `safeTransferFrom` to pull `amount` tokens from the poster into the contract
9. Emits `BountyCreated`

**Edge cases:**
- No minimum amount check onchain (a 1-wei bounty is technically valid). The frontend enforces 10 USDC min but the contract doesn't.
- The poster must have approved the contract to spend `amount` tokens before calling this.
- `evalHash` and `metadataURI` are stored but never validated onchain — they're for off-chain reference.
- If the token has a transfer fee (fee-on-transfer token), `bountyBalance` would be higher than actual tokens received. However, only whitelisted tokens are allowed, so this is controlled by the owner.

**Is this intended?**

---

### 3. cancelBounty (Write — Poster)

```solidity
function cancelBounty(uint256 bountyId) external nonReentrant whenNotPaused
```

**Access:** Only the original poster of that bounty. Must not be paused.
**What it does:**
1. Checks `msg.sender == poster`
2. Checks bounty is still `Active`
3. Checks deadline has NOT been reached yet (can only cancel before deadline)
4. Sets status to `Cancelled`
5. Calculates a **20% cancellation penalty** (`CANCEL_PENALTY_BPS = 2000`)
6. Refunds **80%** of the escrowed tokens to the poster
7. Sends the **20% penalty** to the contract `owner()`
8. Emits `BountyCancelled`

**Edge cases:**
- The 20% penalty is hardcoded as a constant — cannot be changed without redeploying
- If agents have already started working on submissions (off-chain), they lose that work with no compensation
- The penalty goes to the owner, not to a fee pool or burn — so the platform profits from cancellations
- Cannot cancel after deadline even if no one submitted. After deadline, poster must wait for grace period and use `reclaimBounty` instead (which has no penalty)

**Is this intended?**

---

### 4. reclaimBounty (Write — Poster)

```solidity
function reclaimBounty(uint256 bountyId) external nonReentrant
```

**Access:** Only the original poster. Note: NOT gated by `whenNotPaused`.
**What it does:**
1. Checks `msg.sender == poster`
2. Checks bounty is `Active` OR `Resolved`
3. Checks `block.timestamp >= deadline + 7 days` (grace period has passed)
4. Sets `bountyBalance` to 0 and status to `Cancelled`
5. Transfers whatever balance remains back to the poster
6. Emits `BountyReclaimed`

**Scenarios where this is used:**
- **No submissions:** Deadline passes, no one submits, oracle reports no winners. After 7 days, poster reclaims full amount (minus any fee already taken).
- **Winners reported but didn't claim:** Oracle reports winners, winners have 7 days to claim. After grace period, poster reclaims any unclaimed portion.
- **Partial claims:** If 2 of 3 winners claimed, poster reclaims the remaining 1 winner's share.

**Edge cases:**
- NOT paused-gated: poster can reclaim even when contract is paused. This is a safety feature — funds shouldn't be permanently locked if contract is paused.
- No penalty on reclaim (unlike cancel). The poster already waited the full deadline + grace period.
- If called on a `Resolved` bounty, the `bountyBalance` only contains unclaimed rewards (fee was already deducted in `reportWinners`).
- After reclaim, status is `Cancelled` — but the bounty was actually completed and partially/fully paid out. This status might be confusing for off-chain tracking.

**Is this intended?**

---

### 5. reportWinners (Write — Oracle)

```solidity
function reportWinners(
    uint256 bountyId,
    address[] calldata winners,
    uint256[] calldata scores
) external nonReentrant whenNotPaused
```

**Access:** Only the `oracle` address. Must not be paused.
**What it does:**
1. Checks `msg.sender == oracle`
2. Checks bounty is `Active`
3. Checks deadline HAS been reached (cannot report early)
4. Checks 1 to `numWinners` winners provided (can report fewer than configured)
5. Checks `winners.length == scores.length`
6. Rejects zero-address and duplicate winners
7. Calculates platform fee: `amount * platformFeeBps / 10000` (2.5% default)
8. Calculates net pool: `amount - fee`
9. **If fewer winners than configured:** sums only the top N shares from `sharesBps` and redistributes proportionally among those winners. E.g., if configured for 3 winners [60%, 30%, 10%] but only 1 winner, that winner gets 100% of the net pool.
10. Assigns rounding dust to the first winner so no tokens are permanently locked
11. Stores winners and scores
12. Sets status to `Resolved`
13. Deducts fee from `bountyBalance` and transfers fee to `owner()`
14. Emits `WinnersReported`

**Edge cases:**
- The fee is calculated on the ORIGINAL `amount`, not on `bountyBalance`. These should always be equal at this point, but it's worth noting.
- Scores are stored but not used for reward calculation onchain — rewards are purely based on the `sharesBps` configuration. Scores are for off-chain record.
- The oracle is a single address (not a multisig or threshold). If compromised, it can report fake winners for any active bounty past its deadline.
- Once winners are reported, they cannot be changed. No dispute mechanism onchain.
- The fee goes to `owner()` which could be an EOA or a Gnosis Safe.

**Is this intended?**

---

### 6. claimReward (Write — Winner)

```solidity
function claimReward(uint256 bountyId) external nonReentrant whenNotPaused
```

**Access:** Only addresses listed as winners for that bounty. Must not be paused.
**What it does:**
1. Looks up `winnerRewards[bountyId][msg.sender]` — reverts if 0
2. Checks the winner hasn't already claimed
3. Checks bounty is `Resolved`
4. Marks as claimed
5. Deducts reward from `bountyBalance`
6. Checks if winner has a `delegatedWallet` set — if so, sends tokens there instead
7. Transfers tokens to recipient (winner or their delegate)
8. Checks if ALL winners have now claimed — if yes, sets status to `Claimed`
9. Emits `RewardClaimed`

**Edge cases:**
- Paused-gated: winners CANNOT claim while contract is paused. Combined with the 7-day grace period, a prolonged pause could let the poster reclaim (since `reclaimBounty` is NOT pause-gated). This could be a concern.
- The delegation check happens at claim time, not at report time. A winner could set/change their delegate between being reported and claiming.
- If a winner's address is a contract that can't receive tokens (shouldn't happen with USDC, but theoretically), `safeTransfer` would revert.

**Is this intended?**

---

### 7. setDelegateWallet (Write — Anyone)

```solidity
function setDelegateWallet(address delegate) external
```

**Access:** Anyone. No pause gate. No reentrancy guard.
**What it does:**
1. Maps `msg.sender → delegate` in `delegatedWallets`
2. Set to `address(0)` to clear delegation
3. Emits `WalletDelegated`

**Purpose:** Allows AI agents (who may use hot wallets) to route bounty rewards to a more secure wallet (e.g., a hardware wallet or safe).

**Edge cases:**
- No restriction on what address you delegate to — could delegate to another agent, a contract, or even address(0) (which clears it)
- A delegator can change their delegate at any time, including between being reported as a winner and claiming
- No reentrancy guard, but this function only writes a mapping and emits an event, so it's safe
- Anyone can call this, even non-agents. It just has no effect if they never win a bounty.

**Is this intended?**

---

### 8. getDelegateWallet (Read)

```solidity
function getDelegateWallet(address agent) external view returns (address)
```

**What it does:** Returns the delegate address for the given agent. If no delegate is set, returns the agent's own address (not address(0)).

**Is this intended?**

---

### 9. getBounty (Read)

```solidity
function getBounty(uint256 bountyId) external view returns (Bounty memory)
```

**What it does:** Returns the full bounty struct (poster, token, amount, deadline, evalHash, metadataURI, numWinners, status). Returns zeroed struct for non-existent IDs.

**Is this intended?**

---

### 10. getBountyCount (Read)

```solidity
function getBountyCount() external view returns (uint256)
```

**What it does:** Returns `nextBountyId` — the total number of bounties ever created (including cancelled/resolved). Bounty IDs are 0-indexed, so valid IDs are `0` to `getBountyCount() - 1`.

**Is this intended?**

---

### 11. getBountyWinners (Read)

```solidity
function getBountyWinners(uint256 bountyId) external view returns (address[] memory)
```

**What it does:** Returns the array of winner addresses for a bounty. Empty array if not yet resolved.

**Is this intended?**

---

### 12. getBountyScores (Read)

```solidity
function getBountyScores(uint256 bountyId) external view returns (uint256[] memory)
```

**What it does:** Returns the array of scores corresponding to each winner. Scores are stored for transparency but don't affect reward amounts.

**Is this intended?**

---

### 13. getBountyShares (Read)

```solidity
function getBountyShares(uint256 bountyId) external view returns (uint16[] memory)
```

**What it does:** Returns the basis point shares array for a bounty (e.g., [6000, 3000, 1000] for a 60/30/10 split).

**Is this intended?**

---

### 14. setOracle (Write — Owner)

```solidity
function setOracle(address _oracle) external onlyOwner
```

**What it does:**
1. Only callable by contract owner
2. Rejects zero address
3. Updates the oracle address
4. Emits `OracleUpdated`

**Edge cases:**
- No timelock. Owner can change oracle instantly, which could front-run a `reportWinners` call.
- The old oracle immediately loses all power. Any pending transactions from the old oracle will revert.

**Is this intended?**

---

### 15. setAllowedToken (Write — Owner)

```solidity
function setAllowedToken(address token, bool allowed) external onlyOwner
```

**What it does:**
1. Only callable by contract owner
2. Sets whether a token address is accepted for bounties
3. Emits `TokenAllowanceUpdated`

**Edge cases:**
- Disabling a token doesn't affect existing bounties using that token — they continue to work normally (claims, reclaims, etc.)
- No zero-address check. Setting `allowedTokens[address(0)] = true` would technically allow bounties with address(0) as token, which would fail on `safeTransferFrom`.
- No limit on how many tokens can be whitelisted.

**Is this intended?**

---

### 16. setPlatformFee (Write — Owner)

```solidity
function setPlatformFee(uint256 _feeBps) external onlyOwner
```

**What it does:**
1. Only callable by contract owner
2. Checks fee doesn't exceed `MAX_FEE_BPS` (1000 = 10%)
3. Updates platform fee
4. Emits `PlatformFeeUpdated`

**Edge cases:**
- Fee can be set to 0 (no platform fee)
- Fee change affects ALL future `reportWinners` calls, including bounties created before the change. A poster who created a bounty expecting 2.5% could end up paying 10% if the fee is raised before their deadline.
- No timelock on fee changes.

**Is this intended?**

---

### 17. pause / unpause (Write — Owner)

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

**What it does:** Owner can pause/unpause the contract. When paused:
- `createBounty` — BLOCKED
- `cancelBounty` — BLOCKED
- `reportWinners` — BLOCKED
- `claimReward` — BLOCKED
- `reclaimBounty` — NOT BLOCKED (poster can always reclaim after grace period)
- `setDelegateWallet` — NOT BLOCKED
- All admin functions — NOT BLOCKED
- All view functions — NOT BLOCKED

**Is this intended?**

---

### 18. Inherited: transferOwnership (Write — Owner)

```solidity
function transferOwnership(address newOwner) public virtual onlyOwner
```

**From OpenZeppelin Ownable. Not written in your contract but inherited.**
**What it does:**
1. Only callable by current owner
2. Rejects zero address
3. Immediately transfers ownership to `newOwner`
4. Emits `OwnershipTransferred`

**Edge cases:**
- Single-step transfer. If you mistype the new owner address, ownership is irrecoverably lost. Consider using OpenZeppelin's `Ownable2Step` which requires the new owner to accept.
- No timelock.

**Is this intended?**

---

### 19. Inherited: renounceOwnership (Write — Owner)

```solidity
function renounceOwnership() public virtual onlyOwner
```

**From OpenZeppelin Ownable. Not written in your contract but inherited.**
**What it does:** Permanently removes the owner. After this:
- No one can call `setOracle`, `setAllowedToken`, `setPlatformFee`, `pause`, `unpause`
- Platform fees still go to `owner()` which is now `address(0)` — tokens sent to the zero address are burned
- Contract becomes immutable

**Is this intended? (Most projects override this to revert, preventing accidental renouncement.)**

---

### 20. Public State Variables (Auto-generated Getters)

The following `public` state variables generate automatic getter functions:

| Variable | Type | What it exposes |
|----------|------|----------------|
| `nextBountyId` | `uint256` | Total bounties created |
| `winnerRewards(bountyId, address)` | `uint256` | Reward amount for a specific winner |
| `hasClaimed(bountyId, address)` | `bool` | Whether a winner has claimed |
| `bountyBalance(bountyId)` | `uint256` | Remaining token balance in a bounty's escrow |
| `oracle` | `address` | Current oracle address |
| `platformFeeBps` | `uint256` | Current fee in basis points |
| `allowedTokens(address)` | `bool` | Whether a token is whitelisted |
| `delegatedWallets(address)` | `address` | Raw delegate mapping (returns address(0) if not set, unlike `getDelegateWallet`) |

**Is this intended?**

---

## AFTER ALL QUESTIONS

Once you've gone through every function, produce a summary:

```
## Review Summary

### Confirmed as Intended
- [list functions that got "yes"]

### Concerns Raised
- [function name]: [user's feedback]
- ...

### Recommended Changes
- [prioritized list of changes based on the concerns]
```
