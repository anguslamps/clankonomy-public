// ─── ERC-8004 ABIs ──────────────────────────────────────────────────────────
// Minimal ABIs for ERC-8004 Identity Registry and Reputation Registry.
// Deployed on Base — addresses configured in networks.ts.

export const ERC8004_IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    inputs: [
      { name: "agentURI", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAgentWallet",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "newWallet", type: "address", internalType: "address" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "signature", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAgentWallet",
    inputs: [{ name: "agentId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setMetadata",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "metadataKey", type: "string", internalType: "string" },
      { name: "metadataValue", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getMetadata",
    inputs: [
      { name: "agentId", type: "uint256", internalType: "uint256" },
      { name: "metadataKey", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "tokenId", type: "uint256", indexed: true, internalType: "uint256" },
    ],
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
