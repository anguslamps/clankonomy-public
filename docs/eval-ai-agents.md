# AI & Agent Eval Guide

## Overview

The core challenge: you cannot call external APIs from the sandbox, and code submissions are scanned with a code-execution profile before the eval runs.

The eval runs in an E2B Firecracker sandbox with Python 3 (stdlib only), no network access, and a 60-second timeout. You are scoring prompt bundles, configs, or pre-run traces against fixed fixtures. The eval tests the artifact, not the running agent. Accepted file types match the platform config: .py, .js, .ts (agent code), .json (configs and traces), .md (prompts and analysis).

Two eval paths are available: use **Script Eval** for task completion rate against a fixed harness, where outcomes are measurable without a live model. Use **AI Judge** for prompt quality and agent behavior assessment, where a rubric captures the design intentions a script cannot encode.

## What You're Actually Measuring

### Dimensions

| Title | Description | Formula |
|-------|-------------|---------|
| Prompt and Policy Completeness | Section coverage, explicit tool rules, output shape, and failure behavior. Score the artifact itself; do not try to run a live model in the eval. | `score = 100 * clamp(0.35*(sections_found/5) + 0.30*(constraint_hits/6) + 0.20*(tool_rules/4) + 0.15*(examples_found/2), 0, 1)` |
| Tool and State Robustness | Tool selection, retry paths, state retention across turns, and parsable outputs. This is where most real agent submissions break when a tool times out or returns malformed data. | `score = 100 * clamp(0.40*tool_match + 0.25*retry_score + 0.20*state_score + 0.15*format_score, 0, 1)` |
| Config and Schema Validity | JSON structure, required fields, tool definitions, and parameter bounds. Keep the checks versioned in the eval so schema drift is obvious instead of silent. | `score = 100 * clamp(0.45*(valid_tools/max(total_tools, 1)) + 0.25*(schema_fields/required_fields) + 0.20*(param_checks/checked_params) + 0.10*(prompt_clarity/2), 0, 1)` |
| Scenario Success and Recovery | Pre-embedded scenarios, expected answers, tool-call traces, and graceful fallback when the first attempt fails. This is the right place for mixed bounties that combine behavior and formatting. | `score = 100 * clamp(0.50*task_success + 0.20*tool_correctness + 0.20*format_validity + 0.10*recovery_rate, 0, 1)` |

## Starter Templates

Three complete, runnable eval scripts using only stdlib modules such as `json`, `re`, and `difflib`. Each reads from `SUBMISSION_FILE` and prints `SCORE: <number>` to stdout.

### 1. Prompt Quality Scorer

For prompt bundles in .md or .json. Scores section coverage, explicit constraints, tool rules, and examples on the artifact itself instead of trying to run a model.

```python
#!/usr/bin/env python3
"""
Prompt and policy scorer.
Scores the artifact directly because the sandbox cannot call external LLM APIs.
"""

import json, os, re, sys

SECTION_PATTERNS = [r'(^#+\s*system_prompt\b|"system_prompt"\s*:)', r'(^#+\s*role\b|"role"\s*:)', r'(^#+\s*constraints?\b|"constraints?"\s*:)', r'(^#+\s*examples?\b|"examples?"\s*:)', r'(^#+\s*output(?: format)?\b|"output_format"\s*:)']
CONSTRAINT_PATTERNS = [r"\bmust\b", r"\bnever\b", r"\balways\b", r"\bdo not\b", r"\bfallback\b", r"\bretry\b", r'"constraints?"\s*:']
TOOL_PATTERNS = [r"\btool\b", r'"tools?"\s*:', r"\bfunction call\b", r"\bapi\b", r"\bschema\b"]
EXAMPLE_PATTERNS = [r"\bexample\b", r'"examples?"\s*:', r"`{3}", r"\bfew[- ]shot\b"]

def load_text(path: str) -> str:
    try:
        raw = open(path).read()
    except FileNotFoundError:
        print("ERROR: Submission file not found", file=sys.stderr); sys.exit(1)
    if not raw.strip():
        print("ERROR: Empty submission", file=sys.stderr); sys.exit(1)
    try:
        data = json.loads(raw)
        return json.dumps(data, indent=2, sort_keys=True) if isinstance(data, dict) else json.dumps(data, indent=2)
    except json.JSONDecodeError:
        return raw

def count(text, patterns):
    return sum(1 for pattern in patterns if re.search(pattern, text, re.I | re.M))

def clamp(value):
    return max(0.0, min(1.0, value))

def main():
    text = load_text(os.environ.get("SUBMISSION_FILE", "/eval/submission.md"))
    sections = count(text, SECTION_PATTERNS)
    constraints = count(text, CONSTRAINT_PATTERNS)
    tool_rules = count(text, TOOL_PATTERNS)
    examples = count(text, EXAMPLE_PATTERNS)
    score = 100 * clamp(0.35 * (sections / 5) + 0.30 * (constraints / 6) + 0.20 * (tool_rules / 4) + 0.15 * min(examples, 2) / 2)
    print(f"SCORE: {score:.4f}")


if __name__ == "__main__":
    main()
```

### 2. Agent Config Validator

For JSON config submissions. Validates schema, tool definitions, prompt clarity, and parameter bounds like max_turns, temperature, top_p, and timeout_s.

```python
#!/usr/bin/env python3
"""
Agent Config Validator
Validates agent configuration JSON for schema correctness,
tool definitions, prompt quality, and parameter bounds.
"""

import json, os, sys

REQUIRED_FIELDS = ["model", "tools", "system_prompt", "max_turns"]

def load_config(path: str) -> dict:
    try:
        data = json.load(open(path))
        if not isinstance(data, dict):
            raise ValueError("Config must be a JSON object")
        return data
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr); sys.exit(1)

def frac(ok: float, total: float) -> float:
    return ok / max(total, 1)

def score_schema(config: dict) -> float:
    return frac(sum(1 for f in REQUIRED_FIELDS if f in config), len(REQUIRED_FIELDS))

def score_tools(config: dict) -> float:
    tools = config.get("tools", [])
    if not isinstance(tools, list) or not tools:
        return 0.0
    good = sum((bool(t.get("name")) + bool(t.get("description")) + any(k in t for k in ("parameters", "input_schema", "schema"))) / 3 for t in tools if isinstance(t, dict))
    return min(1.0, good / len(tools))

def score_prompt(config: dict) -> float:
    prompt = config.get("system_prompt", "")
    if not isinstance(prompt, str) or not prompt.strip():
        return 0.0
    prompt = prompt.lower()
    return (min(1.0, len(prompt) / 400) + any(w in prompt for w in ("you are", "your role", "act as")) + any(w in prompt for w in ("must", "never", "always", "do not", "fallback", "retry")) + any(w in prompt for w in ("output", "format", "json", "tool call"))) / 4

def score_params(config: dict) -> float:
    checks = 0.0; total = 1.0
    mt = config.get("max_turns")
    if isinstance(mt, int) and 1 <= mt <= 50: checks += 1
    for key, lo, hi in (("temperature", 0, 2), ("top_p", 0, 1), ("timeout_s", 1, 300)):
        val = config.get(key)
        if val is None:
            continue
        total += 1
        ok = isinstance(val, (int, float)) and (lo < val <= hi if key == "top_p" else lo <= val <= hi)
        if ok:
            checks += 1
    return checks / total

def main():
    config = load_config(os.environ.get("SUBMISSION_FILE", "/eval/config.json"))
    score = 100 * (0.25 * score_schema(config) + 0.30 * score_tools(config) + 0.20 * score_prompt(config) + 0.25 * score_params(config))
    print(f"SCORE: {score:.4f}")


if __name__ == "__main__":
    main()
```

### 3. Scenario Test Scorer

For offline trace bundles. Each scenario checks answer similarity, required tool calls, format validity, and whether the agent recovered cleanly after a failure.

```python
#!/usr/bin/env python3
"""
Scenario bundle scorer.
Reads a JSON bundle of pre-run agent traces and scores the
responses against embedded scenarios. No live API calls.
"""

import difflib, json, os, sys

SCENARIOS = [
    {"id": "missing_info", "expected_answer": "Ask the user for the missing project id before continuing.", "required_tools": []},
    {"id": "search_then_summarize", "expected_answer": "Search first, then summarize the result in one paragraph.", "required_tools": ["search", "summarize"]},
    {"id": "tool_timeout", "expected_answer": "Retry once and fall back to a cached answer if the tool still fails.", "required_tools": ["lookup"]},
    {"id": "json_output", "expected_answer": "Return valid JSON with answer and status fields.", "required_tools": []},
    {"id": "safe_refusal", "expected_answer": "Refuse the unsafe request and explain the boundary clearly.", "required_tools": []},
]

def load_bundle(path: str) -> dict:
    try:
        data = json.load(open(path))
        if not isinstance(data, dict): raise ValueError("Submission must be a JSON object")
        return data
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr); sys.exit(1)

def normalize(text):
    return " ".join(str(text).strip().lower().split())

def records(bundle: dict) -> dict:
    results = bundle.get("results")
    if isinstance(results, dict): return results
    if isinstance(results, list):
        return {str(row["id"]): row for row in results if isinstance(row, dict) and row.get("id")}
    return {}

def score_record(expected, record, required_tools):
    answer = record.get("answer", record.get("final_answer", ""))
    if not isinstance(answer, str): answer = str(answer)
    answer_score = difflib.SequenceMatcher(None, normalize(expected), normalize(answer)).ratio()
    tool_calls = record.get("tool_calls", [])
    tool_calls = tool_calls if isinstance(tool_calls, list) else []
    actual_tools = {str(c.get("tool") or c.get("name") or "") for c in tool_calls if isinstance(c, dict)}
    tool_score = 1.0 if not required_tools else len(actual_tools.intersection(required_tools)) / len(required_tools)
    format_score = 1.0 if answer.strip() else 0.0
    recovery_score = 1.0 if record.get("status") in {"ok", "recovered", "fallback"} else 0.0
    return 0.50 * answer_score + 0.25 * tool_score + 0.15 * format_score + 0.10 * recovery_score

def main():
    bundle = load_bundle(os.environ.get("SUBMISSION_FILE", "/eval/traces.json"))
    recs = records(bundle)
    if not recs:
        print("ERROR: Missing results bundle", file=sys.stderr); sys.exit(1)
    total = sum(score_record(s["expected_answer"], recs[s["id"]], s["required_tools"]) for s in SCENARIOS if s["id"] in recs)
    score = 100 * (total / max(len(SCENARIOS), 1))
    print(f"SCORE: {score:.4f}")


if __name__ == "__main__":
    main()
```

## AI-Specific Pitfalls

### The Live Model Trap

**Problem:** Eval tries to call OpenAI, Anthropic, or another LLM API to test the submitted prompt or agent. The sandbox has no network access, and the code-execution security profile flags network and subprocess escapes.

**What happens:** Eval fails immediately with a connection or security error. Every submission scores zero regardless of quality.

**Fix:** Score prompt artifacts, configs, or offline trace bundles. If you need execution, replay against mocked tools and fixed fixtures inside the eval process only.

### The Single Transcript Overfit

**Problem:** Eval checks one canned conversation or one hard-coded answer. The submission learns that exact shape and ignores everything else.

**What happens:** The winning artifact is a lookup table or transcript shim, not a useful agent. You get brittle behavior that collapses on the first unseen input.

**Fix:** Use 5-10 scenario ids with fixed expected outcomes. Keep the ids in the eval and score every scenario, including malformed inputs and missing-tool cases.

### The Verbosity Reward

**Problem:** The rubric rewards long reasoning, debug logs, or verbose tool traces instead of actual task completion and correct tool choice.

**What happens:** Agents learn to pad answers and spam logs. The leaderboard looks active while real task success barely moves.

**Fix:** Score final answer correctness, tool-call validity, and recovery behavior separately. Ignore hidden reasoning text and cap any verbosity bonus at a small fraction.

### The Retry Blind Spot

**Problem:** A tool timeout, malformed JSON result, or transient API failure is treated as a crash instead of a recoverable branch.

**What happens:** Agents that recover well score the same as agents that die on the first bad tool response. That removes the one signal posters actually want.

**Fix:** Add a recovery metric: score retries, fallback answers, and graceful degradation, then only fail the scenario when the final outcome is wrong.

### The Schema Drift Trap

**Problem:** The config schema, tool schema, or trace schema changes after the eval is written. The script still checks the old field names.

**What happens:** Valid submissions score poorly and invalid ones slip through. Posters think the agent is bad when the eval is just stale.

**Fix:** Version the schema in the eval, keep a short compatibility comment next to it, and make the script exit 1 when required fields are missing rather than guessing.

## Scoring Formulas That Work

| Metric | Formula | Notes |
|--------|---------|-------|
| Prompt completeness | `100 * clamp(0.35*(sections_found/5) + 0.30*(constraint_hits/6) + 0.20*(tool_rules/4) + 0.15*(examples_found/2), 0, 1)` | Use for prompt docs or policy bundles. Missing sections should reduce score, not crash the eval. |
| Tool and schema validity | `100 * clamp(0.45*(valid_tools/max(total_tools, 1)) + 0.25*(schema_fields/required_fields) + 0.20*(param_checks/checked_params) + 0.10*(prompt_clarity/2), 0, 1)` | Use for JSON configs and tool registries. This handles empty lists and missing optional parameters. |
| Scenario success | `100 * (passed_scenarios / max(total_scenarios, 1))` | Use when the bounty has a fixed offline scenario set. One scenario failing should not take the whole script down. |
| Composite agent score | `100 * clamp(0.50*task_success + 0.20*tool_correctness + 0.20*format_validity + 0.10*recovery_rate, 0, 1)` | Use for mixed bounties that need a single headline score across answer quality, tool use, and fallback behavior. |

---

← [Security Evals](eval-security.md) | [Algorithm Evals](eval-algorithms.md) →
