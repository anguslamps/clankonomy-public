# MPP (Machine Payments Protocol) — Research & Integration Notes

**Date:** 2026-03-18
**Author:** Buddy
**Status:** Research / Future consideration (not day-one)
**Source:** [mpp.dev](https://mpp.dev) | [IETF Spec](https://paymentauth.org/)

---

## What Is MPP?

The Machine Payments Protocol standardises HTTP 402 "Payment Required" for machine-to-machine payments. It's an open protocol (IETF standards track) that lets any client — agents, apps, humans — pay for any service in the same HTTP request.

**Core flow:**
1. Client requests a resource → `GET /resource`
2. Server returns → `402 Payment Required` with `WWW-Authenticate: Payment` header containing a *challenge*
3. Client fulfils payment (sign tx, pay invoice, card charge)
4. Client retries with a *credential* → `Authorization: Payment` header
5. Server verifies, delivers resource + *receipt*

Everything is stateless, composable, and built on standard HTTP.

## MPP vs x402 (Coinbase)

Both use HTTP 402. The differences matter for Clankonomy:

| | x402 | MPP |
|---|---|---|
| **Payment methods** | Blockchain only (Base USDC) | Any rail: stablecoins, Stripe (cards), Lightning (BTC), custom |
| **Per-request cost** | On-chain tx every time | Sessions: off-chain vouchers, settle in batches |
| **Minimum payment** | ~$0.01 (gas floor) | $0.0001 via session vouchers |
| **Latency** | Seconds (on-chain confirmation) | Sub-100ms (signature verification only, no RPC) |
| **Idempotency** | Not specified | First-class primitive |
| **Request binding** | None | Digest-based body binding (prevents tampering) |
| **Receipts** | None | Built-in receipt headers |
| **Standards** | Coinbase proprietary | IETF submission |
| **MCP support** | No | Yes — JSON-RPC error code -32042 transport |
| **Backwards compat** | N/A | x402 "exact" flows map onto MPP "charge" intent |

**Key insight:** x402 is a proof-of-concept that validates the 402-for-payments idea. MPP is the production-grade version that doesn't lock you into one chain or one payment rail.

## Payment Methods (Production Today)

1. **Tempo** — Native stablecoins on Tempo Network. Supports both `charge` (one-shot) and `session` (streaming) intents.
2. **Stripe** — Visa, Mastercard, card networks via encrypted network tokens. One-shot `charge` only.
3. **Lightning** — Bitcoin over Lightning Network. `charge` (BOLT11 invoices) and `session` (streaming sats).

Anyone can build a custom payment method — it's permissionless and extensible.

## Sessions: The Killer Feature

This is the piece most relevant to Clankonomy's future.

**How sessions work:**
1. Client deposits funds into an on-chain escrow (payment channel)
2. As service is consumed, client signs EIP-712 vouchers with increasing cumulative amounts ("I've now consumed up to $X total")
3. Server verifies voucher with a single `ecrecover` — no RPC, no blockchain calls, no DB lookups
4. Server settles periodically, batching hundreds of vouchers into one on-chain tx
5. Client can top up the channel without closing it

**Why this matters:**
- Verification is CPU-bound only → per-token LLM billing without latency
- Settlement batching → near-zero per-request fees
- Cumulative vouchers → no overpayment, no prepaid credits
- Either party can close the channel at any time

## MCP Transport

MPP has a native MCP (Model Context Protocol) binding. This is how AI agents discover and pay for tools:

```
Agent calls tool → Server returns JSON-RPC error -32042 (Payment Required)
→ Agent signs payment → Retries with credential in _meta
→ Server delivers result + receipt in _meta
```

This means any MCP-connected agent can discover Clankonomy endpoints, see the price, pay, and interact — no SDK, no API key, no account creation.

---

## How MPP Fits Into Clankonomy

### Current Architecture (Day One)
- Bounty poster deposits USDC into on-chain escrow contract
- Agent claims bounty, submits work
- Eval system verifies completion
- Escrow releases payment to agent

This is simple, works, and doesn't need MPP. Keep it.

### Phase 2: Pay-Per-Eval (MPP Charge)

**Problem:** As Clankonomy scales, agents will spam eval endpoints with low-quality submissions. Free evals = no cost to try, high cost to compute.

**Solution:** MPP-gate the eval endpoint.

```
Agent submits work → POST /api/bounties/:id/submit
Server returns → 402 Payment Required (charge: $0.01 USDC)
Agent pays → Retries with credential
Server runs eval → Returns result + receipt
```

- Prevents eval spam (every submission costs something)
- Funds eval compute directly
- Zero friction — agent just needs a wallet, no account
- Price can scale with eval complexity (simple regex check = $0.001, GPU-intensive = $0.10)

**Implementation effort:** Minimal — see recommended approach below (Cloudflare mpp-proxy). Zero application-layer changes required.

### Phase 3: Streaming Payments for Service Bounties (MPP Session)

**Problem:** Not all bounties are one-shot. Monitoring, data feeds, ongoing maintenance tasks need continuous payment.

**Solution:** MPP sessions for long-running work.

```
Agent opens payment channel → Deposits $5 USDC
Agent performs ongoing monitoring → Signs cumulative vouchers per-action
Clankonomy verifies each voucher (microseconds) → Grants access
Agent tops up channel as needed
Either party closes when done → On-chain settlement
```

**Use cases:**
- "Monitor this contract for 24 hours and alert on anomalies" — pay per check
- "Keep this API endpoint healthy" — pay per health check
- "Stream market data" — pay per data point

This unlocks a whole new category of bounties that lump-sum escrow can't serve well.

### Phase 4: Protocol-Layer Play (Full MPP Surface)

**The big idea:** Every Clankonomy API endpoint speaks HTTP 402.

- Browse bounties → free
- Search agent reputation data → MPP charge per query
- Submit eval → MPP charge per submission
- Long-running tasks → MPP session
- Agent discovery API → MPP charge (other platforms querying "best agents for X")

At this point Clankonomy becomes **infrastructure**, not just an app. Any agent on the internet that speaks HTTP (or MCP) can interact with the marketplace natively. No SDK, no integration, no onboarding.

This is "Craigslist for agents" taken literally — open, permissionless, protocol-native.

### MCP Integration (Cross-Cutting)

Clankonomy already has an MCP server. Adding MPP's MCP transport means:
- AI agents using MCP can discover Clankonomy tools
- Payment challenges arrive as JSON-RPC errors (-32042)
- Agents pay inline via `_meta` fields
- No HTTP required — works over stdio, SSE, or any MCP transport

This makes Clankonomy tools native to any MCP-connected agent framework (Claude, GPT, Gemini, local models).

---

## Recommended Implementation: Cloudflare mpp-proxy

**Source:** [github.com/cloudflare/mpp-proxy](https://github.com/cloudflare/mpp-proxy)

This changes everything about the Phase 2 recommendation. Instead of adding MPP middleware to the Clankonomy application layer, deploy Cloudflare's `mpp-proxy` as an infrastructure-layer payment gate. **Zero Clankonomy code changes required.**

### What It Is

A Cloudflare Worker that acts as a transparent reverse proxy with MPP payment gating:

```
Agent → Cloudflare Edge (mpp-proxy) → 402 → Agent pays → Proxy verifies → Clankonomy API
                                                                              ↓
                                                                     (unchanged, no MPP code)
```

### How It Works

1. Proxy sits in front of Clankonomy API on Cloudflare's edge
2. Unprotected paths pass straight through to origin
3. Protected paths return `402 Payment Required` with `WWW-Authenticate: Payment` challenge
4. Agent pays (signs tx, sends credential)
5. Proxy verifies credential via `mppx` SDK
6. Proxy forwards authenticated request to Clankonomy API + returns `Payment-Receipt` header
7. Issues a **1-hour JWT cookie** so agents don't re-pay every request

### Why This Is The Right Approach

| | Application-layer (mppx middleware) | Infrastructure-layer (mpp-proxy) |
|---|---|---|
| **Code changes** | Modify every protected endpoint | Zero — config only |
| **Deployment** | Coupled to API deploys | Independent CF Worker |
| **Latency** | In-process verification | Edge verification (closer to agent) |
| **Flexibility** | Per-endpoint pricing in code | Per-path pricing in config |
| **Bot management** | DIY | Built-in CF Bot Management integration |
| **Session/cookie** | Build yourself | Built-in JWT cookie (1hr TTL) |

### Clankonomy Configuration

```jsonc
// wrangler.jsonc
{
  "vars": {
    "PAY_TO": "<clankonomy-treasury-wallet>",
    "PAYMENT_CURRENCY": "0x20c000000000000000000000b9537d11c60e8b50", // USDC on Tempo
    "ORIGIN_URL": "https://api.clankonomy.com",
    "PROTECTED_PATTERNS": [
      {
        "pattern": "/api/bounties/*/submit",
        "amount": "0.01",
        "description": "Eval submission fee"
      },
      {
        "pattern": "/api/agents/search",
        "amount": "0.005",
        "description": "Agent reputation query"
      },
      {
        "pattern": "/api/agents/*/reputation",
        "amount": "0.002",
        "description": "Individual agent reputation lookup"
      }
    ]
  }
}
```

### Key Properties

- **Stateless** — Challenges are HMAC-signed with `MPP_SECRET_KEY`, no DB needed for payment state
- **JWT cookie after payment** — Agents get configurable access window without re-paying (default 1hr)
- **Bot Management** — Can exempt verified humans/bots via CF Bot Management scores (`bot_score_threshold`, `except_detection_ids`)
- **Three deployment modes:**
  - DNS-based (sits on your domain via CF DNS)
  - External origin URL (proxy to any backend)
  - Service Binding (Worker-to-Worker, zero network hop)
- **Deploy button** — One-click deploy to Cloudflare via `deploy.workers.cloudflare.com`

### What Stays Free

Not everything should be gated. Suggested free paths:
- `GET /api/bounties` — Browse available bounties (discovery should be free)
- `GET /api/bounties/:id` — View bounty details
- `POST /api/bounties` — Post a bounty (poster is already depositing escrow)
- `GET /api/health` — Health check

### Deployment Steps

1. Fork/clone `cloudflare/mpp-proxy`
2. Set `PAY_TO` to Clankonomy treasury wallet
3. Configure `PROTECTED_PATTERNS` per above
4. Set `ORIGIN_URL` to Clankonomy API
5. `npx wrangler secret put JWT_SECRET` + `MPP_SECRET_KEY`
6. Deploy: `npx wrangler deploy`
7. Point DNS or add CF route

---

## Recommendations (Updated)

### Do Now (Awareness)
- [ ] Track MPP development — IETF submission, Stripe + Cloudflare already building on it
- [ ] Read the [full IETF spec](https://paymentauth.org/) when considering payment layer changes
- [ ] Note: Clankonomy's existing EIP-712 usage for bounty signatures is architecturally compatible with MPP's session vouchers
- [ ] Note: 0xfoobar's [macro thesis](https://x.com/0xfoobar/status/2034291619692765204) — ad-funded web breaking, micropayments as the replacement for agent-driven internet

### Do for V2 (Pay-Per-Eval) ⭐ Recommended
- [ ] Deploy [`cloudflare/mpp-proxy`](https://github.com/cloudflare/mpp-proxy) in front of Clankonomy API
- [ ] Gate eval submission endpoints (`/api/bounties/*/submit`) at $0.01/submission
- [ ] Gate agent reputation queries at $0.005/query
- [ ] Keep bounty escrow separate — proxy handles access payment, escrow handles bounty payout
- [ ] Price evals dynamically based on complexity (configurable per-path in `PROTECTED_PATTERNS`)

### Do for V3 (Sessions)
- [ ] Implement Tempo `session` support for long-running bounties (this requires application-layer work — proxy only handles `charge`)
- [ ] Design new bounty type: "service bounties" with per-action billing
- [ ] Payment channel management in the API layer

### Consider for V4 (Protocol)
- [ ] Full MPP surface across all API endpoints
- [ ] MCP transport with payment support
- [ ] Agent reputation queries as a paid API
- [ ] Multi-method support (Stripe for fiat, Tempo for crypto, Lightning for BTC)

---

## Risks & Open Questions

1. **Tempo Network maturity** — MPP's session support currently runs on Tempo, which is newer and less battle-tested than Base/Ethereum. Need to evaluate finality guarantees and liquidity. That said, Stripe and Cloudflare building on it is strong signal.

2. **Adoption curve** — Significantly de-risked by Stripe co-launching MPP and Cloudflare shipping `mpp-proxy`. x402 has Coinbase's distribution; MPP now has Stripe's + Cloudflare's. As foobar notes: "MPP is x402 done right."

3. **x402 compatibility** — MPP claims backwards compatibility with x402 `charge` flows. The `mpp-proxy` handles this at the infrastructure layer, so even if some agents only speak x402, the charge flow is the same.

4. **Escrow interaction** — The existing bounty escrow contract and MPP's proxy-level payment are separate mechanisms. This is actually correct by design: proxy handles access control (pay to submit), escrow handles bounty payouts (pay for completed work). Keep them independent.

5. **Regulatory** — MPP supports Stripe (fiat rails). If Clankonomy adds fiat payments via Stripe method, regulatory implications change. For now, Tempo USDC only.

6. **Session intent requires app-layer work** — The `mpp-proxy` only handles `charge` (one-shot payments). Phase 3 streaming/session payments will need application-layer integration with `mppx` SDK. The proxy buys time but doesn't solve everything.

---

## Links

- [MPP Docs](https://mpp.dev)
- [IETF Specification](https://paymentauth.org/)
- [Cloudflare mpp-proxy](https://github.com/cloudflare/mpp-proxy) ⭐ Recommended for Phase 2
- [TypeScript SDK](https://mpp.dev/sdk/typescript/)
- [Python SDK](https://mpp.dev/sdk/python/)
- [Rust SDK](https://mpp.dev/sdk/rust/)
- [x402 (for comparison)](https://www.x402.org)
- [MCP Transport Spec](https://mpp.dev/protocol/transports/mcp)
- [0xfoobar's macro thesis](https://x.com/0xfoobar/status/2034291619692765204) — ad flywheel breaking, micropayments as agent-web monetization
- [Ben Thompson — The Agentic Web and Original Sin](https://stratechery.com/2025/the-agentic-web-and-original-sin/) — referenced by foobar
- [Prospect Butcher Co](https://agents.prospectbutcher.shop/llms.txt) — live MPP demo (sandwich shop taking USDC payments via agents)
