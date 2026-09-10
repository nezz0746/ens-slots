// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermissionedRegistry} from "../interfaces/IENSv2.sol";
import {ISlot, ISlotFactory, SlotInit} from "../interfaces/ISlots.sol";

/**
 * @title SlotNamespaceBase
 * @notice The state a namespace holds, and nothing that acts on it.
 *
 * @dev The ONLY file declaring storage, so reordering {SlotNamespace}'s bases
 *      cannot move a slot. APPEND above {__gap} and decrement it to match;
 *      `pnpm protocol layout` enforces it. Nothing may be `immutable`.
 */
abstract contract SlotNamespaceBase {
    /// @notice The UserRegistry holding this parent's subnames.
    IPermissionedRegistry public registry;

    /// @notice The 0xSlots factory that mints each slotted label's slot.
    ISlotFactory public slotFactory;

    /// @notice Namehash of the parent name. Written once: one that could be
    ///         re-pointed would answer for names it never registered.

    bytes32 public parentNode;

    /// @notice The parent name in full — {parentNode} is a hash, and ENSv2
    ///         registries do not know their own name.
    string public parentName;

    /// @notice Resolver for this namespace's names. Defaults to the factory's
    ///         shared one; writable as an escape hatch.
    address public resolver;

    /// @notice Terms every slot here is created with; hooks are set per label.
    SlotInit internal _terms;

    /// @notice The slot behind a node, or zero if the node is not slotted.
    mapping(bytes32 node => address slot) public slotOfNode;

    /// @notice The label behind a node, kept so a client can name a slot.
    mapping(bytes32 node => string label) public labelOfNode;

    /// @notice Nodes whose binding the owner has given up the right to remove.
    mapping(bytes32 node => bool) public permanent;

    /// @notice Every slotted node. On chain because a client has no other way
    ///         to list them. Unslotting swaps in the last, so order is unstable.
    bytes32[] internal _slotted;

    /// @dev Position+1 in {_slotted}; zero means absent.
    mapping(bytes32 node => uint256) internal _slottedAt;

    /// @notice Text records, scoped to the tenancy that wrote them. Keyed by
    ///         `tenureId`, not address — by address, an occupant's old records
    ///         would come back if they ever retook the slot.
    mapping(bytes32 node => mapping(uint64 tenure => mapping(string key => string))) internal _text;

    /// @notice Text records on the PARENT name, written by the owner. Separate
    ///         because the parent has no slot: no tenure to key by, no occupant
    ///         to authorise a write.
    mapping(string key => string) internal _parentText;

    /// @notice The `.eth` registry the parent name lives in, and the labelhash
    ///         it is keyed by there.
    /// @dev Together these are how {SlotNamespace-owner} is DERIVED rather than
    ///      stored. The `.eth` registry keys by `keccak(label)`, not by the
    ///      namehash, so {parentNode} alone cannot ask it anything.
    IPermissionedRegistry public ethRegistry;

    bytes32 public parentLabelhash;

    /// @dev Room to append. `script/layout.py` keys on this name.
    // forge-lint: disable-next-line(mixed-case-variable)
    uint256[49] private __gap;

    error AlreadySlotted(string label);
    error NotSlotted(bytes32 node);
    error LabelUnavailable(string label);
    error SlotOccupied(address occupant);
    error PermanentlySlotted(string label);
    error NotOccupant(address caller, address occupant);
    error NoResolver();
    error LengthMismatch();
    error NotParentOwner(address caller, address owner);
    error OwnershipFollowsTheName();
    error LabelhashMismatch();
    error NothingToWithdraw();

    event LabelSlotted(bytes32 indexed node, string label, address indexed slot, address hook, bool permanent);
    event LabelUnslotted(bytes32 indexed node, string label);
    event ResolverChanged(address indexed resolver);
    event TextChanged(bytes32 indexed node, uint64 indexed tenureId, string key, string value);
    event ParentTextChanged(string key, string value);
    event TermsProposed(bytes32 indexed node, uint256 taxBps, address hook, bytes32 hookData, bool changeTax, bool changeHook);
    event TermsCancelled(bytes32 indexed node, bool cancelTax, bool cancelHook);
    event Withdrawn(address indexed to, uint256 amount);

    /// @dev namehash, one level down from the parent.
    function _node(bytes32 labelhash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, labelhash));
    }

    /// @dev The slot behind a node, reverting if there is none.
    function _requireSlot(bytes32 node) internal view returns (ISlot) {
        address slot = slotOfNode[node];
        if (slot == address(0)) revert NotSlotted(node);
        return ISlot(slot);
    }
}
