// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermissionedRegistry} from "./interfaces/IENSv2.sol";
import {ISlotFactory, SlotInit} from "./interfaces/ISlots.sol";
import {SlotNamespace} from "./SlotNamespace.sol";
import {SlotNamespaceResolver} from "./SlotNamespaceResolver.sol";

/**
 * @title SlotNamespaceFactory
 * @notice Every namespace anyone has opened, and the one place to open one.
 *
 * @dev Exists for a reason that is entirely about the client. "Which parent
 *      names have slotted subnames" has no other answer: ENSv2 registries do
 *      not know their own name, resolution only ever walks DOWN from the root,
 *      and there is no index of who has deployed what. Without this, a home
 *      page could only list namespaces somebody had already told it about.
 *
 *      It holds no authority. It deploys, records, and steps back — it is not
 *      an owner, cannot slot a label, and cannot touch a namespace after
 *      creation. A namespace deployed without it works identically; it simply
 *      will not appear in any listing.
 */
contract SlotNamespaceFactory {
    ISlotFactory public immutable SLOT_FACTORY;

    address[] private _namespaces;

    /// @notice The namespace for a parent node, if one was made here.
    mapping(bytes32 parentNode => address) public namespaceOf;

    /// @notice The resolver deployed alongside it.
    /// @dev Recorded rather than left to the event, because everything that
    ///      needs it — the client, the setup script — would otherwise have to
    ///      predict a CREATE address or parse a receipt to find it.
    mapping(bytes32 parentNode => address) public resolverOf;

    error AlreadyOpened(bytes32 parentNode, address namespace);

    event NamespaceOpened(
        address indexed namespace,
        address indexed resolver,
        bytes32 indexed parentNode,
        string parentName,
        address owner
    );

    constructor(ISlotFactory slotFactory) {
        SLOT_FACTORY = slotFactory;
    }

    /**
     * @notice Open a namespace under a parent name.
     *
     * @dev The caller still has to do two things afterwards that this contract
     *      cannot do for them, because both need authority it does not hold:
     *
     *        registry.grantRootRoles(ROLE_REGISTRAR | ROLE_UNREGISTER, ns)
     *        ethRegistry.setSubregistry(labelhash(parent), registry)
     *
     *      The first is what lets the namespace register anything; the second
     *      is what makes the results resolve.
     *
     * @param registry   The parent's UserRegistry.
     * @param parentNode namehash of the parent, e.g. namehash("community.eth").
     * @param parentName The same name in full, for anything that has to show
     *                   it to a person.
     */
    function open(
        IPermissionedRegistry registry,
        bytes32 parentNode,
        string calldata parentName,
        SlotInit calldata terms,
        address owner
    ) external returns (SlotNamespace namespace, SlotNamespaceResolver resolver) {
        address existing = namespaceOf[parentNode];
        if (existing != address(0)) revert AlreadyOpened(parentNode, existing);

        namespace = new SlotNamespace(registry, SLOT_FACTORY, parentNode, parentName, terms, owner);
        resolver = new SlotNamespaceResolver(namespace);

        _namespaces.push(address(namespace));
        namespaceOf[parentNode] = address(namespace);
        resolverOf[parentNode] = address(resolver);

        emit NamespaceOpened(address(namespace), address(resolver), parentNode, parentName, owner);
    }

    function count() external view returns (uint256) {
        return _namespaces.length;
    }

    function at(uint256 i) external view returns (address) {
        return _namespaces[i];
    }

    /// @notice Every namespace, for a client with no indexer.
    function all() external view returns (address[] memory) {
        return _namespaces;
    }
}
