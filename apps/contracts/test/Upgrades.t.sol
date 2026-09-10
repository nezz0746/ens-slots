// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {SepoliaAddresses} from "../src/Addresses.sol";
import {SlotNamespace} from "../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../src/SlotNamespaceFactory.sol";
import {SlotNamespaceResolver} from "../src/SlotNamespaceResolver.sol";
import {IVerifiableFactory} from "../src/interfaces/IENSv2.sol";
import {ISlotFactory} from "../src/interfaces/ISlots.sol";
import {ForkBase} from "./ForkBase.sol";
import {SlotNamespaceFactoryV2, SlotNamespaceResolverV2, SlotNamespaceV2} from "./mocks/SlotNamespaceV2.sol";

/**
 * @notice The part with no undo.
 *
 * @dev One `upgradeBeacon` replaces the code behind every namespace in the
 *      system at once and touches no proxy's storage, so nothing runs afterwards
 *      to notice a mistake. These tests are the only place the property is
 *      checked before a real one is sent.
 */
contract UpgradesTest is ForkBase {
    // ─── the beacon ─────────────────────────────────────────────────────────

    /**
     * @notice The reason the beacon is here at all: one transaction, every
     *         namespace.
     */
    function test_OneUpgradeMovesEveryNamespaceAtOnce() public {
        (address second,) = _open(_ethNode("secondname"), "secondname.eth", _noLabels());

        assertEq(namespace.version(), 2);
        assertEq(SlotNamespace(second).version(), 2);

        address v2 = address(new SlotNamespaceV2());
        vm.prank(admin);
        factory.upgradeBeacon(v2);

        assertEq(namespace.version(), 3, "the first namespace took the new code");
        assertEq(SlotNamespace(second).version(), 3, "and so did the second, in the same transaction");
    }

    /**
     * @notice The one that cannot be recovered from if it is wrong.
     *
     * @dev A namespace with real state — labels, an occupant, records, a
     *      profile — read through the OLD code, upgraded, and read again. Every
     *      value has to be identical.
     *
     *      `registry` and `parentNode` are the two worth naming: both were
     *      `immutable` before the beacon, so both moved into storage for this
     *      rearchitecture, and both are read on every single call. If either
     *      lands on the wrong slot, a namespace registers into a contract that
     *      is not its registry and answers for names it never opened.
     */
    function test_StorageSurvivesABeaconUpgrade() public {
        (address slot,) = _slot("alpha", address(0), false);
        _slot("links", address(0), true);
        _take(slot, alice, 1 ether);

        vm.prank(alice);
        namespace.setText(_node("alpha"), "url", "https://example.com");
        vm.prank(owner);
        namespace.setParentText("avatar", "https://example.com/pfp.png");

        // Read everything through the old code.
        address registryBefore = address(namespace.registry());
        bytes32 parentBefore = namespace.parentNode();
        string memory nameBefore = namespace.parentName();
        address ownerBefore = namespace.owner();
        address resolverBefore = namespace.resolver();
        (bytes32[] memory nodesBefore, string[] memory labelsBefore, address[] memory slotsBefore) =
            namespace.listing();

        address v2 = address(new SlotNamespaceV2());
        vm.prank(admin);
        factory.upgradeBeacon(v2);

        assertEq(address(namespace.registry()), registryBefore, "registry");
        assertEq(namespace.parentNode(), parentBefore, "parentNode");
        assertEq(namespace.parentName(), nameBefore, "parentName");
        assertEq(namespace.owner(), ownerBefore, "owner");
        assertEq(namespace.resolver(), resolverBefore, "resolver");
        assertEq(address(namespace.slotFactory()), SepoliaAddresses.SLOT_FACTORY, "slotFactory");

        (
            bytes32[] memory nodes,
            string[] memory labels,
            address[] memory slots
        ) = namespace.listing();
        assertEq(nodes.length, nodesBefore.length, "listing length");
        assertEq(nodes[0], nodesBefore[0], "listing nodes");
        assertEq(labels[0], labelsBefore[0], "listing labels");
        assertEq(slots[0], slotsBefore[0], "listing slots");

        assertEq(namespace.textOf(_node("alpha"), "url"), "https://example.com", "the occupant's record");
        assertEq(namespace.textOf(PARENT_NODE, "avatar"), "https://example.com/pfp.png", "the parent's record");
        assertEq(namespace.addrOf(_node("alpha")), alice, "and alice still holds the name");
        assertTrue(namespace.permanent(_node("links")), "a permanent promise stayed permanent");
    }

    /// @notice New behaviour actually arrives, not just a new version number.
    function test_ANewImplementationBringsNewBehaviour() public {
        address v2 = address(new SlotNamespaceV2());
        vm.prank(admin);
        factory.upgradeBeacon(v2);

        vm.prank(owner);
        SlotNamespaceV2(address(namespace)).setTagline("open for business");
        assertEq(SlotNamespaceV2(address(namespace)).tagline(), "open for business");

        // And the ownership that gates it is the ownership it already had.
        vm.prank(alice);
        vm.expectRevert();
        SlotNamespaceV2(address(namespace)).setTagline("not mine");
    }

    /// @notice A namespace opened AFTER an upgrade gets the new code too.
    function test_NamespacesOpenedLaterGetTheCurrentImplementation() public {
        address v2 = address(new SlotNamespaceV2());
        vm.prank(admin);
        factory.upgradeBeacon(v2);

        (address later,) = _open(_ethNode("latername"), "latername.eth", _noLabels());
        assertEq(SlotNamespace(later).version(), 3);
    }

    // ─── who may do it ──────────────────────────────────────────────────────

    function test_OnlyTheAdminMayUpgradeTheBeacon() public {
        address v2 = address(new SlotNamespaceV2());

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceFactory.NotAdmin.selector, owner));
        factory.upgradeBeacon(v2);

        // Not even a namespace owner, who is the closest thing to a stakeholder.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceFactory.NotAdmin.selector, alice));
        factory.upgradeBeacon(v2);
    }

    function test_OnlyTheAdminMayUpgradeTheFactoryOrResolver() public {
        address factoryV2 = address(new SlotNamespaceFactoryV2());
        address resolverV2 = address(new SlotNamespaceResolverV2());

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceFactory.NotAdmin.selector, owner));
        factory.upgradeToAndCall(factoryV2, "");

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceResolver.NotAdmin.selector, owner));
        resolver.upgradeToAndCall(resolverV2, "");
    }

    /**
     * @notice The beacon belongs to the FACTORY, not to the admin key.
     *
     * @dev Handing beacon ownership to the admin EOA reads like the simpler
     *      thing and breaks {SlotNamespaceFactory-upgradeBeacon} permanently:
     *      the caller OpenZeppelin sees there is the factory, so it would revert
     *      forever and {transferAdmin} would hand over an admin role that no
     *      longer carries the power to upgrade.
     */
    function test_TheFactoryOwnsItsBeacon() public view {
        assertEq(factory.beacon().owner(), address(factory));
    }

    /// @notice Admin moves as a unit, and the new admin can actually upgrade.
    function test_AdminCanBeHandedOver() public {
        address multisig = makeAddr("multisig");

        vm.prank(admin);
        factory.transferAdmin(multisig);
        assertEq(factory.admin(), multisig);

        address v2 = address(new SlotNamespaceV2());

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceFactory.NotAdmin.selector, admin));
        factory.upgradeBeacon(v2);

        vm.prank(multisig);
        factory.upgradeBeacon(v2);
        assertEq(namespace.version(), 3);
    }

    // ─── the UUPS singletons ────────────────────────────────────────────────

    /// @notice The factory keeps its index across an upgrade of its own code.
    /// @dev The thing the app depends on most: one address, forever, that still
    ///      lists every namespace ever opened.
    function test_TheFactoryKeepsItsIndexAcrossAnUpgrade() public {
        _open(_ethNode("secondname"), "secondname.eth", _noLabels());

        uint256 countBefore = factory.count();
        address first = factory.at(0);
        address beaconBefore = address(factory.beacon());
        address resolverBefore = factory.resolver();

        address v2 = address(new SlotNamespaceFactoryV2());
        vm.prank(admin);
        factory.upgradeToAndCall(v2, "");

        assertEq(factory.version(), 2, "new code");
        assertEq(factory.count(), countBefore, "same namespaces");
        assertEq(factory.at(0), first);
        assertEq(factory.namespaceOf(PARENT_NODE), address(namespace));
        assertEq(address(factory.beacon()), beaconBefore, "same beacon");
        assertEq(factory.resolver(), resolverBefore, "same resolver");
        assertEq(factory.admin(), admin, "same admin");
    }

    /// @notice And the resolver keeps answering, from the same address.
    function test_TheResolverKeepsAnsweringAcrossAnUpgrade() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        address before = address(resolver);

        address v2 = address(new SlotNamespaceResolverV2());
        vm.prank(admin);
        resolver.upgradeToAndCall(v2, "");

        assertEq(address(resolver), before, "the address ENS holds never moved");
        assertEq(resolver.version(), 2);
        assertEq(address(resolver.factory()), address(factory));

        bytes memory answer = resolver.resolve(
            _dnsEncode("alpha", "slotsdemo", "eth"), abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0))
        );
        assertEq(abi.decode(answer, (address)), alice);
    }

    // ─── implementations are locked ─────────────────────────────────────────

    /**
     * @notice No implementation can be initialized directly.
     *
     * @dev Otherwise anyone can claim `admin` on the factory implementation or
     *      `owner` on the namespace one. For a UUPS implementation that is not
     *      cosmetic: an attacker who owns it can call `upgradeToAndCall` on the
     *      implementation itself and, pre-Dencun, `selfdestruct` it — taking
     *      every proxy pointing at it down with it.
     */
    function test_NoImplementationCanBeInitialized() public {
        SlotNamespace namespaceImpl = new SlotNamespace();
        SlotNamespaceFactory factoryImpl = new SlotNamespaceFactory();
        SlotNamespaceResolver resolverImpl = new SlotNamespaceResolver();

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        factoryImpl.initialize(
            alice,
            address(namespaceImpl),
            ISlotFactory(SepoliaAddresses.SLOT_FACTORY),
            IVerifiableFactory(SepoliaAddresses.ENS_VERIFIABLE_FACTORY),
            SepoliaAddresses.ENS_USER_REGISTRY_IMPL
        );

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        resolverImpl.initialize(alice, factory);

        SlotNamespace.InitParams memory p;
        p.owner_ = alice;
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        namespaceImpl.initialize(p);
    }

    /// @notice And a live namespace cannot be re-initialized to steal it.
    function test_ALiveNamespaceCannotBeReinitialized() public {
        SlotNamespace.InitParams memory p;
        p.owner_ = alice;

        vm.prank(alice);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        namespace.initialize(p);

        assertEq(namespace.owner(), owner);
    }
}
