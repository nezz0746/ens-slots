// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
        namespace.slotLabel("bobs", TAX_BPS, 0, false);

        vm.prank(owner);
        vm.expectRevert();
        namespace.slotLabel("sellers", TAX_BPS, 0, false);
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
     * @notice A parent that is not a second-level `.eth` name is refused.
     *
     * The node derivation is only correct for one, and it is derived rather
     * than passed now — so this is the check that keeps the assumption true.
     * There is no longer a labelhash to disagree with anything.
     */
    function test_OnlySecondLevelEthNamesCanBeOpened() public {
        string[3] memory bad = ["l2beat", "l2beat.xyz", "sub.l2beat.eth"];

        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(SlotNamespaceFactory.NotASecondLevelEthName.selector);
            factory.open(
                SlotNamespaceFactory.OpenParams({
                    registry: IPermissionedRegistry(address(0)),
                    parentName: bad[i],
                    currency: IERC20(address(0)),
                    labels: _noLabels()
                })
            );
        }
    }

    // ─── terms, per label and changeable ────────────────────────────────────

    /// @notice Every label states its own rate. There is nothing to inherit.
    function test_EachLabelCarriesItsOwnTaxRate() public {
        (address dear,) = _slot("dear", address(0), false, 2_000);
        (address cheap,) = _slot("cheap", address(0), false, 250);

        assertEq(ISlot(dear).taxBps(), 2_000);
        assertEq(ISlot(cheap).taxBps(), 250);
    }

    /**
     * @notice A rate of zero is refused, and refused HERE.
     *
     * Zero used to mean "inherit the namespace's", which is why it is worth a
     * test of its own: the word that once meant absence now means an invalid
     * value, and the failure carries the label so it is obvious which of a
     * batch was wrong.
     */
    function test_ALabelCannotOpenWithoutARate() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.InvalidTax.selector, "free"));
        namespace.slotLabel("free", 0, 0, false);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceBase.InvalidTax.selector, "greedy"));
        namespace.slotLabel("greedy", 10_001, 0, false);
    }

    /// @notice A guaranteed run is per label too, and zero is a real answer.
    function test_EachLabelCarriesItsOwnGuaranteedRun() public {
        vm.startPrank(owner);
        (address safe,) = namespace.slotLabel("safe", TAX_BPS, 3 days, false);
        (address open_,) = namespace.slotLabel("openrun", TAX_BPS, 0, false);
        vm.stopPrank();

        assertEq(ISlot(safe).hookData(), bytes32(uint256(3 days)), "its own window");
        assertEq(ISlot(open_).hook(), address(0), "and none at all is allowed");
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

    /**
     * @notice A treasury with no owner to pay is not paid to nobody.
     *
     * @dev The bug this pins: `owner()` answers `address(0)` for an expired or
     *      unregistered parent name, a `call` with value to the zero address
     *      SUCCEEDS, and `withdraw` is ungated. So for the whole of a lapsed
     *      name's grace period anybody could send the namespace's entire native
     *      balance to nobody, collect a `Withdrawn` event saying it had been
     *      paid, and leave the owner to renew into an empty contract.
     *
     *      The name is expired here rather than mocked, because `ownerOf`
     *      returning zero for an expired name is the ENSv2 behaviour the whole
     *      derived-ownership design rests on — a mock would pass even if that
     *      stopped being true.
     */
    function test_WithdrawRefusesWhenTheParentNameHasNoOwner() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);
        skip(30 days);
        ISlot(slot).collect();

        uint256 held = address(namespace).balance;
        assertGt(held, 0, "there is something to lose");

        // Past the 365-day registration ForkBase buys, and past any grace.
        skip(400 days);
        assertEq(namespace.owner(), address(0), "the name has lapsed");

        vm.prank(bob);
        vm.expectRevert(SlotNamespaceBase.NoOwner.selector);
        namespace.withdraw();

        assertEq(address(namespace).balance, held, "and the money is still here");
    }
}

/// @dev Minimal ERC1155 transfer surface — ENSv2 names are ERC1155 tokens.
interface IERC1155 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
}
