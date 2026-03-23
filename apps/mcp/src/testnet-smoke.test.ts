import test from "node:test";
import assert from "node:assert/strict";
import { runTestnetSmoke } from "./testnet-smoke.js";

const shouldRun = process.env.RUN_CLANKONOMY_TESTNET_SMOKE === "1";

test("testnet smoke harness is explicitly gated", { skip: shouldRun }, () => {
  assert.equal(shouldRun, false);
});

test(
  "runs the real MCP caller smoke harness against testnet when enabled",
  { skip: !shouldRun, timeout: 20 * 60 * 1000 },
  async () => {
    const result = await runTestnetSmoke();
    assert.ok(result.state.bountyId);
  },
);
