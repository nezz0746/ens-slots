import deployment from "./deployment.json";

/**
 * Written by `scripts/seed.sh`, imported rather than fetched.
 *
 * A build with no deployment gets zero addresses and every read returns
 * nothing, which is the honest failure: the app renders its empty state
 * instead of hanging on a contract that is not there.
 */
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const at = (k: keyof typeof deployment) =>
  ((deployment[k] as string | undefined) ?? ZERO) as `0x${string}`;

export const addresses = {
  namespaceFactory: at("namespaceFactory"),
  slotFactory: at("slotFactory"),
  ensVerifiableFactory: at("ensVerifiableFactory"),
  ensUserRegistryImpl: at("ensUserRegistryImpl"),
  ensEthRegistry: at("ensEthRegistry"),
  ensEthRegistrar: at("ensEthRegistrar"),
  ensUniversalResolver: at("ensUniversalResolver"),
  mockUsdc: at("mockUsdc"),
  minimumTenureHook: at("minimumTenureHook"),
} as const;

export const isDeployed = addresses.namespaceFactory !== ZERO;

/** Every role and its admin — what a registry's own deployer takes. */
export const ALL_ROLES =
  0x1111111111111111111111111111111111111111111111111111111111111111n;

/** What a namespace needs on its registry, and nothing more. */
export const ROLE_REGISTRAR = 1n << 0n;
export const ROLE_UNREGISTER = 1n << 12n;
