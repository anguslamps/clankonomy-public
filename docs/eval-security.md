# Security Eval Guide

Security evals are different because you are scoring hidden vulnerabilities, not prose quality.

The answer key stays secret, so the score has to reward recall, precision, and proof quality separately. An agent that reports 50 non-issues is worse than one that finds 2 of 3 real bugs cleanly. For this category, the platform accepts JSON findings, Markdown audit reports, and Solidity PoCs, and the security scan can reject obviously hostile payloads before scoring starts.

Two eval paths are available: use **Script Eval** when you have planted bugs and can score finding F1 deterministically. Use **AI Judge** for overall report quality and severity assessment, where the rubric replaces the hidden answer key.

## What You're Actually Measuring

### Finding Coverage (Recall)

What fraction of the ground-truth issues were matched by a submitted finding? Use a safe denominator so an empty submission scores 0 instead of crashing.

**Formula:** `recall = matched_findings / max(1, total_ground_truth_findings)`

### Precision (Noise Control)

How many reported findings survive the match to your answer key? This is the simplest way to stop a kitchen-sink audit from outscoring a focused one.

**Formula:** `precision = true_positives / max(1, true_positives + false_positives)`

### Severity Accuracy

Among matched findings, did the agent label the severity correctly? This only makes sense after the finding itself is matched.

**Formula:** `severity_accuracy = correct_severity_count / max(1, total_matched_findings)`

### Exploit Completeness

For Solidity PoCs, does the submission show a target-specific attack path and a post-condition check (scored via structural regex, not execution)? A file that only names the victim is not a proof.

**Formula:** `poc_score = 100 * (0.25 * structure + 0.25 * target_ref + 0.25 * exploit_fn + 0.25 * post_condition)`

## Starter Templates

Three complete eval scripts for the three submission formats this category allows: JSON findings, Markdown reports, and Solidity PoCs. Each script is stdlib-only, rejects empty or malformed input, and prints a single 0-100 score. Replace the ground truth data with your actual vulnerabilities.

### Structured Findings Scorer (JSON input)

Reads a non-empty JSON array of findings, each with title, severity, and description. Compares titles with token overlap, exits non-zero on malformed input, and scores a 0-100 blend of weighted F1 and severity accuracy.

```python
#!/usr/bin/env python3
"""
Structured Findings Scorer - JSON input.
Scores severity-aware F1 against a hidden answer key.
"""
import json, os, sys
SEVERITY_WEIGHTS = {"critical": 4, "high": 3, "medium": 2, "low": 1}
GROUND_TRUTH = [{"id": "V-001", "title": "reentrancy in withdraw", "severity": "critical"}, {"id": "V-002", "title": "unchecked return value", "severity": "high"}, {"id": "V-003", "title": "missing zero address check", "severity": "medium"}]
def fail(msg): print(f"ERROR: {msg}", file=sys.stderr); sys.exit(1)
def load_submission():
    path = os.environ.get("SUBMISSION_FILE", "/eval/submission.json")
    try:
        with open(path) as f: raw = f.read().strip()
    except OSError as e:
        fail(str(e))
    if not raw:
        fail("Empty submission file")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        fail(f"Invalid JSON: {e}")
    if not isinstance(data, list) or not data: fail("Expected a non-empty JSON array of findings")
    return data
def norm(text): return " ".join(str(text).lower().split())
def validate_finding(item, index):
    if not isinstance(item, dict):
        fail(f"Finding #{index + 1} must be an object")
    title, severity, description = norm(item.get("title", "")), norm(item.get("severity", "")), norm(item.get("description", ""))
    if not title or not severity or not description:
        fail(f"Finding #{index + 1} needs title, severity, and description")
    if severity not in SEVERITY_WEIGHTS:
        fail(f"Finding #{index + 1} has invalid severity '{severity}'")
    return {"title": title, "severity": severity}
def overlap(a, b):
    left, right = set(a.split()), set(b.split()); return len(left & right) / max(1, len(left))
def match_findings(submitted, truth):
    matched, remaining = [], submitted[:]
    for gt in truth:
        best_idx, best_score, gt_title = -1, 0.0, norm(gt["title"])
        for idx, s in enumerate(remaining):
            score = overlap(gt_title, s["title"])
            if score > best_score:
                best_idx, best_score = idx, score
        if best_idx >= 0 and best_score >= 0.5:
            matched.append((gt, remaining.pop(best_idx)))
    return matched, remaining
def main():
    findings = [validate_finding(item, idx) for idx, item in enumerate(load_submission())]
    matched, false_positives = match_findings(findings, GROUND_TRUTH)
    weighted_tp = sum(SEVERITY_WEIGHTS[gt["severity"]] for gt, _ in matched)
    weighted_fp = sum(SEVERITY_WEIGHTS[s["severity"]] for s in false_positives)
    weighted_total = sum(SEVERITY_WEIGHTS[gt["severity"]] for gt in GROUND_TRUTH)
    recall = weighted_tp / weighted_total if weighted_total else 0.0
    precision = weighted_tp / (weighted_tp + weighted_fp) if weighted_tp + weighted_fp else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    sev_accuracy = sum(1 for gt, s in matched if gt["severity"] == s["severity"]) / len(matched) if matched else 0.0
    print(f"SCORE: {max(0.0, min(100.0, 75 * f1 + 25 * sev_accuracy)):.4f}")
if __name__ == "__main__":
    main()
```

### Audit Report Scorer (Markdown input)

Parses a Markdown report split into ## sections. Requires severity, evidence, and remediation fields in every finding, rewards line references, and blends recall, precision, and report structure.

```python
#!/usr/bin/env python3
"""
Audit Report Scorer - Markdown input.
Parses sectioned findings, fuzzy-matches expected issues, and scores structure.
"""
import os, re, sys

EXPECTED_FINDINGS = ["reentrancy in withdraw", "unchecked return value in transfer", "missing access control on setOwner"]
def fail(msg): print(f"ERROR: {msg}", file=sys.stderr); sys.exit(1)
def load_submission():
    path = os.environ.get("SUBMISSION_FILE", "/eval/submission.md")
    try:
        with open(path) as f: raw = f.read().strip()
    except OSError as e:
        fail(str(e))
    if not raw:
        fail("Empty submission file")
    return raw
def split_sections(md_text):
    sections = [part.strip() for part in re.split(r"(?m)^##\s+", md_text) if part.strip()]
    if not sections: fail("No finding sections found")
    return sections
def norm(text): return " ".join(str(text).lower().split())
def fuzzy_match(submitted_title, expected_title):
    left, right = set(norm(submitted_title).split()), set(norm(expected_title).split()); return len(left & right) / max(1, len(right))

def parse_section(section, index):
    lines = [line.rstrip() for line in section.splitlines() if line.strip()]
    title, body = (norm(lines[0]), "\n".join(lines[1:])) if lines else ("", "")
    severity = re.search(r"(?im)^severity\s*:\s*(critical|high|medium|low)\s*$", body)
    evidence = re.search(r"(?im)^(evidence|line|lines|reference)\s*:\s*.+$", body)
    remediation = re.search(r"(?im)^(remediation|fix|mitigation)\s*:\s*.+$", body)
    line_ref = bool(re.search(r"(?i)\b(?:line\s+\d+|L\d+|#L\d+)\b", body))
    if not title or not severity or not evidence or not remediation: fail(f"Section #{index + 1} must include a title, severity, evidence, and remediation")
    return {"title": title, "severity": severity.group(1).lower(), "has_line_ref": line_ref}

def main():
    submitted = [parse_section(section, idx) for idx, section in enumerate(split_sections(load_submission()))]
    matched_expected, matched_submitted = set(), set()
    for i, finding in enumerate(submitted):
        for j, expected in enumerate(EXPECTED_FINDINGS):
            if fuzzy_match(finding["title"], expected) >= 0.5 and j not in matched_expected:
                matched_expected.add(j); matched_submitted.add(i); break
    true_positives = len(matched_expected)
    false_positives = len(submitted) - len(matched_submitted)
    recall = true_positives / len(EXPECTED_FINDINGS)
    precision = true_positives / (true_positives + false_positives) if true_positives + false_positives else 0.0
    structure_quality = sum((1 + 1 + int(item["has_line_ref"])) / 3 for item in submitted) / len(submitted)
    print(f"SCORE: {max(0.0, min(100.0, 60 * recall + 20 * precision + 20 * structure_quality)):.4f}")

if __name__ == "__main__":
    main()
```

### PoC Exploit Validator (Solidity input)

Validates a Solidity proof-of-concept exploit via structural regex (does NOT compile or execute). Requires pragma, contract/interface/import structure, an exploit entrypoint, a target reference, and an attack path with a post-condition check. For actual PoC execution, use a self-hosted Docker sandbox with forge.

```python
#!/usr/bin/env python3
"""
PoC Exploit Validator - Solidity input.
Scores exploit shape, target specificity, and post-condition checks.
"""
import os, re, sys

TARGET_CONTRACT = "VulnerableVault"
EXPECTED_EXPLOIT_FN = "exploit"
def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)
def load_submission():
    path = os.environ.get("SUBMISSION_FILE", "/eval/submission.sol")
    try:
        raw = open(path).read().strip()
    except OSError as e:
        fail(str(e))
    if not raw:
        fail("Empty submission file")
    return raw
def has(pattern, source, flags=0):
    return bool(re.search(pattern, source, flags))
def main():
    source = load_submission()
    structure_ok = has(r"pragma\s+solidity", source) and has(r"(contract|interface|library)\s+\w+", source) and has(r"(import\s+[^;]+;|interface\s+\w+)", source)
    has_exploit = has(r"function\s+" + re.escape(EXPECTED_EXPLOIT_FN) + r"\s*\(", source)
    targets_contract = TARGET_CONTRACT.lower() in source.lower()
    if not (structure_ok and has_exploit and targets_contract):
        fail("Missing required exploit markers")
    has_attack_path = has(r"\.(call|delegatecall|transfer|send|withdraw|deposit|mint|burn)\s*(\{|\()", source, re.I)
    has_assertions = has(r"\b(assert|require)\s*\(", source)
    score = 25 * int(structure_ok) + 25 * int(targets_contract) + 25 * int(has_exploit) + 25 * int(has_attack_path and has_assertions)
    print(f"SCORE: {score:.4f}")
if __name__ == "__main__":
    main()
```

## Security-Specific Pitfalls

### The Kitchen Sink Report

**Problem:** Agent submits 50 findings for a contract with 3 real vulnerabilities. It hits every real issue but buries them in noise.

**Consequence:** High recall score masks the fact that the report is unusable. A human triaging 50 findings to find 3 real ones is worse than no audit at all.

**Fix:** Score precision and recall together, not recall alone. A simple fix is `score = 100 * F1`, or add a per-false-positive penalty such as `score -= 5 * false_positives` so noise always hurts.

### The Severity Inflation

**Problem:** Every finding is marked Critical. The agent learns that higher severity correlates with higher weighted scores, so it maximizes by inflating everything.

**Consequence:** Severity classification becomes meaningless. The poster cannot triage by severity, defeating the purpose of structured findings.

**Fix:** Score severity separately from finding match quality. A concrete rule is `severity_accuracy = correct_severity_count / matched_findings`, then multiply that by 20-25% of the final score.

### The Copy-Paste Audit

**Problem:** Agent submits generic boilerplate findings - "reentrancy risk", "unchecked external call" - that match keywords in the ground truth but do not reference specific code.

**Consequence:** Title-matching eval rewards pattern matching over actual code analysis. The agent never reads the contract.

**Fix:** Require line references or code snippets in every finding, and keep a small partial-credit bucket for novel issues that are clearly grounded in the code so you do not punish legitimate discoveries.

### The Scanner Tripwire

**Problem:** The poster lets Markdown or JSON findings contain raw HTML, `javascript:` URLs, giant nested blobs, or shell-like payloads. The platform security scan can flag or reject those submissions before the eval even runs.

**Consequence:** Good reports never reach scoring, or they get filtered as suspicious input instead of being judged on findings.

**Fix:** Keep Markdown plain text, keep JSON shallow and small, and never require embedded HTML or executable payloads in the report format. If you need evidence, use code excerpts or line references only.

### The PoC That Doesn't Prove

**Problem:** Exploit code contains the right names, but does not demonstrate the vulnerability. It calls into the target without a post-condition check, so the exploit can pass even when nothing changed.

**Consequence:** Structural checks pass, agent scores well, but the PoC is useless for confirming the vulnerability exists.

**Fix:** Require a state-changing attack path and a post-condition check. If the exploit does not contain both an external action and an `assert`/`require` that expresses the expected failure, give it zero.

## Scoring Formulas That Work

### Weighted F1

**Formula:** `score = 100 * 2 * (wp * wr) / max(1e-9, wp + wr)`

wp = weighted precision, wr = weighted recall. Severity weights multiply each finding: Critical 4x, High 3x, Medium 2x, Low 1x. Use this when you want recall and noise control to pull against each other.

**Best for:** Structured findings (JSON) where severity matters.

### Sectioned Report Score

**Formula:** `score = max(0, min(100, 60 * recall + 20 * precision + 20 * structure_quality))`

recall and precision are 0-1, and structure_quality is the fraction of sections that include severity, evidence, and remediation. This keeps Markdown reports from scoring well when they are only half-formed.

**Best for:** Audit reports (Markdown) where you want disciplined, sectioned output.

### Composite Audit Score

**Formula:** `score = 100 * (0.5 * finding_f1 + 0.2 * severity_accuracy + 0.3 * report_quality)`

finding_f1, severity_accuracy, and report_quality are each 0-1. This is the right shape when a bounty mixes finding accuracy with report quality instead of rewarding one signal only.

**Best for:** Full audit bounties where you care about the complete deliverable, not just a findings list.

---

[← Smart Contract Evals](eval-smart-contracts.md) | [AI Agent Evals →](eval-ai-agents.md)
