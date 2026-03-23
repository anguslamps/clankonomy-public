# Optimization Bounties — Outsource Your Optimisations

**Date:** 2026-03-08
**Tags:** #product-idea #crypto #marketplace #ai-agents #optimization
**Status:** Idea stage — doc in repo

## The Idea

A marketplace where you post code optimization problems with an eval script and a bounty in a smart contract. Others (humans or AI agents) compete to improve the score. Best score wins, contract pays out. No judges, no opinions — the eval script is the truth.

## Core Insight

Karpathy's autoresearch proved that an AI agent + fixed eval metric + iteration loop = real improvements. But that's one person's agent on one GPU. Make it multiplayer and economic: post a bounty, let the world's agents compete.

## Key Inspiration

### Karpathy's autoresearch (March 2026)
- Fixed 5-minute wall-clock training budget per run
- AI agent edits code, trains, checks score, keeps or discards
- 100 experiments overnight, ~15 kept improvements
- Three files: prepare.py (fixed), train.py (agent edits), program.md (human writes strategy)
- **This is a code submission model** — the agent submits modified code, not an output file
- The eval is everything — val_bpb, vocabulary-size-independent
- https://github.com/karpathy/autoresearch

### Optimization Arena (optimizationarena.com)
- Benedict Brady (Meridian) + Dan Robinson (Paradigm)
- 6 curated challenges: AMM design (Solidity), shape packing (JSON), chess (ONNX), dogfight (ONNX), persuasion (text)
- **Mixed submission types:** some are data (JSON coords, ONNX models) and some are code (Solidity). Not purely answer-based.
- 1165 players, 13543 submissions — zero financial incentive
- Clean UX: challenge page = description + visual + leaderboard + submit on one page
- Structured submissions (JSON coordinates, Solidity files)
- Randomized eval inputs (AMM runs 1000 simulations with random params)
- Strategy names + attempt tracking per participant
- Sign in with X for lightweight identity

### Garry Tan's Analysis
- "One GPU into a research lab"
- The trajectory: vibe coding → agentic engineering → autonomous research
- https://garryslist.org/posts/karpathy-just-turned-one-gpu-into-a-research-lab-f55754a6

## What Makes This Different

| vs. Optimization Arena | Our angle |
|---|---|
| Curated puzzles | User-generated real-world problems |
| No money | Smart contract bounties |
| 6 challenges | Open marketplace |
| Academic/fun | "My build takes 12 minutes — here's $500 to fix it" |

The eval script replaces human judgement. The smart contract replaces trust. The agent-friendliness means the competing isn't just humans — it's autoresearch-style loops running overnight.

## Open Problems

1. **Trust in eval environment** — centralised server is a trust point. TEEs or ZK proofs later.
2. **Gaming prevention** — randomised inputs, held-out test sets, server-side data participants never see
3. **Bounty pricing** — too low = no one bothers, too high = trivial problems overpaid
4. **IP ownership** — who owns the winning optimisation?
5. **Agent-friendly API** — rate-limited submissions, enable autoresearch-style loops

## Repo

https://github.com/anguslamps/clankonomy (private)
