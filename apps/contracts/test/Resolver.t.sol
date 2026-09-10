// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SlotNamespace} from "../src/SlotNamespace.sol";
import {SlotNamespaceResolver} from "../src/SlotNamespaceResolver.sol";
import {ForkBase} from "./ForkBase.sol";

/**
 * @notice One resolver, every namespace.
 *
 * @dev The resolver no longer holds a pointer to the namespace it serves; it
 *      finds one from the name, through the factory's index. These tests are
 *      what that claim rests on — in particular {test_OneResolverServesEveryNamespace},
 *      which is the whole reason the per-namespace resolver was worth removing.
 */
contract ResolverTest is ForkBase {
    // ── the ENS-facing surface ──────────────────────────────────────────────

    /// @notice What the Universal Resolver will actually call.
    function test_TheResolverAnswersTheExtendedProfile() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        bytes memory dnsName = _dnsEncode("alpha", "slotsdemo", "eth");

        bytes memory answer = resolver.resolve(dnsName, abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0)));
        assertEq(abi.decode(answer, (address)), alice, "addr(bytes32)");

        vm.prank(alice);
        namespace.setText(_node("alpha"), "url", "https://example.com");

        answer = resolver.resolve(dnsName, abi.encodeWithSelector(bytes4(0x59d1d43c), bytes32(0), "url"));
        assertEq(abi.decode(answer, (string)), "https://example.com", "text(bytes32,string)");
    }

    /// @dev Without this the Universal Resolver refuses a namespace resolver.
    function test_TheResolverDeclaresTheExtendedInterface() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
    }

    /**
     * @notice The parent name resolves through the same resolver its subnames do.
     *
     * @dev The path a client actually takes: DNS-encoded name → namehash →
     *      `textOf`. Nothing here knows the parent is special, which is the
     *      test — the resolver derives a node and asks, and the namespace
     *      answers for whichever kind of node it turned out to be.
     */
    function test_TheResolverAnswersForTheParentName() public {
        vm.prank(owner);
        namespace.setParentText("description", "The namespace itself.");

        bytes memory answer = resolver.resolve(
            _dnsEncode("slotsdemo", "eth"), abi.encodeWithSelector(bytes4(0x59d1d43c), bytes32(0), "description")
        );
        assertEq(abi.decode(answer, (string)), "The namespace itself.");

        // The parent is not a slot, so it has no occupant. Zero is the honest
        // answer rather than a stand-in owner with no claim to the name.
        answer =
            resolver.resolve(_dnsEncode("slotsdemo", "eth"), abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0)));
        assertEq(abi.decode(answer, (address)), address(0));
    }

    /**
     * @notice The claim the shared resolver is built on.
     *
     * @dev Two namespaces under different parents, one resolver instance, and
     *      each name answered from the right one. The old design deployed a
     *      resolver per namespace precisely because it could not do this: its
     *      pointer was an immutable set at construction, so the only way to
     *      serve a second parent was a second contract.
     *
     *      What made it possible is that a DNS-encoded name carries its own
     *      hierarchy. The resolver hashes the whole name, asks the factory, and
     *      on a miss hashes it again from the second label — so the parent it
     *      belongs to is derived rather than remembered.
     */
    function test_OneResolverServesEveryNamespace() public {
        bytes32 otherNode = _ethNode("secondname");
        (address other,) = _open(otherNode, "secondname.eth", _noLabels());

        (address slotA,) = _slot("alpha", address(0), false);
        _take(slotA, alice, 1 ether);

        vm.prank(owner);
        (address slotB,) =
            SlotNamespace(payable(other)).slotLabel("alpha", address(0), bytes32(0), 0, false);
        _take(slotB, bob, 1 ether);

        assertEq(_addr(_dnsEncode("alpha", "slotsdemo", "eth")), alice, "the first namespace's name");
        assertEq(_addr(_dnsEncode("alpha", "secondname", "eth")), bob, "the second one's, same resolver");
        assertEq(address(resolver.factory()), address(factory), "and there is only one of it");
    }

    /// @notice A name under no namespace is refused rather than answered empty.
    /// @dev An empty answer would be indistinguishable from a vacant slot, and
    ///      the two need different explanations to whoever is looking.
    function test_ANameUnderNoNamespaceIsUnknown() public {
        vm.expectRevert(SlotNamespaceResolver.UnknownName.selector);
        resolver.resolve(_dnsEncode("nothing", "atall", "eth"), abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0)));
    }

    /// @notice Deeper than one label finds nothing — this system registers
    ///         direct subnames only, so anything else is a name we never made.
    function test_ADeeperNameIsUnknown() public {
        bytes memory name =
            abi.encodePacked(uint8(1), "a", uint8(1), "b", uint8(9), "slotsdemo", uint8(3), "eth", uint8(0));
        vm.expectRevert(SlotNamespaceResolver.UnknownName.selector);
        resolver.resolve(name, abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0)));
    }

    /// @notice `find` says which namespace answered, for debugging a dead name.
    function test_FindReportsTheNamespaceAndNode() public {
        _slot("alpha", address(0), false);

        (address ns, bytes32 node) = resolver.find(_dnsEncode("alpha", "slotsdemo", "eth"));
        assertEq(ns, address(namespace));
        assertEq(node, _node("alpha"));

        (ns, node) = resolver.find(_dnsEncode("slotsdemo", "eth"));
        assertEq(ns, address(namespace), "the parent name resolves to the same namespace");
        assertEq(node, PARENT_NODE);
    }

    /// @notice An unsupported profile reverts the way ENS's own resolvers do.
    function test_AnUnsupportedProfileReverts() public {
        _slot("alpha", address(0), false);
        bytes4 contenthash = 0xbc1c58d1;

        vm.expectRevert(abi.encodeWithSelector(SlotNamespaceResolver.UnsupportedResolverProfile.selector, contenthash));
        resolver.resolve(_dnsEncode("alpha", "slotsdemo", "eth"), abi.encodeWithSelector(contenthash, bytes32(0)));
    }

    /// @notice ENSIP-9, which is what viem asks for by default.
    function test_TheCoinTypeProfileAnswersForEthAndNothingElse() public {
        (address slot,) = _slot("alpha", address(0), false);
        _take(slot, alice, 1 ether);

        bytes memory name = _dnsEncode("alpha", "slotsdemo", "eth");

        bytes memory eth = resolver.resolve(name, abi.encodeWithSelector(bytes4(0xf1cb7e06), bytes32(0), uint256(60)));
        assertEq(abi.decode(eth, (bytes)), abi.encodePacked(alice), "coin type 60 is the occupant");

        bytes memory btc = resolver.resolve(name, abi.encodeWithSelector(bytes4(0xf1cb7e06), bytes32(0), uint256(0)));
        assertEq(abi.decode(btc, (bytes)).length, 0, "anything else is empty, not an error");
    }

    function _addr(bytes memory name) internal view returns (address) {
        return abi.decode(resolver.resolve(name, abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0))), (address));
    }
}
