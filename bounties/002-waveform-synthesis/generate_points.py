"""
OFFLINE GENERATOR — NOT used during evaluation.

Run once to produce the SAMPLE_T / SAMPLE_Y constants embedded in eval.py.
The generating function (LCG) lives here, not in eval.py.

Usage:
    python generate_points.py > sample_data.py
"""
import math
import json


NUM_SAMPLES = 10000
T_MIN = 0.0
T_MAX = 2.0 * math.pi


def generate_target_harmonics():
    """
    Deterministic pseudo-random parameter generation using MINSTD LCG.
    Produces 15 sinusoidal harmonics with fixed seed.
    """
    a = 48271
    m = 2147483647  # 2^31 - 1
    state = 314159265  # fixed seed

    def _next():
        nonlocal state
        state = (a * state) % m
        return state / m

    harmonics = []
    for _ in range(15):
        freq = 0.1 + _next() * 49.9
        amplitude = 0.05 + _next() * 0.95
        phase = _next() * 2.0 * math.pi

        harmonics.append((freq, amplitude, phase))

    return harmonics


def eval_waveform(t, harmonics):
    """Evaluate sum-of-sinusoids at point t."""
    return sum(amp * math.sin(freq * t + phase) for freq, amp, phase in harmonics)


def main():
    harmonics = generate_target_harmonics()

    # Print harmonic parameters for documentation
    print("# Target harmonics (15):")
    print("# idx | freq       | amplitude  | phase")
    print("# ----|------------|------------|----------")
    for i, (f, a, p) in enumerate(harmonics):
        print(f"# {i:3d} | {f:10.6f} | {a:10.6f} | {p:10.6f}")

    # Sort by amplitude to show which are strongest
    by_amp = sorted(enumerate(harmonics), key=lambda x: x[1][1], reverse=True)
    print("\n# Sorted by amplitude (strongest first):")
    for i, (f, a, p) in by_amp:
        print(f"# {i:3d} | {f:10.6f} | {a:10.6f} | {p:10.6f}")

    # Generate sample points
    step = (T_MAX - T_MIN) / NUM_SAMPLES
    sample_t = []
    sample_y = []

    for i in range(NUM_SAMPLES):
        t = T_MIN + i * step
        y = eval_waveform(t, harmonics)
        sample_t.append(round(t, 10))
        sample_y.append(round(y, 12))

    # Output as Python literals
    print(f"\n\nNUM_SAMPLES = {NUM_SAMPLES}")
    print(f"\nSAMPLE_T = {repr(sample_t)}")
    print(f"\nSAMPLE_Y = {repr(sample_y)}")

    # Also output as a compact JSON for reference
    with open("sample_points.json", "w") as f:
        json.dump({"t": sample_t, "y": sample_y}, f)
    print("\n# Also written to sample_points.json", file=__import__('sys').stderr)

    # Print stats
    import sys
    print(f"\n# Stats:", file=sys.stderr)
    print(f"#   Samples: {NUM_SAMPLES}", file=sys.stderr)
    print(f"#   Y range: [{min(sample_y):.6f}, {max(sample_y):.6f}]", file=sys.stderr)
    print(f"#   Total harmonics: {len(harmonics)}", file=sys.stderr)


if __name__ == "__main__":
    main()
