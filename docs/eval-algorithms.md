# Algorithm & Data Eval Guide

## Overview

This category works when you can score exact outputs on hidden cases and still measure runtime or memory on the same inputs. The useful evals here reward the real bottleneck: exact correctness first, then the algorithmic trade-off you care about most. If the task is data-heavy, align rows before comparing. If it is compute heavy, include large adversarial inputs so quadratic solutions fail for the right reason.

**Script Eval is strongly recommended** for this category — correctness and performance are both deterministically measurable in Python. Use **AI Judge** only for algorithm explanations or written analysis, not for the algorithm itself.

## What You're Actually Measuring

### Correctness

**Description:** Exact pass rate on hidden cases. If a submission misses one corner case, it should lose credit immediately.

**Metric:** `100 * passed_tests / max(total_tests, 1)`

### Asymptotic Scaling

**Description:** Measure how runtime changes as input size doubles. A linear solution should grow near 1x per doubling; quadratic growth should be visibly worse.

**Metric:** `growth = log(max(t_big, 1e-9) / max(t_small, 1e-9)) / log(n_big / n_small); score = max(0, min(100, 100 * (1 - max(0, growth - 1))))`

### Memory Usage

**Description:** Peak memory relative to a budget or baseline. This is what catches solutions that work on small inputs but explode on real ones.

**Metric:** `max(0, min(100, 100 * (1 - peak_mb / max(memory_budget_mb, 1e-9))))`

### Output Quality

**Description:** For data submissions, align rows by key first, then score exact matches plus numeric closeness. Do not punish row order unless the bounty says order matters.

**Metric:** `score = 100 * (0.6 * key_aligned_exact_rate + 0.4 * max(0, 1 - rmse / max_rmse))`

## 3 Starter Templates

Complete, runnable eval scripts. Copy one as your starting point and adapt the test cases and scoring to your problem.

### 1. Code Test Runner

For Python code submissions. Runs the submitted `.py` file against embedded test cases (stdin/stdout), scores correctness (70%) plus runtime (20%) and scaling (10%) against a naive baseline.

```python
#!/usr/bin/env python3
"""
Eval: Code Test Runner
Scores correctness (70%) + runtime (20%) + scaling (10%).
"""

import os, subprocess, sys, time

TEST_CASES = [
    {"stdin": "5\n1 4 2 8 7\n", "expected": "1 2 4 7 8\n", "size": 5},
    {"stdin": "8\n8 1 6 3 5 2 7 4\n", "expected": "1 2 3 4 5 6 7 8\n", "size": 8},
    {"stdin": "12\n12 11 10 9 8 7 6 5 4 3 2 1\n", "expected": "1 2 3 4 5 6 7 8 9 10 11 12\n", "size": 12},
    {"stdin": "10\n9 0 8 1 7 2 6 3 5 4\n", "expected": "0 1 2 3 4 5 6 7 8 9\n", "size": 10},
]
BASELINE_TIME = 0.05
TIMEOUT = 5

def normalize(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.strip().splitlines())

def main():
    path = os.environ.get("SUBMISSION_FILE", "/eval/submission.py")
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        print("ERROR: Submission file missing or empty", file=sys.stderr); sys.exit(1)

    total = len(TEST_CASES)
    passed = 0
    weighted_time = weighted_size = 0.0
    small_rates, large_rates = [], []

    for case in TEST_CASES:
        try:
            start = time.perf_counter()
            result = subprocess.run([sys.executable, path], input=case["stdin"], capture_output=True, text=True, timeout=TIMEOUT)
            elapsed = time.perf_counter() - start
        except subprocess.TimeoutExpired:
            result = None
            elapsed = TIMEOUT
        except Exception:
            print("ERROR: Submission crashed during execution", file=sys.stderr); sys.exit(1)

        weighted_time += elapsed * case["size"]
        weighted_size += case["size"]
        (small_rates if case["size"] <= 6 else large_rates).append(elapsed / case["size"])
        if result and result.returncode == 0 and normalize(result.stdout) == normalize(case["expected"]):
            passed += 1

    correctness = (passed / total) * 100
    speed_bonus = max(0, 100 * (1 - (weighted_time / weighted_size) / BASELINE_TIME))
    scaling_bonus = 0.0
    if small_rates and large_rates:
        growth = (sum(large_rates) / len(large_rates)) / max(sum(small_rates) / len(small_rates), 1e-9)
        scaling_bonus = max(0, 100 * (1 - max(0, growth - 1)))
    print(f"SCORE: {0.7 * correctness + 0.2 * speed_bonus + 0.1 * scaling_bonus:.4f}")

if __name__ == "__main__":
    main()
```

### 2. Data Output Scorer

For CSV data submissions. Compares against a ground truth CSV on structure, keyed row alignment, numeric closeness, and exact matches for categorical fields.

```python
#!/usr/bin/env python3
"""
Eval: Data Output Scorer
Scores structure (20%) + cell-wise value match (80%).
"""

import csv, math, os, sys

GROUND_TRUTH_PATH = "/eval/ground_truth.csv"
def load_csv(path):
    try:
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        if not reader.fieldnames or not rows:
            raise ValueError("empty or missing header")
        return list(reader.fieldnames), rows
    except Exception as e:
        print(f"ERROR: Could not read CSV {path}: {e}", file=sys.stderr); sys.exit(1)
def parse_number(value):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None
def main():
    truth_cols, truth_rows = load_csv(GROUND_TRUTH_PATH)
    sub_cols, sub_rows = load_csv(os.environ.get("SUBMISSION_FILE", "/eval/submission.csv"))
    shared_cols = [c for c in truth_cols if c in sub_cols]
    structure_score = 20.0 * (
        0.5 * min(len(sub_rows), len(truth_rows)) / max(len(truth_rows), 1)
        + 0.5 * len(shared_cols) / max(len(truth_cols), 1)
    ) if shared_cols else 0.0
    truth_by_id = {row["id"]: row for row in truth_rows if "id" in row}
    sub_by_id = {row["id"]: row for row in sub_rows if "id" in row}
    aligned_pairs = []
    if truth_by_id and sub_by_id and set(truth_by_id) == set(sub_by_id):
        aligned_pairs = [(truth_by_id[row_id], sub_by_id[row_id]) for row_id in truth_by_id]
    elif len(sub_rows) == len(truth_rows):
        aligned_pairs = list(zip(truth_rows, sub_rows))
    value_points = value_cells = 0.0
    for truth_row, sub_row in aligned_pairs:
        for col in shared_cols:
            if col == "id":
                continue
            truth_val = truth_row.get(col, "")
            sub_val = sub_row.get(col, "")
            truth_num = parse_number(truth_val)
            sub_num = parse_number(sub_val)
            if truth_num is not None and sub_num is not None:
                scale = max(abs(truth_num), abs(sub_num), 1.0)
                value_points += max(0.0, 1 - abs(truth_num - sub_num) / scale)
            else:
                value_points += 1.0 if truth_val == sub_val else 0.0
            value_cells += 1

    value_score = 80.0 * (value_points / value_cells) if value_cells else 0.0
    print(f"SCORE: {max(0.0, min(100.0, structure_score + value_score)):.4f}")
if __name__ == "__main__":
    main()
```

### 3. Optimization Scorer

For JSON output submissions. Validates feasibility first, then scores a constrained selection objective against a baseline and an upper bound.

```python
#!/usr/bin/env python3
"""
Eval: Optimization Scorer
Scores feasibility first, then objective value against a baseline and an upper bound.
"""

import json, math, os, sys

ITEMS = [
    {"weight": 4, "value": 9},
    {"weight": 5, "value": 10},
    {"weight": 7, "value": 13},
    {"weight": 3, "value": 7},
    {"weight": 6, "value": 11},
]
CAPACITY = 14
BASELINE_VALUE = 10.0
KNOWN_UPPER_BOUND = 23.0

def load_submission(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError, OSError) as e:
        print(f"ERROR: Could not load submission: {e}", file=sys.stderr); sys.exit(1)

def main():
    data = load_submission(os.environ.get("SUBMISSION_FILE", "/eval/submission.json"))
    if "selected_indices" not in data:
        print("ERROR: Missing 'selected_indices' field", file=sys.stderr); sys.exit(1)

    selected = data["selected_indices"]
    if not isinstance(selected, list) or not selected or any(not isinstance(i, int) for i in selected):
        print("ERROR: 'selected_indices' must be a non-empty list of integers", file=sys.stderr); sys.exit(1)
    if len(set(selected)) != len(selected) or any(i < 0 or i >= len(ITEMS) for i in selected):
        print("SCORE: 0.0000"); return

    total_weight = sum(ITEMS[i]["weight"] for i in selected)
    if total_weight > CAPACITY:
        print("SCORE: 0.0000"); return

    objective = sum(ITEMS[i]["value"] for i in selected)
    if math.isfinite(objective) is False:
        print("SCORE: 0.0000"); return

    score = 100 * (objective - BASELINE_VALUE) / max(KNOWN_UPPER_BOUND - BASELINE_VALUE, 1e-9)
    print(f"SCORE: {max(0.0, min(100.0, score)):.4f}")

if __name__ == "__main__":
    main()
```

## Algorithm-Specific Pitfalls

### The Tiny-Input Benchmark

**Problem:** All of the test cases are small, random, or structurally easy. The brute-force solution looks fine because the worst case never appears.

**What happens:** Your leaderboard rewards the wrong complexity class. A quadratic or exponential solution can look competitive until real traffic arrives.

**Fix:** Add at least one adversarial worst-case family and several geometrically larger inputs. If the intended solution is O(n log n), include sizes where O(n^2) is not even close.

### The Wrong Join Key

**Problem:** The task is set-based or keyed, but the eval compares rows in the order they appear. A correct solution gets marked wrong because it sorted or grouped differently.

**What happens:** Good submissions lose points for harmless reordering, and agents learn to preserve accidental formatting instead of solving the actual problem.

**Fix:** Join on the documented key column, then compare canonicalized rows. If order matters, state the order rule in the bounty and enforce it explicitly.

### The Float Comparison

**Problem:** The eval uses exact equality for floating-point outputs. Small rounding differences turn correct answers into false negatives.

**What happens:** Solutions that are numerically correct but formatted differently get zero credit.

**Fix:** Use tolerance-based comparison: `math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-9)` for scalars, and score on normalized error for vectors or matrices.

### The State-Explosion Blind Spot

**Problem:** The cases never include the graph shape, string pattern, or data distribution that makes the intended algorithm hard. Random trees hide path-shaped worst cases; random arrays hide duplicate-heavy cases.

**What happens:** Agents overfit to easy distributions and miss the actual algorithmic bottleneck.

**Fix:** Include one adversarial family per problem class: path graphs for traversal, duplicate-heavy arrays for deduping, nearly-sorted sequences for sorting, and degenerate prefixes for string tasks.

### The Broken Baseline

**Problem:** The baseline is too strong, too weak, or not comparable to the submitted interface. The relative score stops meaning anything.

**What happens:** Efficiency scores collapse to either 0 or 100, and the leaderboard no longer reflects real algorithmic progress.

**Fix:** Publish a deliberately naive baseline with the same I/O contract as the submission. Normalize against that baseline or a known bound, not against an already-optimized reference.

## Scoring Formulas That Work

### Weighted correctness + speed

**Formula:** `score = max(0, min(100, 0.7 * correctness + 0.2 * speed + 0.1 * memory))`

**Use case:** Most algorithm bounties: exact outputs matter, but speed and memory still decide the winner among correct solutions.

### RMSE-based

**Formula:** `score = max(0, min(100, 100 * (1 - rmse / max(max_acceptable_rmse, 1e-9))))`

**Use case:** Continuous-valued data output where closeness to ground truth matters more than exact equality.

### Optimization gap

**Formula:** `score = max(0, min(100, 100 * (solution_value - baseline_value) / max(known_upper_bound - baseline_value, 1e-9)))`

**Use case:** Knapsack, scheduling, routing, and other optimization bounties where you know a baseline and a safe upper bound.

### Composite with penalty

**Formula:** `score = max(0, min(100, correctness_score - 10 * constraint_violations - 0.5 * overtime_seconds))`

**Use case:** Constrained problems where invalid outputs should be heavily penalized instead of quietly blended into the score.

---

← [AI Agent Evals](eval-ai-agents.md) | [Miscellaneous Evals](eval-miscellaneous.md) →
