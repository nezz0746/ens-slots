// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISlot, SlotInit} from "../interfaces/ISlots.sol";
import {SlotNamespaceBase} from "./SlotNamespaceBase.sol";

/**
 * @title SlotNamespaceViews
 * @notice Everything a client reads, and nothing that writes.
 *
 * @dev Resolution is derived per read, never stored: the name never moves, so
 *      a turnover has nothing to do and nothing that can fail.
 *
 *      Declares no storage. See {SlotNamespaceBase}.
 */
abstract contract SlotNamespaceViews is SlotNamespaceBase {
    /// @notice Who holds the name right now. Zero for a vacant slot — the name
    ///         goes dark rather than answering with an address holding no claim.
    function addrOf(bytes32 node) public view returns (address) {
        address slot = slotOfNode[node];
        if (slot == address(0)) return address(0);
        return ISlot(slot).occupant();
    }

    /// @notice The slot terms every label in this namespace was created with.
    function terms() external view returns (SlotInit memory) {
        return _terms;
    }

    function slottedCount() external view returns (uint256) {
        return _slotted.length;
    }

    /// @notice Everything a client needs to draw this namespace, in one call.
    /// @dev Per-slot numbers are deliberately absent: copying price and deposit
    ///      here would give a client two sources for one fact.
    function listing()
        external
        view
        returns (bytes32[] memory nodes, string[] memory labels, address[] memory slots)
    {
        uint256 n = _slotted.length;
        nodes = new bytes32[](n);
        labels = new string[](n);
        slots = new address[](n);
        for (uint256 i; i < n; ++i) {
            bytes32 node = _slotted[i];
            nodes[i] = node;
            labels[i] = labelOfNode[node];
            slots[i] = slotOfNode[node];
        }
    }

    function nodeOf(string calldata label) external view returns (bytes32) {
        return _node(keccak256(bytes(label)));
    }

    function slotOfLabel(string calldata label) external view returns (address) {
        return slotOfNode[_node(keccak256(bytes(label)))];
    }

    /// @notice The tenancy a node's records currently belong to.
    function tenureOf(bytes32 node) external view returns (uint64) {
        address slot = slotOfNode[node];
        return slot == address(0) ? 0 : ISlot(slot).tenureId();
    }
}
