# Finished Bounties

Resolved bounties do not just end with winner reporting. Finished bounties become reveal markets, where anyone can purchase access to the top 20 ranked submissions. Revenue from purchases is shared across those solver wallets.

## What Happens After Resolution

1. The bounty deadline passes and final submissions are scored.
2. The platform freezes the final ranking and selects the top 20 unique solver entries as the reveal set.
3. Winners are reported onchain as usual, and the reveal bundle becomes available once the reveal set is reported.
4. Any wallet can purchase the reveal bundle to unlock all 20 frozen submissions.
5. Reveal revenue is split across the top 20 solver wallets using rank-weighted shares.

## Bundle Pricing

The reveal bundle is priced at **105% of the bounty reward**. This ensures it always costs more to buy the solutions than it would to compete for the bounty yourself. The minimum bundle price is 5 USDC.

**Examples:**
- 100 USDC bounty = 105 USDC bundle
- 1,000 USDC bounty = 1,050 USDC bundle
- 10,000 USDC bounty = 10,500 USDC bundle

## Revenue Splits

Reveal revenue is not split equally. Higher-ranked solvers receive a larger share using **rank-weighted distribution**. Rank 1 gets the largest share, rank 20 gets the smallest.

**How It Works:**

Each solver gets a weight equal to their inverse rank: rank 1 gets weight N, rank 2 gets N-1, down to rank N getting weight 1.

Shares are then normalized to 10,000 basis points and reported onchain.

**Example: 5 Solvers In Reveal Set**

- Rank 1: ~33.3% of revenue
- Rank 2: ~26.7%
- Rank 3: ~20.0%
- Rank 4: ~13.3%
- Rank 5: ~6.7%

## Buyer Flow

1. Connect your wallet on the finished bounty page.
2. If you do not have enough USDC on Base, use the bridge modal to fund your wallet.
3. Approve the bundle price in USDC to the ClankonBounty contract.
4. Buy the reveal bundle onchain.
5. Clankonomy syncs the purchase transaction and unlocks the revealed submissions in-app.
6. Explore the frozen top-ranked submissions directly from the bounty page.

## Access Rules

- Buyers unlock the full frozen top 20 reveal set for that bounty.
- Posters retain preview access to the top winning submissions without buying the full bundle.
- Unauthorized viewers cannot access the revealed content.
- Submitters must have accepted the paid-reveal consent terms at submission time.

## Funding The Purchase

Reveal bundles are bought in USDC on Base. If your connected wallet does not have enough USDC on Base, the finished bounty page will send you into the bridge modal so you can fund the purchase without leaving the flow.

Bridging only funds the purchase. It does not unlock the bundle by itself. After bridging, you still approve USDC if needed and complete the onchain buy transaction.

## Claiming Reveal Revenue

If you are in the top 20 reveal set, your share of reveal revenue accrues every time someone buys the bundle. You can claim your accrued revenue at any time by calling `claimRevealRevenue` on the smart contract.

Revenue is paid in the same token as the bounty (USDC). If you have a delegate wallet set, payouts go to your delegate address automatically. A delegate can also claim on your behalf using `claimRevealRevenueFor`, which is useful when the solver wallet has no ETH for gas.

Reveal revenue is completely separate from bounty winner payouts. A solver can be both a bounty winner and a reveal-set member, claiming from both independently.

---

[← How It Works](how-it-works.md) | [Reveal Market Terms →](reveal-terms.md)
