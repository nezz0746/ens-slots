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

const TERMS = {
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
} as const;

/** `SlotNamespaceCuration.LabelSpec` — one label to open. */
const LABEL_SPEC = {
  type: "tuple[]",
  components: [
    { name: "label", type: "string" },
    { name: "hook", type: "address" },
    { name: "hookData", type: "bytes32" },
    { name: "taxBps", type: "uint256" },
    { name: "permanent", type: "bool" },
  ],
} as const;

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
    name: "terms",
    stateMutability: "view",
    inputs: [],
    // The slot terms every label here is opened with, and what one that names
    // no rate of its own inherits.
    outputs: [TERMS],
  },
  {
    type: "function",
    name: "parentLabelhash",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "proposeLabelTerms",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "taxBps", type: "uint256" },
      { name: "hook", type: "address" },
      { name: "hookData", type: "bytes32" },
      { name: "changeTax", type: "bool" },
      { name: "changeHook", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelLabelTerms",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "cancelTax", type: "bool" },
      { name: "cancelHook", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "sweep",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
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
    name: "implementation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  /**
   * One call stands a whole namespace up: it deploys the UserRegistry, grants
   * the namespace its roles inside that registry's own initializer, opens the
   * namespace, points it at the shared resolver, and slots the first labels.
   *
   * Pass `registry: zeroAddress` to have it deploy one. Passing an existing
   * registry skips the deployment, and the roles are then the caller's to grant.
   */
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "registry", type: "address" },
          // The node and the labelhash are DERIVED from this, so there is
          // nothing here that can contradict anything else. Recipient,
          // manager, the hook's address and the escrow floor all belong to the
          // contract, and both mutable flags are forced on — none of them was
          // ever the caller's to choose, and four of the nine used to be
          // overwritten before they reached a slot.
          { name: "parentName", type: "string" },
          { name: "currency", type: "address" },
          { name: "taxBps", type: "uint256" },
          { name: "minTenureSeconds", type: "uint64" },
          { ...LABEL_SPEC, name: "labels" },
        ],
      },
    ],
    outputs: [
      { name: "namespace", type: "address" },
      { name: "registry", type: "address" },
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
    name: "parentNode",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ type: "uint64" }],
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
    name: "terms",
    stateMutability: "view",
    inputs: [],
    // The slot terms every label here is opened with, and what one that names
    // no rate of its own inherits.
    outputs: [TERMS],
  },
  {
    type: "function",
    name: "parentLabelhash",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "proposeLabelTerms",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "taxBps", type: "uint256" },
      { name: "hook", type: "address" },
      { name: "hookData", type: "bytes32" },
      { name: "changeTax", type: "bool" },
      { name: "changeHook", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelLabelTerms",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "cancelTax", type: "bool" },
      { name: "cancelHook", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "sweep",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
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
    name: "setTexts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "keys", type: "string[]" },
      { name: "values", type: "string[]" },
    ],
    outputs: [],
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
    name: "parentTextOf",
    stateMutability: "view",
    inputs: [{ name: "key", type: "string" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "setParentText",
    stateMutability: "nonpayable",
    inputs: [
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
    name: "repointLabels",
    stateMutability: "nonpayable",
    inputs: [{ name: "labels", type: "string[]" }],
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
      { name: "taxBps", type: "uint256" },
      { name: "permanent_", type: "bool" },
    ],
    outputs: [
      { name: "slot", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "slotLabels",
    stateMutability: "nonpayable",
    inputs: [{ ...LABEL_SPEC, name: "specs" }],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "unslotLabel",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setTexts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "keys", type: "string[]" },
      { name: "values", type: "string[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setParentTexts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "keys", type: "string[]" },
      { name: "values", type: "string[]" },
    ],
    outputs: [],
  },
  /**
   * Mixed batches an array cannot express — labels plus a profile, say.
   * `delegatecall` to self preserves `msg.sender`, so `onlyOwner` still applies
   * to every inner call and this confers no authority the caller lacked.
   */
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
  /**
   * Inherited from OpenZeppelin's `Multicall`, and NOT payable — which is why
   * a native top-up can never be batched with a reprice and has to go first on
   * its own. See `HoldForm`.
   *
   * This entry belongs here and only here. A copy of it sat in `namespaceAbi`
   * for a contract that has no `multicall`, and `grep` finding that copy is
   * how a hold-form submit shipped against a `slotAbi` that lacked it.
   */
  {
    type: "function",
    name: "multicall",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ type: "bytes[]" }],
  },
] as const;

/**
 * The 0xSlots factory, for the two calls this app makes of it.
 *
 * `collectAll` is a v3 addition and the factory deployed on Sepolia is v2, so
 * it may not be there — `version()` is here to ask before reaching for it. See
 * `useCollectAll` for what happens when it is missing.
 */
export const slotFactoryAbi = [
  {
    type: "function",
    name: "version",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "collectAll",
    stateMutability: "nonpayable",
    inputs: [{ name: "slots", type: "address[]" }],
    outputs: [{ type: "uint256[]" }],
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
