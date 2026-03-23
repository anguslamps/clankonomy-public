# x402 for Submission Spam Prevention

**Date:** 2026-03-10
**Tags:** #architecture #api #spam-prevention #x402 #payments
**Status:** Decided — implement when API is built

---

## Decision

Use [x402](https://www.x402.org/) as a per-call payment layer on the submission endpoint. This is **not** a replacement for the smart contract escrow — it's a complementary spam-prevention mechanism on the API layer.

---

## Context

We evaluated x402 as a potential replacement for `ClankonBounty.sol`. It's not viable for that — x402 is a push-payment HTTP protocol with no escrow, no conditional release, and no time-locking. The smart contract stays.

However, x402 is a good fit for a different problem: **preventing submission spam**.

Without a cost on submission:
- Bots can flood a bounty with random solutions
- Eval execution (which costs compute) becomes a DoS vector
- The leaderboard becomes noise
- Legitimate solvers get drowned out

---

## How It Works

x402 uses HTTP's long-reserved 402 status code as a native payment mechanism:

```
Agent → POST /api/bounties/:id/submit
API   → 402 Payment Required { amount: "$0.01 USDC", network: "base" }
Agent → retries with signed payment payload
API   → verifies via facilitator → runs eval → returns score
```

The API adds a single middleware layer specifying which endpoints require payment and how much.

---

## What to Charge

| Endpoint | Suggested Fee | Rationale |
|---|---|---|
| `POST /submit-solution` | $0.01–$0.05 USDC | Covers eval compute, deters spam |
| `GET /problems` | Free | Discovery should be frictionless |
| `GET /leaderboard` | Free | Public info |
| `POST /create-bounty` | Free | On-chain tx already costs gas |

Start at $0.01. High enough to make bulk spam expensive, low enough that a serious solver won't notice.

---

## x402 Technical Notes

- **Supported chains:** Base (mainnet + Sepolia), Solana (mainnet + Devnet)
- **Tokens:** EIP-3009 tokens on Base (includes USDC), SPL/Token-2022 on Solana
- **Settlement:** On-chain, ~1 second, irreversible push payments
- **Fees:** Zero protocol fees (only network gas)
- **SDK:** TypeScript, Go, Python
- **No escrow:** x402 is purely a push-payment rail — conditional flows not supported

**Note:** x402 supports Base/Solana. Our bounty escrow is also on Base, so both the submission fee and bounty reward use Base USDC — a clean single-chain setup.

---

## Implementation Sketch (Hono API)

```typescript
import { withPaymentRequired } from "@x402/hono"; // hypothetical SDK import

app.post(
  "/api/bounties/:id/submit",
  withPaymentRequired({ amount: "0.01", token: "USDC", network: "base" }),
  async (c) => {
    // payment already verified by middleware
    // run eval, return score
  }
);
```

The middleware handles the 402 handshake, calls the facilitator's `/verify` + `/settle` endpoints, and only passes through if payment is confirmed.

---

## Why Not Just Rate-Limit?

Rate-limiting by IP or wallet is bypassable and creates friction for legitimate users. A small economic cost:
- Scales with attacker effort, not defender effort
- Works natively for AI agents (they already hold wallets)
- Self-selects for solvers who are serious
- Generates a small revenue stream (submission fees flow to the platform)

---

## When to Implement

Build this when the API is first scaffolded. Adding x402 middleware is a one-time ~30min integration — much easier to add early than retrofit later.

Not a blocker for MVP. Implement before opening submissions to public/agents.
