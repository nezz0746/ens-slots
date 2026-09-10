// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ForkBase} from "./ForkBase.sol";
import {SlotNamespaceBase} from "../src/namespace/SlotNamespaceBase.sol";
import {SlotNamespaceFactory} from "../src/SlotNamespaceFactory.sol";
import {IPermissionedRegistry} from "../src/interfaces/IENSv2.sol";
import {ISlot} from "../src/interfaces/ISlots.sol";
import {SepoliaAddresses} from "../src/Addresses.sol";

/**
 * @title TermsTest
 * @notice Who a namespace answers to, and what they may change about it.
 *
 * @dev Three things are under test here and they are one idea: authority,
 *      income and terms all belong to the parent NAME rather than to whoever
 *      happened to be holding it the day the namespace opened.
 */
contract TermsTest is ForkBase {
    // ─── authority follows the name ─────────────────────────────────────────

    /// @notice The owner is not stored. It is whoever the `.eth` registry says
    ///         holds the parent, asked at the moment of the question.
    function test_TheOwnerIsWhoeverHoldsTheParentName() public view {
        assertEq(namespace.owner(), owner, "the account that registered it");
    }

    /**
     * @notice Move the name, and the namespace moves with it.
     *
     * This is the whole point. A stored owner would leave the market running
     * under a name its new holder cannot touch.
     */
    function test_SellingTheNameHandsOverTheNamespace() public {
        IPermissionedRegistry ethRegistry = IPermissionedRegistry(SepoliaAddresses.ENS_ETH_REGISTRY);
        uint256 tokenId = ethRegistry.getTokenId(uint256(namespace.parentLabelhash()));

        vm.etch(bob, "");
        vm.prank(owner);
        IERC1155(address(ethRegistry)).safeTransferFrom(owner, bob, tokenId, 1, "");

        assertEq(namespace.owner(), bob, "the namespace answers to the buyer now");

        // And the authority is real, not cosmetic.
        vm.prank(bob);
        namespace.slotLabel("bobs", address(0), bytes32(0), 0, false);

        vm.prank(owner);
        vm.expectRevert();
        namespace.slotLabel("sellers", address(0), bytes32(0), 0, false);
    }

    /// @notice Ownership is not a thing you hand over here. The name is.
    function test_OwnershipCannotBeTransferredOrRenounced() public {
        vm.prank(owner);
        vm.expectRevert(SlotNamespaceBase.OwnershipFollowsTheName.selector);
        namespace.transferOwnership(bob);

        vm.prank(owner);
        vm.expectRevert(SlotNamespaceBase.OwnershipFollowsTheName.selector);
        namespace.renounceOwnership();
    }

    /**
     * @notice A labelhash that does not belong to the node is refused.
     *
     * Both names are OWNED, so the factory's "does anybody hold this?" check
     * passes and the question reaches the namespace — which is the guard under
     * test. Pointing a namespace at a node while claiming a different name's
     * labelhash would give it somebody else's owner.
     */
    function test_AMismatchedLabelhashIsRefused() public {
        _ownParent("honest.eth");
        _ownParent("otherone.eth");

        vm.expectRevert(SlotNamespaceBase.LabelhashMismatch.selector);
        factory.open(
            SlotNamespaceFactory.OpenParams({
                registry: IPermissionedRegistry(address(0)),
                parentNode: _ethNode("honest"),
                parentName: "honest.eth",
                parentLabelhash: keccak256("otherone"),
                terms: _terms(),
                labels: _noLabels()
            })
        );
    }

    // ─── terms, per label and changeable ────────────────────────────────────

    /// @notice A label may be opened at its own rate. Zero inherits.
    function test_ALabelCanCarryItsOwnTaxRate() public {
        (address dear,) = _slot("dear", address(0), false, 2_000);
        (address plain,) = _slot("plain", address(0), false, 0);

        assertEq(ISlot(dear).taxBps(), 2_000, "its own rate");
        assertEq(ISlot(plain).taxBps(), TAX_BPS, "the namespace's");
    }

    /// @notice The namespace is the slot's manager, so a change goes through it
    ///         and nowhere else.
    function test_OnlyTheOwnerMayProposeTerms() public {
        _slot("alpha", address(0), false);

        vm.prank(alice);
        vm.expectRevert();
        namespace.proposeLabelTerms("alpha", 1_000, address(0), bytes32(0), true, false);

        vm.prank(owner);
        namespace.proposeLabelTerms("alpha", 1_000, address(0), bytes32(0), true, false);
    }

    /**
     * @notice A queued change does NOT touch the sitting occupant.
     *
     * The slot ripens a proposal and applies it at the next occupancy change,
     * which is what makes an owner-managed market safe to hold a name in: the
     * rate you agreed to is the rate you keep until you leave.
     */
    function test_AProposalLeavesTheSittingOccupantAlone() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(owner);
        namespace.proposeLabelTerms("alpha", 9_000, address(0), bytes32(0), true, false);

        assertEq(ISlot(slot).taxBps(), TAX_BPS, "alice still pays what she agreed to");
        assertEq(ISlot(slot).occupant(), alice, "and still holds it");
    }

    /// @notice And it can be called off before it lands.
    function test_AProposalCanBeCancelled() public {
        _slot("alpha", address(0), false);

        vm.startPrank(owner);
        namespace.proposeLabelTerms("alpha", 1_000, address(0), bytes32(0), true, false);
        namespace.cancelLabelTerms("alpha", true, false);
        vm.stopPrank();
    }

    // ─── income follows the name too ────────────────────────────────────────

    /// @notice Tax is paid to the namespace, and the namespace pays the current
    ///         owner — not the one who opened it.
    function test_TaxReachesWhoeverHoldsTheNameNow() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        skip(30 days);
        ISlot(slot).collect();

        uint256 held = address(namespace).balance;
        assertGt(held, 0, "the namespace collected it");

        uint256 before = owner.balance;
        namespace.withdraw();
        assertEq(owner.balance, before + held, "and paid the owner");
    }

    /// @notice Anyone may trigger the payment, because it can only ever pay the
    ///         owner. Somebody else pressing the button is a favour.
    function test_AnybodyMayTriggerTheWithdrawal() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);
        skip(30 days);
        ISlot(slot).collect();

        uint256 before = owner.balance;
        vm.prank(bob);
        namespace.withdraw();
        assertGt(owner.balance, before, "still went to the owner");
    }
}

/// @dev Minimal ERC1155 transfer surface — ENSv2 names are ERC1155 tokens.
interface IERC1155 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
}
