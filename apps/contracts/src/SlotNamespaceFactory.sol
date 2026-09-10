// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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

    /// @dev namehash("eth"). Every parent here is a second-level `.eth` name.
    bytes32 internal constant ETH_NODE = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));

    /**
     * @dev The floor on how long a position must be funded for.
     *
     * Fixed rather than chosen: it is a protocol-shaped number, not a market
     * one, and the app hardcoded the same week into every namespace it opened.
     * A caller-chosen value would have been a fourth thing to get wrong for no
     * gain anybody asked for.
     */
    uint256 internal constant MIN_DEPOSIT_SECONDS = 7 days;

    /// @notice The canonical minimum-tenure hook, attached to every namespace
    ///         that asks for a guaranteed run.
    /// @dev Configured, not passed. A caller who could name the hook could name
    ///      one that vetoes every buy, or one that simply is not this — and the
    ///      app naming it from a generated address book is how it silently
    ///      attached an older deployment for weeks.
    address public minimumTenureHook;

    /// @notice The `.eth` registry every namespace derives its owner from.
    /// @dev Configured here rather than passed to {open}: a caller who could
    ///      name the registry could name one whose `ownerOf` answers whatever
    ///      they like, which is the whole of a namespace's access control.
    IPermissionedRegistry public ethRegistry;

    /// @notice The resolver every namespace opened here starts on. Behind its
    ///         own proxy, so ENS records it once and never repoint it.
    address public resolver;

    address[] private _namespaces;

    /// @notice The namespace for a parent node, if one was opened here.
    mapping(bytes32 parentNode => address) public namespaceOf;

    /// @dev Room to append. `script/layout.py` keys on this name.
    // forge-lint: disable-next-line(mixed-case-variable)
    uint256[43] private __gap;

    error NotASecondLevelEthName();
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
        address userRegistryImpl_,
        IPermissionedRegistry ethRegistry_,
        address minimumTenureHook_
    ) external initializer {
        if (admin_ == address(0)) revert ZeroAddress();
        if (address(ethRegistry_) == address(0)) revert ZeroAddress();

        admin = admin_;
        ethRegistry = ethRegistry_;
        minimumTenureHook = minimumTenureHook_;
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
    /**
     * @notice What opening a namespace actually needs.
     *
     * @dev Three choices and a name. It used to be a whole `SlotInit`, of which
     *      four fields were overwritten before they reached a slot — recipient
     *      and manager become this namespace, and both mutable flags are forced
     *      on — one was an address the caller had no business choosing, and one
     *      the app hardcoded. A struct where a third of the fields are ignored
     *      teaches the reader that the values do not matter, which is exactly
     *      the wrong lesson about the ones that do.
     *
     *      `parentNode` and `parentLabelhash` are gone too: both are derived
     *      from `parentName`, so they cannot disagree with it.
     */
    struct OpenParams {
        IPermissionedRegistry registry;
        /// @dev The full name, e.g. `l2beat.eth`. Must be second-level `.eth`.
        string parentName;
        /// @dev What every slot here is priced and taxed in. The one thing a
        ///      namespace genuinely shares — two currencies under one name
        ///      would make every figure on a page mean two things.
        IERC20 currency;
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
        // Derived, not passed. `namehash("<label>.eth")` is
        // `keccak(ETH_NODE, keccak(label))`, so one string gives both — and two
        // values that come from one source cannot contradict each other.
        bytes32 parentLabelhash = keccak256(bytes(_labelOf(p.parentName)));
        bytes32 parentNode = keccak256(abi.encodePacked(ETH_NODE, parentLabelhash));

        address existing = namespaceOf[parentNode];
        if (existing != address(0)) revert AlreadyOpened(parentNode, existing);

        // No owner argument. A namespace answers to whoever holds its parent
        // name, so there is nothing here to choose — and opening one for a name
        // you do not own now hands it to the person who does.
        address owner = ethRegistry.ownerOf(ethRegistry.getTokenId(uint256(parentLabelhash)));
        if (owner == address(0)) revert ZeroAddress();

        // Empty init data: the address must exist before the registry that
        // grants it roles. Initialized at the end of this same call.
        namespace = address(new BeaconProxy(address(beacon), ""));

        registry = address(p.registry);
        if (registry == address(0)) {
            registry = _deployRegistry(parentNode, namespace, owner);
        }

        // Before initialize, so a label opened there already resolves here.
        _namespaces.push(namespace);
        namespaceOf[parentNode] = namespace;

        SlotNamespace(payable(namespace))
            .initialize(
                SlotNamespace.InitParams({
                    registry_: IPermissionedRegistry(registry),
                    slotFactory_: slotFactory,
                    parentNode_: parentNode,
                    parentName_: p.parentName,
                    resolver_: resolver,
                    terms_: _termsFor(p),
                    ethRegistry_: ethRegistry,
                    parentLabelhash_: parentLabelhash,
                    labels: p.labels
                })
            );

        emit NamespaceOpened(namespace, registry, parentNode, p.parentName, owner);
    }

    /**
     * @dev The whole `SlotInit`, from three choices.
     *
     * Recipient and manager are placeholders: {SlotNamespaceCuration-_slotOne}
     * replaces both with the namespace, which is what keeps control and income
     * attached to the parent name. Both mutable flags are forced on by
     * {SlotNamespace-initialize} for the same reason — a namespace that opened
     * without them could never be given them later.
     *
     * `taxBps` is zero and `hookData` empty ON PURPOSE. This is not a set of
     * default terms — there are none. Every label states its own rate and its
     * own guaranteed run, and `_slotOne` fills both in per label. What survives
     * here is the currency, the escrow floor, and `hook` carrying the ONE hook
     * address the namespace is allowed to attach.
     */
    function _termsFor(OpenParams calldata p) internal view returns (SlotInit memory) {
        return SlotInit({
            recipient: address(this),
            currency: p.currency,
            manager: address(this),
            hook: minimumTenureHook,
            hookData: bytes32(0),
            taxBps: 0,
            minDepositSeconds: MIN_DEPOSIT_SECONDS,
            mutableTax: true,
            mutableHook: true
        });
    }

    /**
     * @dev The label of a `<label>.eth` name, and a check that it is one.
     *
     * Everything here assumes a second-level `.eth` parent — the node
     * derivation above is only correct for one. That assumption used to be
     * enforced by comparing two values the caller passed; deriving them makes
     * it structural, and this is where it is stated.
     */
    function _labelOf(string calldata name) internal pure returns (string memory) {
        bytes calldata b = bytes(name);
        uint256 dot = b.length;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] == ".") {
                dot = i;
                break;
            }
        }
        if (dot == 0 || b.length != dot + 4) revert NotASecondLevelEthName();
        if (b[dot + 1] != "e" || b[dot + 2] != "t" || b[dot + 3] != "h") {
            revert NotASecondLevelEthName();
        }
        return string(b[:dot]);
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
    ///      2: `open` takes three choices and a name. Version 1 shipped to
    ///      Sepolia and then `OpenParams` and `LabelSpec` both changed shape
    ///      without this number moving, so the live factory answered a
    ///      selector the app no longer sent and every `open` reverted with no
    ///      reason at all. The signature is the contract; changing it is a
    ///      version.
    function version() public pure virtual override returns (uint64) {
        return 2;
    }

    function _authorizeUpgrade(address) internal override onlyAdmin {}
}
