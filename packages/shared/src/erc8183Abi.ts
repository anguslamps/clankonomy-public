// ─── ERC-8183 ABIs ──────────────────────────────────────────────────────────
// Minimal ABI for the ClankonERC8183Adapter view-only adapter.

export const ERC8183_ADAPTER_ABI = [
  {
    type: "function",
    name: "getJob",
    inputs: [{ name: "bountyId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "requester", type: "address", internalType: "address" },
      { name: "provider", type: "address", internalType: "address" },
      { name: "evaluator", type: "address", internalType: "address" },
      { name: "token", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "status", type: "uint8", internalType: "uint8" },
      { name: "hook", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getJobCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "bountyContract",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
] as const;
