/**
 * The calls this app makes, and no others.
 *
 * Hand-written rather than generated from `forge out`. The generated artifacts
 * carry every internal type and both protocols' full surface, and the app uses
 * maybe fifteen functions — so a hand-written file is both smaller and
 * readable, and viem infers types from it exactly the same way.
 *
 * Kept in one place because a wrong signature here is a silent failure: viem
 * encodes it, the chain rejects it, and the error names a selector rather than
 * a function.
 */

export const namespaceFactoryAbi = [
  {
    type: "function",
    name: "all",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "namespaceOf",
    stateMutability: "view",
    inputs: [{ name: "parentNode", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "resolverOf",
    stateMutability: "view",
    inputs: [{ name: "parentNode", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      { name: "registry", type: "address" },
      { name: "parentNode", type: "bytes32" },
      { name: "parentName", type: "string" },
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "recipient", type: "address" },
          { name: "currency", type: "address" },
          { name: "manager", type: "address" },
          { name: "hook", type: "address" },
          { name: "hookData", type: "bytes32" },
          { name: "taxBps", type: "uint256" },
          { name: "minDepositSeconds", type: "uint256" },
          { name: "mutableTax", type: "bool" },
          { name: "mutableHook", type: "bool" },
        ],
      },
      { name: "owner", type: "address" },
    ],
    outputs: [
      { name: "namespace", type: "address" },
      { name: "resolver", type: "address" },
    ],
  },
] as const;

export const namespaceAbi = [
  {
    type: "function",
    name: "parentName",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "PARENT_NODE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "slottedCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "listing",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "nodes", type: "bytes32[]" },
      { name: "labels", type: "string[]" },
      { name: "slots", type: "address[]" },
    ],
  },
  {
    type: "function",
    name: "permanent",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "addrOf",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "textOf",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [{ name: "newResolver", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "repointLabel",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "slotLabel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "hook", type: "address" },
      { name: "hookData", type: "bytes32" },
      { name: "permanent_", type: "bool" },
    ],
    outputs: [
      { name: "slot", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "unslotLabel",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
  },
] as const;

/**
 * The slot, as this app uses it.
 *
 * `getSlotInfo()` is the important one: everything a panel shows in a single
 * call, so a row cannot straddle two blocks and show a price from one and a
 * deposit from another.
 */
export const slotAbi = [
  {
    type: "function",
    name: "getSlotInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "recipient", type: "address" },
          { name: "currency", type: "address" },
          { name: "manager", type: "address" },
          { name: "taxBps", type: "uint256" },
          { name: "minDepositSeconds", type: "uint256" },
          { name: "mutableTax", type: "bool" },
          { name: "mutableHook", type: "bool" },
          { name: "hook", type: "address" },
          { name: "hookData", type: "bytes32" },
          {
            name: "hookFlags",
            type: "tuple",
            components: [
              { name: "beforeBuy", type: "bool" },
              { name: "beforeSelfAssess", type: "bool" },
              { name: "afterBuy", type: "bool" },
              { name: "afterRelease", type: "bool" },
              { name: "afterLiquidate", type: "bool" },
              { name: "afterSettle", type: "bool" },
              { name: "strict", type: "bool" },
            ],
          },
          { name: "occupant", type: "address" },
          { name: "price", type: "uint256" },
          { name: "deposit", type: "uint256" },
          { name: "occupiedSince", type: "uint64" },
          { name: "tenureId", type: "uint64" },
          { name: "lastSettled", type: "uint64" },
          { name: "taxOwed", type: "uint256" },
          { name: "collectedTax", type: "uint256" },
          { name: "isVacant", type: "bool" },
          { name: "isInsolvent", type: "bool" },
          { name: "secondsUntilLiquidation", type: "uint256" },
          { name: "pendingTaxBps", type: "uint256" },
          { name: "pendingHook", type: "address" },
          { name: "pendingHookData", type: "bytes32" },
          { name: "pendingHasTax", type: "bool" },
          { name: "pendingHasHook", type: "bool" },
          { name: "pendingProposedAt", type: "uint64" },
          { name: "hasRipeTerms", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "minDepositForBuy",
    stateMutability: "view",
    inputs: [{ name: "price_", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "depositAmount", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "account", type: "address" },
      { name: "selfAssessedPrice", type: "uint256" },
      { name: "depositAmount", type: "uint256" },
      { name: "maxPayment", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "selfAssess",
    stateMutability: "nonpayable",
    inputs: [{ name: "newPrice", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "topUp",
    stateMutability: "payable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "collect",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

/** ENSv2's registry, for the parts the register flow touches. */
export const ensRegistryAbi = [
  {
    type: "function",
    name: "grantRootRoles",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getStatus",
    stateMutability: "view",
    inputs: [{ name: "anyId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "setSubregistry",
    stateMutability: "nonpayable",
    inputs: [
      { name: "anyId", type: "uint256" },
      { name: "registry", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const verifiableFactoryAbi = [
  {
    type: "function",
    name: "deployProxy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

export const userRegistryAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "grants",
        type: "tuple[]",
        components: [
          { name: "account", type: "address" },
          { name: "roleBitmap", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

/**
 * The `.eth` registrar, for acquiring the parent name itself.
 *
 * Commit-reveal, paid in an ERC20. Every signature here was checked against
 * the deployed bytecode's dispatch table before it was written down — see
 * `ENSV2.txt`. They match the documentation, which is not something to assume.
 */
export const ethRegistrarAbi = [
  {
    type: "function",
    name: "isAvailable",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getRegisterPrice",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "string" },
      { name: "duration", type: "uint64" },
      { name: "paymentToken", type: "address" },
    ],
    outputs: [
      { name: "base", type: "uint256" },
      { name: "premium", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "makeCommitment",
    stateMutability: "pure",
    inputs: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "secret", type: "bytes32" },
      { name: "subregistry", type: "address" },
      { name: "resolver", type: "address" },
      { name: "duration", type: "uint64" },
      { name: "referrer", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "commitmentAt",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "secret", type: "bytes32" },
      { name: "subregistry", type: "address" },
      { name: "resolver", type: "address" },
      { name: "duration", type: "uint64" },
      { name: "paymentToken", type: "address" },
      { name: "referrer", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "MIN_COMMITMENT_AGE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "MIN_REGISTER_DURATION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** The payment token. `mint` is open on the mock — see the faucet widget. */
export const mockUsdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
