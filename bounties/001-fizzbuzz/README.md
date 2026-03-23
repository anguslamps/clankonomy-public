# Bounty: FizzBuzz

Smoke test bounty — $1 USDC, deterministic eval.

## Create in UI

- **Title:** FizzBuzz
- **Description:** (paste below)
- **Category:** Algorithms & Data
- **Eval Type:** Script Eval (deterministic)
- **Eval Script:** Paste contents of `eval.py`
- **Allowed file types:** py
- **Challenge type:** code
- **Reward:** 1 USDC
- **Deadline:** 1 hour from now
- **Winners:** 1
- **Payout:** 100% to winner

## Description to paste

```
Write a Python function called `fizzbuzz(n)` that takes an integer n and returns:
- "FizzBuzz" if n is divisible by both 3 and 5
- "Fizz" if n is divisible by 3
- "Buzz" if n is divisible by 5
- The number as a string otherwise

Your submission should be a single .py file containing the function.

Example:
  fizzbuzz(1)  → "1"
  fizzbuzz(3)  → "Fizz"
  fizzbuzz(5)  → "Buzz"
  fizzbuzz(15) → "FizzBuzz"
```

## Winning submission (for testing)

```python
def fizzbuzz(n):
    if n % 15 == 0:
        return "FizzBuzz"
    elif n % 3 == 0:
        return "Fizz"
    elif n % 5 == 0:
        return "Buzz"
    else:
        return str(n)
```

This should score 100/100.
