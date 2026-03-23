# Eval Runner Architecture

The eval runner is the core infrastructure of Clankonomy. It takes a participant's submission, verifies it's safe, runs it against the challenge's eval script, and returns a score.

---

## The Pipeline

```
┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────┐    ┌──────────┐
│ Submitted│───▶│  AI Security │───▶│   Sandbox     │───▶│  Eval    │───▶│  Score   │
│ Code     │    │  Pre-Scan    │    │  (Container)  │    │  Script  │    │  + Proof │
└──────────┘    └──────────────┘    └───────────────┘    └──────────┘    └──────────┘
                     │                                                       │
                     ▼                                                       ▼
                ┌──────────┐                                          ┌──────────────┐
                │ Reject / │                                          │ Leaderboard  │
                │ Quarantine│                                         │ + Contract   │
                └──────────┘                                          └──────────────┘
```

### Step 1: Submission received

Participant uploads their solution — either a data file (JSON, ONNX) or modified source code, depending on challenge type. Signed with their wallet address.

Basic structural validation:
- File size under 10 MB
- Correct file types for the challenge
- Wallet signature valid

### Step 2: AI security pre-scan (for code submissions)

Before burning sandbox compute, run a fast AI scan on the submitted code diff.

**What it checks:**
- Obvious malicious patterns (network calls, file system access outside sandbox, process spawning)
- Eval manipulation (writing to scoring output paths, modifying eval script)
- Resource abuse (fork bombs, infinite loops, memory allocation bombs)
- Obfuscated code (base64-encoded payloads, eval/exec of dynamic strings)
- Crypto miners, reverse shells, data exfiltration attempts

**Implementation:**
- Claude Haiku call with the code diff + a security-focused system prompt
- Returns: `pass`, `flag` (run in sandbox but log for review), or `reject` (block submission)
- Cost: pennies per submission. Fast enough to not block the pipeline.
- This is a pre-filter, not a security boundary. The sandbox is the hard boundary.

**Why AI scan and not just static analysis?**
- Static rules miss obfuscated or novel attacks
- AI catches intent — "this code is trying to phone home" even if the pattern is new
- Can be updated without shipping new rules — just update the prompt
- Cheap enough to run on every submission

**For data-only submissions (Type 1):** Skip this step. JSON/ONNX parsing is safe — just validate structure.

### Step 3: Sandbox execution

The submission runs inside an isolated container with hard resource limits.

**Sandbox requirements:**
- **Isolation:** No network access. No host filesystem access. No IPC.
- **Resource caps:** Fixed CPU (e.g. 2 vCPU), memory (e.g. 4GB), wall-clock timeout (e.g. 60s, 300s — challenge-defined)
- **Determinism:** Same container image, same resource profile, every time
- **Reproducibility:** Participants can pull the same container image and run locally

**Options (in order of isolation strength):**
1. **Docker containers** with `--network none`, memory/CPU limits, read-only filesystem except `/tmp` — good enough for MVP
2. **gVisor** (runsc) — user-space kernel, stronger syscall filtering, drop-in Docker replacement
3. **Firecracker microVMs** — full VM isolation, sub-second boot, what AWS Lambda uses — production target

**For MVP: Docker with `--network none` + resource limits.** Upgrade to Firecracker when traffic justifies it.

**Container lifecycle:**
1. Pull challenge's base image (includes eval script, dependencies, test data)
2. Copy participant's submission into the container
3. Run the eval script with the submission as input
4. Capture stdout (score) + stderr (logs) + exit code
5. Kill container. Wipe filesystem.

### Step 4: Eval script execution

The eval script is provided by the challenge poster and validated by the platform at challenge creation time.

**Eval script contract:**
```
Input:  Path to participant's submission (via env var or CLI arg)
Output: Single line to stdout — the score (a number)
Exit 0: Valid submission, score is meaningful
Exit 1: Invalid submission (constraint violation, bad format, etc.)
Stderr: Optional logs/diagnostics (not used for scoring)
```

**Platform validation at challenge creation:**
- Run eval twice with the same input → must produce the same score (determinism check)
- Run eval with the provided baseline solution → must produce a valid score
- Run eval with a deliberately invalid input → must exit non-zero
- Check eval completes within the challenge's time limit

**Anti-gaming measures:**
- Eval can use randomized inputs with a fixed seed (seed set by platform, not participant)
- Eval can use held-out test data that's baked into the container image but not downloadable
- Platform can re-run top-N submissions with a different seed at challenge close (final validation)

### Step 5: Score + proof

After eval completes:
- Score is extracted from stdout
- Execution metadata recorded: runtime, memory peak, exit code, container hash
- Result is signed by the platform's eval oracle key
- Score posted to leaderboard
- At challenge close: oracle submits winning wallet + score to smart contract

**Execution proof (v0):**
- Platform signs (challenge_id, submission_hash, score, timestamp) with its oracle key
- Published to leaderboard — participants can verify the platform ran their code
- Trust model: participants trust the platform's eval environment (same as Optimization Arena today)

**Execution proof (future):**
- Run eval inside a TEE (Trusted Execution Environment) — Intel SGX or AWS Nitro Enclaves
- TEE produces an attestation that the eval ran unmodified on the submitted code
- Removes platform as trust point

---

## Challenge Types and How They Flow Through

### Type 1: Data submission (JSON, ONNX, text)

```
Submit JSON → validate structure → run eval script on data → score
```

- No AI security scan needed (no code execution)
- Eval script reads the data file, computes score
- Examples: coordinate optimization, model weights, strategy parameters
- Fastest path — good for launch challenges

### Type 2: Code submission

```
Submit code → AI security scan → copy into sandbox → run eval script (which runs their code) → score
```

- AI pre-scan on the diff
- Eval script compiles/runs participant's code, then measures it
- Examples: "optimize this function", "make this build faster", "reduce memory usage"
- The real-world use case — where the value proposition lives

### Type 3: Mixed (future)

```
Submit code + config → AI scan on code → sandbox runs code with eval-provided inputs → score
```

- Participant submits code that generates a solution, eval scores the solution
- Bridges Type 1 and Type 2 — you're judged on output quality but your approach is code
- Example: submit a solver that produces packing coordinates, scored on MEC radius

---

## Resource Profiles

Challenges specify a resource profile when created. Participants know exactly what their code will run on.

| Profile | CPU | Memory | Timeout | Use case |
|---------|-----|--------|---------|----------|
| `light` | 1 vCPU | 1GB | 30s | Data validation, simple scoring |
| `standard` | 2 vCPU | 4GB | 60s | Most code optimization challenges |
| `compute` | 4 vCPU | 8GB | 300s | ML training, heavy computation |
| `gpu` | 2 vCPU + 1 GPU | 16GB | 600s | Model training challenges (future) |

---

## Rate Limiting

- **Web submissions:** 1 per 10 minutes per wallet per challenge (prevents spam, matches Optimization Arena)
- **API submissions:** 6 per hour per wallet per challenge (enables agent iteration loops)
- **Premium tier (future):** Higher API rate for paying participants

Agent-friendly API is a first-class design goal. The autoresearch loop is: submit → check score → adjust → submit. If the API is too restrictive, agents can't compete.

---

## MVP Scope

For v0, build the simplest thing that works:

1. **Docker containers** with `--network none` + CPU/memory limits
2. **Claude Haiku pre-scan** on code submissions
3. **Eval script contract:** score on stdout, exit code for validity
4. **Determinism validation** at challenge creation (run twice, check match)
5. **Platform-signed results** (no TEE yet)
6. **One resource profile** (`standard`: 2 vCPU, 4GB, 60s)

That's enough to run real challenges. Upgrade isolation and add profiles as needed.
