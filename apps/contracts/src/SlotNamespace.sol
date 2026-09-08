// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

import {IPermissionedRegistry, IRegistry, RegistryRoles} from "./interfaces/IENSv2.sol";
import {ISlot, ISlotFactory, SlotInit} from "./interfaces/ISlots.sol";

/**
 * @title SlotNamespace
 * @notice One parent name's slotted subnames: curator, ENS custodian, and the
 *         store for whatever their occupants write.
 *
 * @dev ── What "slot bound" means here ───────────────────────────────────────
 *
 *      A slotted label's ENS name belongs to this contract, permanently. It is
 *      never transferred to an occupant and never unregistered when one leaves.
 *      What follows the occupant is RESOLUTION: `addr()` is the slot's current
 *      `occupant()`, read at the moment the question is asked.
 *
 *      That is a deliberate inversion of the obvious design, in which the name
 *      is handed to whoever holds the slot. Two things fall out of it:
 *
 *        * Nothing has to happen on a turnover. No callback fires, no registry
 *          write is attempted, and therefore nothing can fail. A design that
 *          moved the token would have to do so from inside a hook — which the
 *          slot gas-caps and is allowed to swallow — and a swallowed move
 *          leaves the name pointing at somebody who no longer holds it.
 *        * The slot's ONE hook stays free. A slotted label can carry a minimum
 *          tenure, an advertising hook, or an eligibility rule, because this
 *          contract does not need to be that hook.
 *
 *      The cost is that an occupant never holds a name NFT. They cannot sell
 *      it, transfer it, or see it in a wallet. Occupancy is the only market for
 *      the position, which is the same trade the protocol's slot-bound NFTs
 *      make, and it is the thing a client must say plainly.
 *
 *      ── Two lifecycles, deliberately uncoupled ────────────────────────────
 *
 *      The REGISTRY is written exactly twice in a name's life: {slotLabel}
 *      registers it, {unslotLabel} removes it, both by this contract's owner.
 *      Buying, releasing and liquidating a slot write nothing here at all.
 *
 *      Release is not unregistration. A released slot is vacant, so the name
 *      goes dark and waits for the next occupant — the name is bound to the
 *      SLOT, not to whoever is sitting in it. Unregistering on release would
 *      return the label to `AVAILABLE`, where anyone could take it, and would
 *      force a re-registration on the next buy: a registry write from inside a
 *      failable callback, plus a fresh token id every cycle, since ENSv2 token
 *      ids change on re-registration.
 *
 *      ── Why this contract holds tokens ───────────────────────────────────
 *
 *      ENSv2 names are {ERC1155Singleton} tokens and this contract is their
 *      permanent custodian, so it has to be able to receive one: without
 *      {ERC1155Holder} the registry's mint reverts with
 *      `ERC1155InvalidReceiver` and no label can ever be slotted. It accepts
 *      the tokens and never sends them anywhere — the names it holds are the
 *      names it registered, and they leave only by {unslotLabel}.
 *
 *      ── Where state lives ─────────────────────────────────────────────────
 *
 *      All of it, here. {SlotNamespaceResolver} holds nothing and can be
 *      replaced with one call — which matters, because the ENS docs say these
 *      resolver interfaces are not final. A resolver holding the bindings and
 *      the records could not be swapped without losing both.
 */
contract SlotNamespace is Ownable, ERC1155Holder {
    // ─── configuration ──────────────────────────────────────────────────────

    /// @notice The UserRegistry holding this parent's subnames.
    IPermissionedRegistry public immutable REGISTRY;

    /// @notice The 0xSlots factory that mints each slotted label's slot.
    ISlotFactory public immutable SLOT_FACTORY;

    /**
     * @notice The namehash of the parent name, e.g. `namehash("community.eth")`.
     *
     * @dev Needed because a resolver is asked about a NODE while a registry is
     *      asked about a LABEL, and this contract is the only place that knows
     *      both. Immutable: a namespace that could be re-pointed at a different
     *      parent could silently start answering for names it never registered.
     */
    bytes32 public immutable PARENT_NODE;

    /**
     * @notice The parent name in full, e.g. "community.eth".
     *
     * @dev Stored because {PARENT_NODE} is a hash and a hash cannot be shown
     *      to anyone. A client listing namespaces has no other way back to the
     *      human name, and there is no registry to ask: ENSv2 registries have
     *      no concept of "their own name" at all.
     */
    string public parentName;

    /// @notice The terms every slot in this namespace is created with.
    /// @dev `hook` and `hookData` are left blank and filled per label.
    SlotInit private _terms;

    /**
     * @notice The resolver this namespace points its names at.
     *
     * @dev Replaceable on purpose. Everything it serves is read from here, so
     *      swapping it changes how names resolve without touching a single
     *      binding or record.
     */
    address public resolver;

    // ─── bindings ───────────────────────────────────────────────────────────

    /// @notice The slot behind a node, or zero if the node is not slotted.
    mapping(bytes32 node => address slot) public slotOfNode;

    /// @notice The label behind a node, kept so a client can name a slot.
    mapping(bytes32 node => string label) public labelOfNode;

    /// @notice Nodes whose binding the owner has given up the right to remove.
    mapping(bytes32 node => bool) public permanent;

    /**
     * @notice Every node currently slotted, in slotting order.
     *
     * @dev On chain rather than left to an indexer. "Which subnames are
     *      slotted" is the first question any client asks and there is no
     *      event stream to derive it from without one — a page that cannot
     *      list its own contents is not a page. Unslotting swaps in the last
     *      element, so order is not stable and nothing should depend on it.
     */
    bytes32[] private _slotted;

    /// @dev Position+1 in {_slotted}; zero means absent.
    mapping(bytes32 node => uint256) private _slottedAt;

    /**
     * @notice Text records, scoped to the tenancy that wrote them.
     *
     * @dev Keyed by `tenureId` rather than by occupant address, and the
     *      difference is not cosmetic. Keying by address does clear Alice's
     *      records when Bob takes over — and RESURRECTS them if Alice ever
     *      takes the slot back. The protocol already increments `tenureId` on
     *      every buy for exactly this reason, so a second tenancy is a
     *      different generation even for the same person.
     */
    mapping(bytes32 node => mapping(uint64 tenure => mapping(string key => string))) private _text;

    // ─── errors ─────────────────────────────────────────────────────────────

    error AlreadySlotted(string label);
    error NotSlotted(bytes32 node);
    error LabelUnavailable(string label);
    error SlotOccupied(address occupant);
    error PermanentlySlotted(string label);
    error NotOccupant(address caller, address occupant);
    error NoResolver();

    // ─── events ─────────────────────────────────────────────────────────────

    event LabelSlotted(bytes32 indexed node, string label, address indexed slot, address hook, bool permanent);
    event LabelUnslotted(bytes32 indexed node, string label);
    event ResolverChanged(address indexed resolver);
    event TextChanged(bytes32 indexed node, uint64 indexed tenureId, string key, string value);

    /**
     * @param registry     The UserRegistry this namespace registers into. It
     *                     must grant this contract `ROLE_REGISTRAR` and
     *                     `ROLE_UNREGISTER` on `ROOT_RESOURCE`. Note what is
     *                     NOT needed: `ROLE_RENEW`. Names here never expire,
     *                     so that authority is never granted at all.
     * @param terms_       The slot terms every label in this namespace gets.
     *                     `hook` and `hookData` are ignored and set per label.
     */
    constructor(
        IPermissionedRegistry registry,
        ISlotFactory slotFactory,
        bytes32 parentNode,
        string memory parentName_,
        SlotInit memory terms_,
        address owner_
    ) Ownable(owner_) {
        REGISTRY = registry;
        SLOT_FACTORY = slotFactory;
        PARENT_NODE = parentNode;
        parentName = parentName_;

        terms_.hook = address(0);
        terms_.hookData = bytes32(0);
        _terms = terms_;
    }

    // ─── curation ───────────────────────────────────────────────────────────

    /**
     * @notice Put a label up for occupancy.
     *
     * @dev One transaction does all of it: create the slot, register the label
     *      to THIS contract, point it at the resolver, record the binding.
     *
     *      `hook` and `hookData` are per label rather than per namespace,
     *      because a hook is policy and policy is what differs between labels.
     *      The economic terms deliberately do not vary: price is self-assessed,
     *      so a more valuable label is priced higher by its own occupant and
     *      pays more tax at the same rate. That is what common ownership is for.
     *
     * @param permanent_ Give up the right to ever {unslotLabel} this one. A
     *                   credible commitment to whoever occupies it, and
     *                   irreversible by construction.
     */
    function slotLabel(string calldata label, address hook, bytes32 hookData, bool permanent_)
        external
        onlyOwner
        returns (address slot, uint256 tokenId)
    {
        if (resolver == address(0)) revert NoResolver();

        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _node(labelhash);
        if (slotOfNode[node] != address(0)) revert AlreadySlotted(label);

        if (REGISTRY.getStatus(uint256(labelhash)) != IPermissionedRegistry.Status.AVAILABLE) {
            revert LabelUnavailable(label);
        }

        SlotInit memory init = _terms;
        init.hook = hook;
        init.hookData = hookData;
        slot = SLOT_FACTORY.createSlot(init);

        // Registered to this contract, at no expiry. The continuous tax and
        // liquidation already recycle an abandoned slot; a second clock would
        // only add a way for a paid-up occupant to lose their name for an
        // unrelated reason. It is also why `ROLE_RENEW` is never needed.
        tokenId = REGISTRY.register(
            label,
            address(this),
            IRegistry(address(0)),
            resolver,
            RegistryRoles.ROLE_SET_RESOLVER | RegistryRoles.admin(RegistryRoles.ROLE_SET_RESOLVER),
            type(uint64).max
        );

        slotOfNode[node] = slot;
        labelOfNode[node] = label;
        _slotted.push(node);
        _slottedAt[node] = _slotted.length;
        if (permanent_) permanent[node] = true;

        emit LabelSlotted(node, label, slot, hook, permanent_);
    }

    /**
     * @notice Take a label back out of the namespace.
     *
     * @dev Only while VACANT. Unslotting an occupied label would take a name
     *      out from under somebody who is paying tax for it — the one move
     *      that would make this whole arrangement untrustworthy.
     *
     *      The slot itself is left alone. It stays on chain, unreferenced;
     *      this contract has no authority over it and never did.
     */
    function unslotLabel(string calldata label) external onlyOwner {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _node(labelhash);

        address slot = slotOfNode[node];
        if (slot == address(0)) revert NotSlotted(node);
        if (permanent[node]) revert PermanentlySlotted(label);

        address held = ISlot(slot).occupant();
        if (held != address(0)) revert SlotOccupied(held);

        // Swap-and-pop, so the array stays dense.
        uint256 i = _slottedAt[node] - 1;
        bytes32 last = _slotted[_slotted.length - 1];
        _slotted[i] = last;
        _slottedAt[last] = i + 1;
        _slotted.pop();
        delete _slottedAt[node];

        delete slotOfNode[node];
        delete labelOfNode[node];

        REGISTRY.unregister(uint256(labelhash));

        emit LabelUnslotted(node, label);
    }

    /// @notice Point this namespace's future registrations at a new resolver.
    /// @dev Existing names keep the old one until {repointLabel} moves them,
    ///      so a swap is deliberate per name rather than silent for all.
    function setResolver(address newResolver) external onlyOwner {
        resolver = newResolver;
        emit ResolverChanged(newResolver);
    }

    /// @notice Move one already-slotted label onto the current resolver.
    function repointLabel(string calldata label) external onlyOwner {
        bytes32 node = _node(keccak256(bytes(label)));
        if (slotOfNode[node] == address(0)) revert NotSlotted(node);
        REGISTRY.setResolver(uint256(keccak256(bytes(label))), resolver);
    }

    // ─── records ────────────────────────────────────────────────────────────

    /**
     * @notice Write a text record on a name you currently occupy.
     *
     * @dev The occupant, not the owner: this is the one thing about a slotted
     *      name that its holder controls, and it lasts exactly as long as
     *      their tenancy.
     */
    function setText(bytes32 node, string calldata key, string calldata value) external {
        address slot = slotOfNode[node];
        if (slot == address(0)) revert NotSlotted(node);

        address held = ISlot(slot).occupant();
        if (msg.sender != held) revert NotOccupant(msg.sender, held);

        uint64 tenure = ISlot(slot).tenureId();
        _text[node][tenure][key] = value;

        emit TextChanged(node, tenure, key, value);
    }

    // ─── resolution, as data ────────────────────────────────────────────────

    /**
     * @notice Who holds the name right now.
     *
     * @dev Derived on every read, never stored. Zero for a vacant slot, which
     *      is the honest answer: nobody holds it, so the name goes dark until
     *      somebody does. Returning the parent owner instead would have the
     *      name answer with an address that has no claim to it.
     */
    function addrOf(bytes32 node) public view returns (address) {
        address slot = slotOfNode[node];
        if (slot == address(0)) return address(0);
        return ISlot(slot).occupant();
    }

    /// @notice A text record, from the CURRENT tenancy only.
    function textOf(bytes32 node, string calldata key) public view returns (string memory) {
        address slot = slotOfNode[node];
        if (slot == address(0)) return "";
        return _text[node][ISlot(slot).tenureId()][key];
    }

    // ─── views ──────────────────────────────────────────────────────────────

    function terms() external view returns (SlotInit memory) {
        return _terms;
    }

    function slottedCount() external view returns (uint256) {
        return _slotted.length;
    }

    /**
     * @notice Everything a client needs to draw this namespace, in one call.
     *
     * @dev The per-slot numbers are deliberately NOT here. A caller reads
     *      `getSlotInfo()` on each address, which is one multicall and is the
     *      same data the slot's own page shows — copying price and deposit
     *      into this struct would give a client two sources for one fact and
     *      a way for them to disagree.
     */
    function listing() external view returns (bytes32[] memory nodes, string[] memory labels, address[] memory slots) {
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

    /// @dev namehash, one level down from the parent.
    function _node(bytes32 labelhash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(PARENT_NODE, labelhash));
    }
}
