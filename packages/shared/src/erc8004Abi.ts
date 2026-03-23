// ─── ERC-8004 ABIs ──────────────────────────────────────────────────────────
// Minimal ABIs for ERC-8004 Identity Registry and Reputation Registry.
// Deployed on Base Sepolia — addresses configured in networks.ts.

export const ERC8004_IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    inputs: [
      { name: "agent", type: "address", internalType: "address" },
      { name: "registrationFileURI", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "tokenIdOf",
    inputs: [{ name: "agent", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "registrationFileURI",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
] as const;

export const ERC8004_REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "giveFeedback",
    inputs: [
      { name: "agent", type: "address", internalType: "address" },
      { name: "value", type: "int128", internalType: "int128" },
      { name: "valueDecimals", type: "uint8", internalType: "uint8" },
      { name: "tag1", type: "string", internalType: "string" },
      { name: "tag2", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getFeedbackCount",
    inputs: [{ name: "agent", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;
