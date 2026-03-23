"""
Eval script for FizzBuzz bounty.
Reads the submission, executes it, checks correctness.
Outputs SCORE: 0-100 based on how many test cases pass.
"""
import os
import sys
import importlib.util

submission_file = os.environ.get("SUBMISSION_FILE", "/eval/submission.py")

# Load the submission as a module
try:
    spec = importlib.util.spec_from_file_location("submission", submission_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
except Exception as e:
    print(f"Failed to load submission: {e}", file=sys.stderr)
    print("SCORE: 0")
    sys.exit(0)

# Check that fizzbuzz() exists
if not hasattr(mod, "fizzbuzz"):
    print("Missing fizzbuzz(n) function", file=sys.stderr)
    print("SCORE: 0")
    sys.exit(0)

# Expected output for fizzbuzz(1) through fizzbuzz(30)
def expected(n):
    if n % 15 == 0:
        return "FizzBuzz"
    elif n % 3 == 0:
        return "Fizz"
    elif n % 5 == 0:
        return "Buzz"
    else:
        return str(n)

# Run 30 test cases
passed = 0
total = 30

for i in range(1, total + 1):
    try:
        result = mod.fizzbuzz(i)
        exp = expected(i)
        if str(result) == exp:
            passed += 1
        else:
            print(f"FAIL: fizzbuzz({i}) = {result!r}, expected {exp!r}", file=sys.stderr)
    except Exception as e:
        print(f"ERROR: fizzbuzz({i}) raised {e}", file=sys.stderr)

score = round((passed / total) * 100)
print(f"Passed {passed}/{total} test cases")
print(f"SCORE: {score}")
