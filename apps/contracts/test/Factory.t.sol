// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SlotNamespace} from "../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../src/SlotNamespaceFactory.sol";
import {SlotNamespaceBase} from "../src/namespace/SlotNamespaceBase.sol";
import {SlotNamespaceCuration} from "../src/namespace/SlotNamespaceCuration.sol";
import {IPermissionedRegistry, RegistryRoles} from "../src/interfaces/IENSv2.sol";
import {ISlot} from "../src/interfaces/ISlots.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ForkBase} from "./ForkBase.sol";

/**
 * @notice Opening a namespace, and everything that used to take four
 *         signatures to do it.
 */
contract FactoryTest is ForkBase {
    // ─── one call ───────────────────────────────────────────────────────────

    /**
     * @notice What the register page used to walk somebody through, in one
     *         transaction.
     *
     * @dev Four steps became one: deploy a UserRegistry, open the namespace,
     *      grant it its two roles, point it at a resolver. The roles are the
     *      interesting part — they go in the REGISTRY'S OWN INITIALIZER rather
     *      than a `grantRootRoles` afterwards, which is only possible because
     *      the namespace's address is known before the registry exists. Its
     *      proxy is created with no init data and initialized at the end of the
     *      same call.
     */
    function test_OpenStandsUpAWholeNamespaceInOneCall() public {
        assertTrue(address(registry) != address(0), "a registry was deployed");
        assertTrue(address(registry).code.length > 0, "and it is real");

        assertTrue(
            registry.hasRootRoles(RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_UNREGISTER, address(namespace)),
            "the namespace can register and unregister"
        );
        assertFalse(
            registry.hasRootRoles(RegistryRoles.ROLE_RENEW, address(namespace)),
            "and nothing more: names here never expire"
        );
        assertTrue(registry.hasRootRoles(RegistryRoles.ALL_ROLES, owner), "the owner can repair it without us");

        assertEq(namespace.owner(), owner);
        assertEq(namespace.parentNode(), PARENT_NODE);
        assertEq(namespace.parentName(), "slotsdemo.eth");
        assertEq(namespace.resolver(), address(resolver), "on the shared resolver, with no extra call");
        assertEq(factory.namespaceOf(PARENT_NODE), address(namespace));
        assertEq(factory.all()[0], address(namespace));

        // The roles are real: the namespace can immediately use them.
        vm.prank(owner);
        namespace.slotLabel("alpha", address(0), bytes32(0), 0, false);
        assertEq(
            uint8(registry.getStatus(uint256(keccak256("alpha")))), uint8(IPermissionedRegistry.Status.REGISTERED)
        );
    }

    /// @notice And it can open the labels too, so a namespace arrives populated.
    function test_OpenCanSlotLabelsInTheSameTransaction() public {
        SlotNamespaceCuration.LabelSpec[] memory labels = new SlotNamespaceCuration.LabelSpec[](3);
        labels[0] = _spec("gm");
        labels[1] = _spec("links");
        labels[2] = _spec("hire");

        (address ns,) = _open("populated.eth", labels);

        (, string[] memory got,) = SlotNamespace(payable(ns)).listing();
        assertEq(got.length, 3);
        assertEq(got[0], "gm");
        assertEq(got[2], "hire");
    }

    /// @notice A namespace can still be opened on a registry somebody else made.
    /// @dev The factory has no authority there, so the roles are the caller's to
    ///      grant — and until they do, slotting reverts rather than half-working.
    function test_OpenAcceptsAnExistingRegistry() public {
        (, address reg) = _open("borrowed.eth", _noLabels());

        // Reuse it under a different parent node, which is legal: one registry
        // can sit at many positions in ENSv2. The second parent needs owning
        // too — a namespace answers to whoever holds its name.
        _ownParent("reused.eth");
        (address ns,) = factory.open(
            SlotNamespaceFactory.OpenParams({
                registry: IPermissionedRegistry(reg),
                parentName: "reused.eth",
                currency: IERC20(address(0)),
                taxBps: TAX_BPS,
                minTenureSeconds: 0,
                labels: _noLabels()
            })
        );

        assertEq(address(SlotNamespace(payable(ns)).registry()), reg, "it took the registry it was given");
    }

    function test_AParentCannotBeOpenedTwice() public {
        // `_open` would register the parent first, and `expectRevert` binds to
        // the very next call — which would be that, not the one under test.
        vm.expectRevert(
            abi.encodeWithSelector(SlotNamespaceFactory.AlreadyOpened.selector, PARENT_NODE, address(namespace))
        );
        factory.open(
            SlotNamespaceFactory.OpenParams({
                registry: IPermissionedRegistry(address(0)),
                parentName: "slotsdemo.eth",
                currency: IERC20(address(0)),
                taxBps: TAX_BPS,
                minTenureSeconds: 0,
                labels: _noLabels()
            })
        );
    }

    /// @notice A name nobody owns has no namespace to open. `ownerOf` answers
    ///         zero for an unregistered or expired name, and that is the whole
    ///         check now — there is no owner argument left to get wrong.
    function test_ANamespaceCannotBeOpenedForAnUnownedName() public {
        vm.expectRevert(SlotNamespaceFactory.ZeroAddress.selector);
        factory.open(
            SlotNamespaceFactory.OpenParams({
                registry: IPermissionedRegistry(address(0)),
                parentName: "ownerless.eth",
                currency: IERC20(address(0)),
                taxBps: TAX_BPS,
                minTenureSeconds: 0,
                labels: _noLabels()
            })
        );
    }

    /// @notice The factory is the only answer to "which parents have slots".
    function test_TheFactoryRecordsEveryNamespaceItOpens() public {
        assertEq(factory.count(), 1);

        (address second,) = _open("secondname.eth", _noLabels());

        assertEq(factory.count(), 2);
        assertEq(factory.at(1), second);
        assertEq(factory.all().length, 2);
        assertEq(factory.namespaceOf(_ethNode("secondname")), second);
    }

    // ─── batching, once a namespace is open ─────────────────────────────────

    /// @notice Several labels, one signature.
    function test_SlotLabelsOpensSeveralAtOnce() public {
        SlotNamespaceCuration.LabelSpec[] memory labels = new SlotNamespaceCuration.LabelSpec[](3);
        labels[0] = _spec("one");
        labels[1] = _spec("two");
        labels[2] = _spec("three");

        vm.prank(owner);
        address[] memory slots = namespace.slotLabels(labels);

        assertEq(slots.length, 3);
        assertEq(namespace.slottedCount(), 3);
        for (uint256 i; i < 3; ++i) {
            assertTrue(slots[i].code.length > 0, "each got a real slot");
            assertEq(ISlot(slots[i]).taxBps(), TAX_BPS, "on the namespace's terms");
        }
    }

    /// @notice All or nothing. A half-applied batch would leave the owner
    ///         reading a receipt to find out which of their labels are live.
    function test_ABatchWithADuplicateRevertsEntirely() public {
        _slot("taken", address(0), false);

        SlotNamespaceCuration.LabelSpec[] memory labels = new SlotNamespaceCuration.LabelSpec[](2);
        labels[0] = _spec("fresh");
        labels[1] = _spec("taken");

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.AlreadySlotted.selector, "taken"));
        namespace.slotLabels(labels);

        assertEq(namespace.slottedCount(), 1, "the first one did not land either");
    }

    function test_OnlyTheOwnerMayBatchSlot() public {
        SlotNamespaceCuration.LabelSpec[] memory labels = new SlotNamespaceCuration.LabelSpec[](1);
        labels[0] = _spec("mine");

        vm.prank(alice);
        vm.expectRevert();
        namespace.slotLabels(labels);
    }

    /// @notice An occupant's whole payload in one signature.
    function test_SetTextsWritesSeveralRecordsForTheOccupant() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        string[] memory keys = new string[](3);
        string[] memory values = new string[](3);
        (keys[0], values[0]) = ("avatar", "https://example.com/a.png");
        (keys[1], values[1]) = ("url", "https://example.com");
        (keys[2], values[2]) = ("com.twitter", "https://twitter.com/example");

        vm.prank(alice);
        namespace.setTexts(_node("alpha"), keys, values);

        assertEq(namespace.textOf(_node("alpha"), "avatar"), "https://example.com/a.png");
        assertEq(namespace.textOf(_node("alpha"), "url"), "https://example.com");
        assertEq(namespace.textOf(_node("alpha"), "com.twitter"), "https://twitter.com/example");
    }

    /// @notice The batch is gated exactly as the single write is.
    function test_SetTextsIsStillOnlyForTheOccupant() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        string[] memory keys = new string[](1);
        string[] memory values = new string[](1);
        (keys[0], values[0]) = ("avatar", "not mine");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.NotOccupant.selector, bob, alice));
        namespace.setTexts(_node("alpha"), keys, values);
    }

    function test_MismatchedRecordArraysRevert() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        string[] memory keys = new string[](2);
        string[] memory values = new string[](1);

        vm.prank(alice);
        vm.expectRevert(SlotNamespaceBase.LengthMismatch.selector);
        namespace.setTexts(_node("alpha"), keys, values);
    }

    /// @notice The namespace's whole profile in one signature.
    function test_SetParentTextsWritesTheWholeProfile() public {
        string[] memory keys = new string[](4);
        string[] memory values = new string[](4);
        (keys[0], values[0]) = ("avatar", "https://example.com/pfp.png");
        (keys[1], values[1]) = ("header", "https://example.com/banner.png");
        (keys[2], values[2]) = ("description", "A namespace.");
        (keys[3], values[3]) = ("url", "https://example.com");

        vm.prank(owner);
        namespace.setParentTexts(keys, values);

        assertEq(namespace.textOf(PARENT_NODE, "avatar"), "https://example.com/pfp.png");
        assertEq(namespace.textOf(PARENT_NODE, "url"), "https://example.com");
    }

    /**
     * @notice Mixed batches, which an array cannot express.
     *
     * @dev `multicall` delegatecalls into this contract, which PRESERVES
     *      `msg.sender` — so `onlyOwner` still applies to every inner call and
     *      this grants nobody anything they did not already have. That is the
     *      whole reason OpenZeppelin's version is safe to inherit here.
     */
    function test_MulticallBatchesLabelsAndProfileTogether() public {
        SlotNamespaceCuration.LabelSpec[] memory labels = new SlotNamespaceCuration.LabelSpec[](1);
        labels[0] = _spec("gm");

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(SlotNamespaceCuration.slotLabels, (labels));
        calls[1] = abi.encodeCall(namespace.setParentText, ("description", "A namespace."));

        vm.prank(owner);
        namespace.multicall(calls);

        assertEq(namespace.slottedCount(), 1);
        assertEq(namespace.textOf(PARENT_NODE, "description"), "A namespace.");
    }

    /// @notice And a multicall confers no authority the caller lacked.
    function test_MulticallDoesNotEscapeOwnership() public {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(namespace.setParentText, ("description", "not mine"));

        vm.prank(alice);
        vm.expectRevert();
        namespace.multicall(calls);
    }
}
