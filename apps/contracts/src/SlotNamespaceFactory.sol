// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

import {IPermissionedRegistry, IUserRegistry, IVerifiableFactory, RegistryRoles} from "./interfaces/IENSv2.sol";
import {ISlotFactory, SlotInit} from "./interfaces/ISlots.sol";
import {SlotNamespace} from "./SlotNamespace.sol";
import {SlotNamespaceCuration} from "./namespace/SlotNamespaceCuration.sol";
import {Versioned} from "./upgrades/Versioned.sol";
import {VersionedUUPS} from "./upgrades/VersionedUUPS.sol";

/**
 * @title SlotNamespaceFactory
 * @notice Every namespace anyone has opened, the one place to open one, and the
 *         single lever that upgrades all of them.
 *
 * @dev It is the index because nothing else can be: ENSv2 registries do not
 *      know their own name and resolution only walks DOWN from the root.
 *
 *      Namespaces are {BeaconProxy}s, so {upgradeBeacon} replaces the code
 *      behind all of them at once — while one key holds {admin}, that key can
 *      change the code running under every curator's name. The beacon is owned
 *      by THIS CONTRACT, not {admin}, or {upgradeBeacon} could never succeed
 *      and {transferAdmin} would hand over an admin that cannot upgrade.
 */
contract SlotNamespaceFactory is VersionedUUPS {

    /// @notice The beacon every namespace delegates to.
    UpgradeableBeacon public beacon;

    /// @notice May upgrade the beacon, the resolver pointer, and this factory.
    address public admin;

    /// @notice The 0xSlots factory every namespace creates its slots through.
    ISlotFactory public slotFactory;

    /// @notice ENS's CREATE2 deployer for UserRegistry proxies, and the
    ///         implementation those proxies run.
    IVerifiableFactory public verifiableFactory;
    address public userRegistryImpl;

    /// @notice The resolver every namespace opened here starts on. Behind its
    ///         own proxy, so ENS records it once and never repoint it.
    address public resolver;

    address[] private _namespaces;

    /// @notice The namespace for a parent node, if one was opened here.
    mapping(bytes32 parentNode => address) public namespaceOf;

    /// @dev Room to append. `script/layout.py` keys on this name.
    // forge-lint: disable-next-line(mixed-case-variable)
    uint256[43] private __gap;

    error AlreadyOpened(bytes32 parentNode, address namespace);
    error NotAdmin(address caller);
    error ZeroAddress();

    event NamespaceOpened(
        address indexed namespace,
        address indexed registry,
        bytes32 indexed parentNode,
        string parentName,
        address owner
    );
    event AdminTransferred(address indexed from, address indexed to);
    event BeaconUpgraded(address indexed implementation);
    event ResolverChanged(address indexed resolver);

    modifier onlyAdmin() {
        _requireAdmin();
        _;
    }

    /// @dev Out of line: one copy of the check rather than one per function.
    function _requireAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
    }

    /// @dev The beacon is created here rather than passed in, so no
    ///      already-owned beacon can be pointed at this factory.
    function initialize(
        address admin_,
        address namespaceImpl,
        ISlotFactory slotFactory_,
        IVerifiableFactory verifiableFactory_,
        address userRegistryImpl_
    ) external initializer {
        if (admin_ == address(0)) revert ZeroAddress();

        admin = admin_;
        slotFactory = slotFactory_;
        verifiableFactory = verifiableFactory_;
        userRegistryImpl = userRegistryImpl_;
        beacon = new UpgradeableBeacon(namespaceImpl, address(this));

        emit AdminTransferred(address(0), admin_);
        emit BeaconUpgraded(namespaceImpl);
    }

    /// @notice `registry` may be ZERO to have this factory deploy one, which is
    ///         the only way to grant the namespace its roles in the same
    ///         transaction. `labels` may be empty.
    struct OpenParams {
        IPermissionedRegistry registry;
        bytes32 parentNode;
        string parentName;
        SlotInit terms;
        address owner;
        SlotNamespaceCuration.LabelSpec[] labels;
    }

    /**
     * @notice Open a namespace under a parent name, in one transaction.
     *
     * @dev What this CANNOT do is point the parent name at the registry —
     *      `ethRegistry.setSubregistry` belongs to the parent's owner, and until
     *      they call it names register and resolve to nothing. Passing an
     *      existing `registry` skips deployment, and the caller must then grant
     *      the roles themselves.
     */
    function open(OpenParams calldata p) external returns (address namespace, address registry) {
        address existing = namespaceOf[p.parentNode];
        if (existing != address(0)) revert AlreadyOpened(p.parentNode, existing);
        if (p.owner == address(0)) revert ZeroAddress();

        // Empty init data: the address must exist before the registry that
        // grants it roles. Initialized at the end of this same call.
        namespace = address(new BeaconProxy(address(beacon), ""));

        registry = address(p.registry);
        if (registry == address(0)) {
            registry = _deployRegistry(p.parentNode, namespace, p.owner);
        }

        // Before initialize, so a label opened there already resolves here.
        _namespaces.push(namespace);
        namespaceOf[p.parentNode] = namespace;

        SlotNamespace(namespace)
            .initialize(
                SlotNamespace.InitParams({
                    registry_: IPermissionedRegistry(registry),
                    slotFactory_: slotFactory,
                    parentNode_: p.parentNode,
                    parentName_: p.parentName,
                    resolver_: resolver,
                    terms_: p.terms,
                    owner_: p.owner,
                    labels: p.labels
                })
            );

        emit NamespaceOpened(namespace, registry, p.parentNode, p.parentName, p.owner);
    }

    /// @dev The namespace gets exactly what it uses — never `ROLE_RENEW`, as
    ///      names here do not expire. The owner gets everything, so they can
    ///      repair this without us.
    function _deployRegistry(bytes32 parentNode, address namespace, address owner) internal returns (address) {
        IUserRegistry.Grant[] memory grants = new IUserRegistry.Grant[](2);
        grants[0] = IUserRegistry.Grant({
            account: namespace, roleBitmap: RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_UNREGISTER
        });
        grants[1] = IUserRegistry.Grant({account: owner, roleBitmap: RegistryRoles.ALL_ROLES});

        return verifiableFactory.deployProxy(
            userRegistryImpl, uint256(parentNode), abi.encodeCall(IUserRegistry.initialize, (grants))
        );
    }

    /// @notice Point every namespace at new code — this reinterprets the
    ///         storage of all of them at once.
    function upgradeBeacon(address implementation_) external onlyAdmin {
        beacon.upgradeTo(implementation_);
        emit BeaconUpgraded(implementation_);
    }

    /// @notice What namespaces opened from now on start on; existing ones keep
    ///         theirs. For replacing the resolver, not for changing it.
    function setResolver(address resolver_) external onlyAdmin {
        resolver = resolver_;
        emit ResolverChanged(resolver_);
    }

    function transferAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, next);
        admin = next;
    }

    /// @notice The implementation behind every namespace.
    function implementation() external view returns (address) {
        return beacon.implementation();
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

    /// @inheritdoc Versioned
    /// @dev Bump alongside any change to this contract.
    function version() public pure virtual override returns (uint64) {
        return 1;
    }

    function _authorizeUpgrade(address) internal override onlyAdmin {}
}
