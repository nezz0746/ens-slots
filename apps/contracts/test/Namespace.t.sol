// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SlotNamespaceBase} from "../src/namespace/SlotNamespaceBase.sol";
import {IPermissionedRegistry} from "../src/interfaces/IENSv2.sol";
import {ISlot} from "../src/interfaces/ISlots.sol";
import {ForkBase} from "./ForkBase.sol";

/**
 * @notice What a namespace does: open labels, hand them over, hold records.
 *
 * @dev The behavioural suite, unchanged in substance by the move to proxies —
 *      which is the point. Every assertion here passed against the old
 *      constructor-built contract and passes against a beacon proxy opened by
 *      the factory, because none of it was ever about how the thing was
 *      deployed.
 */
contract NamespaceTest is ForkBase {
    // ── slotting ────────────────────────────────────────────────────────────

    /// @notice One call registers the name and creates the slot behind it.
    function test_SlottingALabelRegistersItAndCreatesASlot() public {
        (address slot,) = _slot("alpha", address(0), false);

        IPermissionedRegistry.State memory state = registry.getState(uint256(keccak256("alpha")));
        assertEq(uint8(state.status), uint8(IPermissionedRegistry.Status.REGISTERED), "the label is registered");
        assertEq(state.latestOwner, address(namespace), "and the namespace holds it, not any occupant");
        assertEq(state.expiry, type(uint64).max, "permanently: the tax is the only clock");
        assertEq(registry.getResolver("alpha"), address(resolver), "pointed at our resolver");

        assertTrue(slot.code.length > 0, "a real slot was created");
        assertEq(ISlot(slot).taxBps(), TAX_BPS, "on the namespace's terms");
    }

    /// @notice A vacant name resolves to nobody rather than to the owner.
    function test_AVacantNameGoesDark() public {
        _slot("alpha", address(0), false);
        assertEq(namespace.addrOf(_node("alpha")), address(0));
    }

    function test_TheSameLabelCannotBeSlottedTwice() public {
        _slot("alpha", address(0), false);
        vm.prank(owner);
        vm.expectRevert();
        namespace.slotLabel("alpha", address(0), bytes32(0), 0, false);
    }

    function test_OnlyTheOwnerMaySlot() public {
        vm.prank(alice);
        vm.expectRevert();
        namespace.slotLabel("alpha", address(0), bytes32(0), 0, false);
    }

    // ── the name follows the slot ───────────────────────────────────────────

    /// @notice The whole premise: buy the slot, hold the name.
    function test_BuyingTheSlotMovesTheName() public {
        (address slot,) = _slot("alpha", address(0), false);
        bytes32 node = _node("alpha");

        _take(slot, alice, 1 ether);
        assertEq(namespace.addrOf(node), alice, "alice holds it");

        _take(slot, bob, 2 ether);
        assertEq(namespace.addrOf(node), bob, "and then bob does");
    }

    /// @notice Releasing vacates the name. It does NOT unregister it.
    function test_ReleaseVacatesButKeepsTheRegistration() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(alice);
        ISlot(slot).release();

        assertEq(namespace.addrOf(_node("alpha")), address(0), "dark");
        assertEq(
            uint8(registry.getStatus(uint256(keccak256("alpha")))),
            uint8(IPermissionedRegistry.Status.REGISTERED),
            "but still ours: the name is bound to the slot, not the occupant"
        );
    }

    // ── records ─────────────────────────────────────────────────────────────

    function test_TheOccupantOwnsTheRecords() public {
        (address slot,) = _slot("alpha", address(0), false);
        bytes32 node = _node("alpha");
        _take(slot, alice, 1 ether);

        vm.prank(alice);
        namespace.setText(node, "avatar", "https://example.com/a.png");
        assertEq(namespace.textOf(node, "avatar"), "https://example.com/a.png");

        vm.prank(bob);
        vm.expectRevert();
        namespace.setText(node, "avatar", "https://example.com/b.png");
    }

    /**
     * @notice The load-bearing one.
     *
     * @dev Records must be scoped to the TENANCY, not to the person. Keying
     *      them by occupant address clears them when somebody else takes over
     *      and then resurrects them if the original occupant ever comes back —
     *      a stale avatar reappearing on a name months later, with nothing in
     *      the interim to explain it. `tenureId` is what makes the second
     *      tenancy a different generation from the first.
     */
    function test_RecordsDoNotComeBackWhenAnOccupantDoes() public {
        (address slot,) = _slot("alpha", address(0), false);
        bytes32 node = _node("alpha");

        _take(slot, alice, 1 ether);
        vm.prank(alice);
        namespace.setText(node, "avatar", "alice.png");
        assertEq(namespace.textOf(node, "avatar"), "alice.png");

        _take(slot, bob, 2 ether);
        assertEq(namespace.textOf(node, "avatar"), "", "cleared for bob");

        _take(slot, alice, 4 ether);
        assertEq(namespace.textOf(node, "avatar"), "", "and STILL cleared when alice returns");
    }

    // ── the parent's own records ────────────────────────────────────────────

    /**
     * @notice The namespace describes itself, under ordinary ENS keys.
     *
     * @dev The parent name has no slot, so it has no occupant to authorise a
     *      write and no `tenureId` to key one by. Its records belong to the
     *      party that opened the namespace, and they are read back through the
     *      same {SlotNamespace.textOf} every subname uses — one entry point,
     *      because the resolver has only one.
     */
    function test_TheParentNameCarriesItsOwnRecords() public {
        vm.startPrank(owner);
        namespace.setParentText("avatar", "https://example.com/pfp.png");
        namespace.setParentText("header", "https://example.com/banner.png");
        namespace.setParentText("description", "A namespace.");
        namespace.setParentText("url", "https://example.com");
        vm.stopPrank();

        assertEq(namespace.textOf(PARENT_NODE, "avatar"), "https://example.com/pfp.png");
        assertEq(namespace.textOf(PARENT_NODE, "header"), "https://example.com/banner.png");
        assertEq(namespace.textOf(PARENT_NODE, "description"), "A namespace.");
        assertEq(namespace.textOf(PARENT_NODE, "url"), "https://example.com");

        // The convenience view and the node-addressed one must not disagree.
        assertEq(namespace.parentTextOf("url"), namespace.textOf(PARENT_NODE, "url"));
    }

    /// @notice An occupant of a subname has no say over the parent's profile.
    function test_OnlyTheOwnerWritesTheParentRecords() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert();
        namespace.setParentText("avatar", "https://example.com/hijack.png");
    }

    /**
     * @notice The parent's records are NOT tenancy-scoped, and must not be.
     *
     * @dev The inverse of {test_RecordsDoNotComeBackWhenAnOccupantDoes}. A
     *      subname's records clear on turnover because they belonged to a
     *      tenancy that ended. The parent name was never for sale, so nothing
     *      about it ended, and a namespace whose avatar vanished because
     *      somebody outbid somebody else one level down would be broken.
     */
    function test_TheParentRecordsOutliveATurnoverBelow() public {
        vm.prank(owner);
        namespace.setParentText("avatar", "https://example.com/pfp.png");

        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);
        vm.prank(alice);
        namespace.setText(_node("alpha"), "avatar", "alice.png");

        _take(slot, bob, 2 ether);

        assertEq(namespace.textOf(_node("alpha"), "avatar"), "", "the subname's cleared");
        assertEq(namespace.textOf(PARENT_NODE, "avatar"), "https://example.com/pfp.png", "the parent's did not");
    }

    /// @notice Empty is how ENS spells deletion, so it has to actually clear.
    function test_AParentRecordIsClearedByWritingEmpty() public {
        vm.startPrank(owner);
        namespace.setParentText("url", "https://example.com");
        namespace.setParentText("url", "");
        vm.stopPrank();

        assertEq(namespace.textOf(PARENT_NODE, "url"), "");
    }

    // ── unslotting ──────────────────────────────────────────────────────────

    function test_AVacantLabelCanBeUnslotted() public {
        _slot("alpha", address(0), false);

        vm.prank(owner);
        namespace.unslotLabel("alpha");

        assertEq(
            uint8(registry.getStatus(uint256(keccak256("alpha")))),
            uint8(IPermissionedRegistry.Status.AVAILABLE),
            "back on the market"
        );
        assertEq(namespace.slotOfNode(_node("alpha")), address(0));
    }

    /// @notice Never out from under somebody who is paying for it.
    function test_AnOccupiedLabelCannotBeUnslotted() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.SlotOccupied.selector, alice));
        namespace.unslotLabel("alpha");
    }

    /// @notice And never at all, once promised.
    function test_APermanentLabelCanNeverBeUnslotted() public {
        _slot("forever", address(0), true);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.PermanentlySlotted.selector, "forever"));
        namespace.unslotLabel("forever");
    }

    // ── listing, which is all the client has ────────────────────────────────

    /// @notice Without this a home page cannot list its own contents.
    function test_TheNamespaceListsWhatItHasSlotted() public {
        _slot("alpha", address(0), false);
        _slot("partner", address(0), false);

        (bytes32[] memory nodes, string[] memory labels, address[] memory slots) = namespace.listing();

        assertEq(nodes.length, 2);
        assertEq(labels[0], "alpha");
        assertEq(labels[1], "partner");
        assertEq(slots[0], namespace.slotOfNode(_node("alpha")));
        assertEq(namespace.parentName(), "slotsdemo.eth", "the human name, since a node is a hash");
    }

    /// @notice Unslotting swaps in the last entry rather than leaving a hole.
    function test_UnslottingLeavesTheListingDense() public {
        _slot("a", address(0), false);
        _slot("b", address(0), false);
        _slot("c", address(0), false);

        vm.prank(owner);
        namespace.unslotLabel("a");

        (, string[] memory labels,) = namespace.listing();
        assertEq(labels.length, 2);
        assertEq(labels[0], "c", "the last one moved into the gap");
        assertEq(labels[1], "b");
    }

    /// @notice Records are the occupant's, and nobody else's — not even the owner.
    function test_OnlyTheOccupantWritesRecords() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.NotOccupant.selector, owner, alice));
        namespace.setText(_node("alpha"), "url", "not yours");
    }
}
