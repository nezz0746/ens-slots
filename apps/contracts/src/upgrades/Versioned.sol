// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Versioned
 * @notice A number every upgradeable contract here carries. Bump it in the same
 *         commit as the change.
 *
 * @dev `script/protocol/Upgrade.s.sol` refuses a candidate whose version does
 *      not strictly increase, which turns three silent mistakes — reshipping
 *      the same implementation, shipping a stale branch, shipping to the wrong
 *      chain — into a failed script.
 *
 *      A constant, not storage, because it must describe the CODE. That is the
 *      only option for {SlotNamespace}: a beacon upgrade touches no proxy's
 *      storage, so nothing in a namespace's own state can say what it runs.
 */
abstract contract Versioned {
    /// @notice The implementation's version. Strictly increasing, forever.
    function version() public pure virtual returns (uint64);
}
