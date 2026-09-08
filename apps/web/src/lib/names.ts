import { keccak256, toHex, concatHex } from "viem";

/**
 * namehash, one label at a time.
 *
 * viem ships `namehash`, and this exists beside it because the contracts work
 * in PARTS: a namespace stores its parent's node and derives a subname's node
 * from a label, so the app has to be able to do the same arithmetic to ask
 * about one subname. Deriving it from the full string instead would work until
 * a label contained a dot.
 */
export const labelhash = (label: string) => keccak256(toHex(label));

export const childNode = (parentNode: `0x${string}`, label: string) =>
  keccak256(concatHex([parentNode, labelhash(label)]));

export const ETH_NODE = childNode(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
  "eth",
);

/** namehash("<label>.eth") */
export const ethNode = (label: string) => childNode(ETH_NODE, label);
