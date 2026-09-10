// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IPermissionedRegistry, IRegistry, RegistryRoles} from "../interfaces/IENSv2.sol";
import {ISlot, SlotInit} from "../interfaces/ISlots.sol";
import {SlotNamespaceBase} from "./SlotNamespaceBase.sol";

/**
 * @title SlotNamespaceCuration
 * @notice What the namespace's owner may do: open labels, close them, and
 *         choose where they resolve.
 *
 * @dev The registry is written exactly twice in a name's life — {slotLabel} and
 *      {unslotLabel}. Buying, releasing and liquidating write nothing here: the
 *      name is bound to the SLOT, not its occupant. Unregistering on release
 *      would return the label to `AVAILABLE` for anyone to take, and force a
 *      re-registration (and a new token id) on every cycle.
 *
 *      Declares no storage. See {SlotNamespaceBase}.
 */
abstract contract SlotNamespaceCuration is SlotNamespaceBase, OwnableUpgradeable {
    /// @notice One label to open, and the terms that differ per label.
    struct LabelSpec {
        string label;
        address hook;
        bytes32 hookData;
        bool permanent;
    }

    /**
     * @notice Put a label up for occupancy: create the slot, register the label
     *         to THIS contract, point it at the resolver, record the binding.
     *
     * @dev The hook comes from the namespace's terms — it carries the minimum
     *      tenure every space here is sold with, which is a promise the market
     *      makes rather than a per-label option. `spec.hook` still overrides it
     *      for a label that needs its own policy.
     *
     *      Economic terms deliberately do not vary: price is self-assessed, so
     *      a better label is priced higher by its own occupant at the same rate.
     */
    function slotLabel(string calldata label, address hook, bytes32 hookData, bool permanent_)
        external
        onlyOwner
        returns (address slot, uint256 tokenId)
    {
        return _slotOne(LabelSpec({label: label, hook: hook, hookData: hookData, permanent: permanent_}));
    }

    /// @notice Open several labels in one transaction. All or nothing — a
    ///         partial batch could not be re-sent without reverting on the
    ///         labels that already exist.
    function slotLabels(LabelSpec[] calldata specs) external onlyOwner returns (address[] memory slots) {
        slots = new address[](specs.length);
        for (uint256 i; i < specs.length; ++i) {
            (slots[i],) = _slotOne(specs[i]);
        }
    }

    /// @dev Also called by {SlotNamespace-initialize}, which is what lets a
    ///      namespace open with its labels already on the market.
    function _slotOne(LabelSpec memory spec) internal returns (address slot, uint256 tokenId) {
        if (resolver == address(0)) revert NoResolver();

        bytes32 labelhash = keccak256(bytes(spec.label));
        bytes32 node = _node(labelhash);
        if (slotOfNode[node] != address(0)) revert AlreadySlotted(spec.label);

        if (registry.getStatus(uint256(labelhash)) != IPermissionedRegistry.Status.AVAILABLE) {
            revert LabelUnavailable(spec.label);
        }

        {
            SlotInit memory init = _terms;
            // A per-label hook overrides the namespace's. Zero means "use the
            // namespace's" rather than "no hook", so the common case — every
            // space on the same terms — needs nothing passed per label.
            if (spec.hook != address(0)) {
                init.hook = spec.hook;
                init.hookData = spec.hookData;
            }
            slot = slotFactory.createSlot(init);
        }

        tokenId = _register(spec.label);

        slotOfNode[node] = slot;
        labelOfNode[node] = spec.label;
        _slotted.push(node);
        _slottedAt[node] = _slotted.length;
        if (spec.permanent) permanent[node] = true;

        emit LabelSlotted(node, spec.label, slot, spec.hook, spec.permanent);
    }

    /// @dev No expiry: the tax already recycles an abandoned slot, and a second
    ///      clock would only let a paid-up occupant lose their name for an
    ///      unrelated reason. Hence `ROLE_RENEW` is never needed.
    function _register(string memory label) internal returns (uint256) {
        return registry.register(
            label,
            address(this),
            IRegistry(address(0)),
            resolver,
            RegistryRoles.ROLE_SET_RESOLVER | RegistryRoles.admin(RegistryRoles.ROLE_SET_RESOLVER),
            type(uint64).max
        );
    }

    /// @notice Take a label back out of the namespace. Only while VACANT —
    ///         taking a name from someone paying tax for it is the one move that
    ///         would make this untrustworthy. The slot is left on chain.
    function unslotLabel(string calldata label) external onlyOwner {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _node(labelhash);

        ISlot slot = _requireSlot(node);
        if (permanent[node]) revert PermanentlySlotted(label);

        address held = slot.occupant();
        if (held != address(0)) revert SlotOccupied(held);

        // Swap-and-pop: the array stays dense.
        uint256 i = _slottedAt[node] - 1;
        bytes32 last = _slotted[_slotted.length - 1];
        _slotted[i] = last;
        _slottedAt[last] = i + 1;
        _slotted.pop();
        delete _slottedAt[node];

        delete slotOfNode[node];
        delete labelOfNode[node];

        registry.unregister(uint256(labelhash));

        emit LabelUnslotted(node, label);
    }

    /// @notice Point future registrations at a new resolver — an escape hatch
    ///         for an owner wanting rules the shared one does not have.
    /// @dev Existing names keep the old one until {repointLabels} moves them.
    function setResolver(address newResolver) external onlyOwner {
        resolver = newResolver;
        emit ResolverChanged(newResolver);
    }

    /// @notice Move already-slotted labels onto the current resolver.
    function repointLabels(string[] calldata labels) external onlyOwner {
        for (uint256 i; i < labels.length; ++i) {
            bytes32 labelhash = keccak256(bytes(labels[i]));
            _requireSlot(_node(labelhash));
            registry.setResolver(uint256(labelhash), resolver);
        }
    }
}
