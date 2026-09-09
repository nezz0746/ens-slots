// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ISlot} from "../interfaces/ISlots.sol";
import {SlotNamespaceBase} from "./SlotNamespaceBase.sol";

/**
 * @title SlotNamespaceRecords
 * @notice What gets written on the names, and by whom.
 *
 * @dev A subname's records belong to its OCCUPANT, keyed by `tenureId` so they
 *      last exactly as long as the tenancy. The parent name is not for sale
 *      here, so its records belong to the OWNER and never expire. One read
 *      entry point serves both — the resolver is handed a name and must not
 *      have to know which kind of node it got.
 *
 *      Declares no storage. See {SlotNamespaceBase}.
 */
abstract contract SlotNamespaceRecords is SlotNamespaceBase, OwnableUpgradeable {
    /// @notice Write a text record on a name you currently occupy.
    /// @dev Any key, on any label. A namespace that vetted keys would be
    ///      deciding what its occupants are allowed to say.
    function setText(bytes32 node, string calldata key, string calldata value) external {
        _setText(node, key, value);
    }

    /// @notice Write several records on one name you occupy, in one
    ///         transaction — publishing a profile is rarely one key.
    /// @dev The occupancy check runs per key (a warm SLOAD after the first), so
    ///      this stays identical to calling {setText} in a loop.
    function setTexts(bytes32 node, string[] calldata keys, string[] calldata values) external {
        if (keys.length != values.length) revert LengthMismatch();
        for (uint256 i; i < keys.length; ++i) {
            _setText(node, keys[i], values[i]);
        }
    }

    function _setText(bytes32 node, string calldata key, string calldata value) internal {
        ISlot slot = _requireSlot(node);

        address held = slot.occupant();
        if (msg.sender != held) revert NotOccupant(msg.sender, held);

        uint64 tenure = slot.tenureId();
        _text[node][tenure][key] = value;

        emit TextChanged(node, tenure, key, value);
    }

    /**
     * @notice Write a text record on the PARENT name — the namespace's own
     *         profile: `avatar`, `header`, `description`, `url`.
     *
     * @dev The owner, not an occupant: the parent is not for sale here, so the
     *      only party with a claim to describe it is the one that opened it.
     *      Ordinary ENS keys, so any client renders it knowing nothing about
     *      this project. Empty string clears, as ENS's own resolvers spell it.
     */
    function setParentText(string calldata key, string calldata value) external onlyOwner {
        _parentText[key] = value;
        emit ParentTextChanged(key, value);
    }

    /// @notice Write the namespace's whole profile in one transaction.
    function setParentTexts(string[] calldata keys, string[] calldata values) external onlyOwner {
        if (keys.length != values.length) revert LengthMismatch();
        for (uint256 i; i < keys.length; ++i) {
            _parentText[keys[i]] = values[i];
            emit ParentTextChanged(keys[i], values[i]);
        }
    }

    /// @notice A text record: the parent's own, or a subname's CURRENT tenancy.
    /// @dev The parent cannot collide with a slotted node — that would need a
    ///      node that is its own child.
    function textOf(bytes32 node, string calldata key) public view returns (string memory) {
        if (node == parentNode) return _parentText[key];

        address slot = slotOfNode[node];
        if (slot == address(0)) return "";
        return _text[node][ISlot(slot).tenureId()][key];
    }

    /// @notice A parent record, for callers that would rather not namehash.
    function parentTextOf(string calldata key) external view returns (string memory) {
        return _parentText[key];
    }
}
