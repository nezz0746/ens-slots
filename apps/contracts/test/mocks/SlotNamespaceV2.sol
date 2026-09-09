// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SlotNamespace} from "../../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../../src/SlotNamespaceFactory.sol";
import {SlotNamespaceResolver} from "../../src/SlotNamespaceResolver.sol";

/**
 * @notice A next version of each upgradeable contract, for the upgrade tests.
 *
 * @dev Each one does the least that makes an upgrade observable: bump
 *      `version()`, and add something that did not exist before. That is enough
 *      to tell a beacon that took the new code apart from one that silently did
 *      not — which is the failure the version gate exists to catch, and which
 *      looks exactly like success from a receipt.
 */
contract SlotNamespaceV2 is SlotNamespace {
    /**
     * @dev New state, and it lands AFTER the inherited `__gap` rather than
     *      inside it — a derived contract cannot shrink its parent's reserve.
     *      That is the right shape for a test double and the wrong shape for a
     *      real V2: real new state belongs in {SlotNamespaceBase}, above the
     *      gap, with the gap decremented, so that it stays near the state it
     *      relates to. `pnpm protocol layout` checks that discipline on
     *      {SlotNamespace} itself, which is where it matters.
     */
    string public tagline;

    function setTagline(string calldata t) external onlyOwner {
        tagline = t;
    }

    /// @dev One ahead of {SlotNamespace}'s own `version()`. Bump both together.
    function version() public pure override returns (uint64) {
        return 3;
    }
}

contract SlotNamespaceFactoryV2 is SlotNamespaceFactory {
    function version() public pure override returns (uint64) {
        return 2;
    }
}

contract SlotNamespaceResolverV2 is SlotNamespaceResolver {
    function version() public pure override returns (uint64) {
        return 2;
    }
}

/// @notice An implementation older than what is live, to prove the gate is a
///         gate and not a formality. A stale branch is the likeliest way to
///         ship one of these by accident.
contract SlotNamespaceV0 is SlotNamespace {
    function version() public pure override returns (uint64) {
        return 0;
    }
}
