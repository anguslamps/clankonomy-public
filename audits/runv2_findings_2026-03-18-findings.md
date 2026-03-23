# Audited by [V12](https://zellic.ai/)

The only autonomous Solidity auditor that finds critical bugs. Not all audits are equal, so stop paying for bad ones. Just use V12. No calls, demos, or intros.


---

# Platform fee not snapshotted
**#1**
- Severity: Low
- Validity: Unreviewed

## Targets
- setPlatformFee (ClankonBounty)

## Affected Locations
- **ClankonBounty.setPlatformFee**: Single finding location

## Description

Bounties that do not set a per‑bounty fee rely on the global `platformFeeBps` when winners are reported. `setPlatformFee` allows the owner to update that variable at any time, but the bounty itself never stores the fee that was in effect when the poster locked funds. As a result, `reportWinners` can apply a different fee than the one the poster expected at creation. Because the fee is immediately transferred to the owner and cancellation is no longer possible after the deadline, the owner can retroactively raise the fee on active bounties. This cross‑function interaction breaks fee predictability and shifts value from winners to the owner.

## Root cause

`platformFeeBps` is a mutable global used directly in `reportWinners` without being snapshotted into the bounty or otherwise locked for the bounty lifecycle.

## Impact

The owner can increase `platformFeeBps` just before winners are reported to divert a larger portion of the bounty to themselves, shrinking the reward pool for winners. Posters and winners receive less than they would have under the fee in effect when the bounty was created.

## Mitigation

**Status: Resolved**

The contract already had per-bounty fee snapshotting via `bountyFeeBps[bountyId]`, stored at creation time (line 195). The global `platformFeeBps` fallback only applied to "legacy bounties" where `bountyFeeBps` was 0 — a dead code path since no bounties existed before the per-bounty system.

**Fix:** Removed the global fallback entirely. `reportWinners` now uses `bountyFeeBps[bountyId]` unconditionally, eliminating any possibility of retroactive fee changes.

```diff
- uint256 fee = (b.amount * (bountyFeeBps[bountyId] > 0 ? bountyFeeBps[bountyId] : platformFeeBps)) / 10000;
+ uint256 fee = (b.amount * bountyFeeBps[bountyId]) / 10000;
```

All 70 tests pass after this change.

---

# Oracle can pre-seed reveal sets
**#2**
- Severity: Low
- Validity: Unreviewed

## Targets
- reportRevealSet (ClankonBounty)

## Affected Locations
- **ClankonBounty.reportRevealSet**: Single finding location

## Description

`reportRevealSet` never verifies that a bounty actually exists, it only checks that the status is not `Cancelled` and that the deadline has passed. For an uninitialized bounty ID, `status` defaults to `Active` and `deadline` is `0`, so the oracle can call `reportRevealSet` for any future ID at any time. `createBounty` does not clear reveal-related mappings, and `reportRevealSet` blocks re-reporting once `_revealSolvers` is non-empty, so the pre-populated reveal set persists into the real bounty. As soon as the bounty is created, `buyRevealBundle` accepts payments based on the pre-set price, and `claimRevealRevenue` pays out to the pre-set solvers even if the oracle has since been replaced. This lets a malicious or compromised oracle lock in reveal revenue rights for future bounties and bypass the intended deadline gating.

## Root cause

`reportRevealSet` lacks a bounty-existence check and `createBounty` does not reset reveal-set state, allowing pre-initialized reveal data to persist into real bounties.

## Impact

A current oracle can lock in reveal solvers and bundle pricing for future bounties and continue receiving reveal revenue after being removed as oracle. Buyers can be charged for reveal bundles immediately upon bounty creation, even before the deadline, and the real oracle cannot correct the reveal set. This diverts reveal revenue to unauthorized addresses and undermines the intended contest lifecycle.

## Mitigation

**Status: Resolved**

Added a bounty-existence check at the top of `reportRevealSet`. Since `createBounty` always sets `poster` to `msg.sender`, an uninitialized bounty will have `poster == address(0)`. This blocks the oracle from pre-seeding reveal sets for bounty IDs that haven't been created yet.

```diff
  Bounty storage b = _bounties[bountyId];
+ if (b.poster == address(0)) revert BountyNotActive();
  if (b.status == BountyStatus.Cancelled) revert BountyNotActive();
```

All 70 tests pass after this change.