# Challenge Anatomy — Learnings from semicircle-packing

**Date:** 2026-03-08
**Source:** `/Users/angusbuttar/Documents/Github/semicircle-packing` (our Optimization Arena attempt)
**Tags:** #challenge-design #eval #architecture

## What a good challenge looks like

The semicircle-packing repo is a clean example of a well-structured optimization challenge. The problem: pack 15 unit semicircles into the smallest enclosing circle. Score = radius (lower is better). No overlaps allowed.

### The structure that works

```
problem definition (challenge.txt)    — what to optimize, constraints, format
eval logic (geometry.py)              — deterministic scoring + validation
solver code (optimizer.py, solve.py)  — what participants actually write/edit
solution file (solution.json)         — the submission artifact
```

The key separation: **problem + eval are fixed, solver is what varies**. The poster provides the first two. Participants compete on the third.

### Properties that make eval work

1. **Single metric** — MEC radius. One number. Unambiguous ordering.
2. **Hard constraints** — no overlaps (binary pass/fail gate before scoring)
3. **Deterministic** — same solution.json always produces the same score
4. **Fast** — MEC + overlap check runs in milliseconds. This enables 500k+ iteration loops.
5. **Self-contained** — no network calls, no external state, no randomness in eval

If eval is slow or non-deterministic, the whole autoresearch loop breaks down.

### Solution format

Trivially simple: JSON array of `{x, y, theta}`. Any language can produce it. Any eval can consume it. The eval doesn't run participant code — it reads their output.

But this is only one challenge type.

## Two challenge types (not one)

This was an important realization. We initially oversimplified by treating semicircle-packing as the template. There are actually two distinct types:

### Type 1: Output optimization
- **Submit:** A solution file (JSON, ONNX model, text)
- **Eval runs:** Scoring function on the submitted output
- **Examples:** Semicircle packing (JSON coords), chess engine (ONNX), persuasion (text)
- **Safety:** Trivial — no code execution, just data parsing
- **Agent-friendly:** Very — fast iteration, no sandbox needed locally

### Type 2: Code optimization
- **Submit:** Modified source code
- **Eval runs:** The participant's actual code in a sandbox
- **Examples:** "Make this build faster", "Optimize this query", AMM (Solidity)
- **Safety:** Requires sandboxing + security scanning
- **Agent-friendly:** Also good — this is exactly what Karpathy's autoresearch does

**Karpathy's autoresearch is Type 2.** The agent edits `train.py`, runs it, checks the score. The submission IS code.

**Optimization Arena is mixed.** Packing = Type 1 (JSON). AMM = Type 2 (Solidity). Chess = Type 1 (ONNX).

### Implication for Clankonomy

We need to support both, but **Type 2 is the real-world use case** — "my build takes 12 minutes, here's $500." That's code optimization, not coordinate optimization.

Type 1 is simpler to build and good for launch, but Type 2 is where the value proposition lives.

## What the semicircle-packing solver teaches us about participants

The solver code reveals what serious participants actually do:

1. **Multi-phase pipelines** — not one algorithm, but 8 phases chained together (initial configs → polish → basin-hopping → compression → DE → dual annealing → SA → final polish)
2. **Diverse initial conditions** — 60+ starting configurations with geometric insight. The starting point matters as much as the optimizer.
3. **Domain-specific moves** — SA perturbations that understand semicircle geometry (nest tucks, ring rotations, flat-edge-outward). Generic optimizers plateau.
4. **Fast surrogate objectives** — smooth overlap penalty for optimization, exact analytical check for validation. Different eval speeds for different purposes.
5. **Campaign structure** — 5 sequential loops with explicit baselines and improvement tracking

This means:
- **Eval must be fast** — participants will call it hundreds of thousands of times
- **Local eval must match server eval** — any discrepancy destroys trust
- **Multiple submissions should be encouraged** — Optimization Arena's top AMM solver has 159 attempts
- **Rate limiting needs to be generous enough for iteration** — 1 per 10 min is fine for anti-spam, but the agent-friendly API needs higher throughput

## Gaps in the semicircle-packing model

Things that would need to exist in a bounty version but don't exist in the local repo:

1. **No submission API** — everything runs locally
2. **No anti-gaming** — eval is fully public; a bounty needs randomized inputs or held-out test sets
3. **No resource limits** — solver runs as long as you want; a bounty needs time/compute caps on eval
4. **No provenance** — no timestamp, hash, or proof of when/how a solution was generated
5. **No security layer** — no need for one when you're only running your own code

## Key numbers worth remembering

- 15 semicircles × 3 params = 45 continuous variables
- Current best: r = 3.11 (target: 3.0, stretch: 2.86, theoretical: 2.74)
- 1165 players, 13543 submissions on Optimization Arena (zero financial incentive)
- Top AMM solver: 159 attempts
- Karpathy: 100 experiments overnight, ~15 kept improvements
- Eval speed budget: < 1ms per call for the hot loop
