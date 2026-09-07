// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SepoliaAddresses} from "../src/Addresses.sol";
import {SlotNamespace} from "../src/SlotNamespace.sol";
import {SlotNamespaceResolver} from "../src/SlotNamespaceResolver.sol";
import {
    IPermissionedRegistry,
    IRegistry,
    IUserRegistry,
    IVerifiableFactory,
    RegistryRoles
} from "../src/interfaces/IENSv2.sol";
import {ISlot, ISlotFactory, SlotInit} from "../src/interfaces/ISlots.sol";

/**
 * @notice The whole thing, against the real contracts on Sepolia.
 *
 * @dev Every external signature this project declares by hand — the ENSv2
 *      registry, the verifiable factory, the 0xSlots factory and slot — is
 *      exercised here against a live deployment. That is the point of running
 *      on a fork rather than against mocks: a mock would agree with whatever
 *      interface it was written from, including a wrong one, and the ENS docs
 *      say these interfaces are not final. Here a drifted signature shows up
 *      as a failed call.
 *
 *      A real UserRegistry is deployed through the real VerifiableFactory in
 *      `setUp`, which is also how it would be done in production. The parent
 *      name is NOT wired up: pointing a `.eth` name at this registry requires
 *      owning one, and none of the behaviour under test depends on it. What
 *      the hierarchy adds is resolution through the Universal Resolver, which
 *      is a separate concern from whether the namespace works.
 *
 *      Run with:  forge test --fork-url $SEPOLIA_RPC_URL
 */
contract ForkSepoliaTest is Test {
    IPermissionedRegistry registry;
    SlotNamespace namespace;
    SlotNamespaceResolver resolver;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address recipient = makeAddr("recipient");

    /// @dev The parent this namespace pretends to sit under.
    bytes32 constant PARENT_NODE =
        keccak256(abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), keccak256("eth"))), keccak256("slotsdemo")));

    uint256 constant TAX_BPS = 500; // 5% per 30 days
    uint64 constant MIN_DEPOSIT_SECONDS = 7 days;

    function setUp() public {
        // Skips cleanly rather than failing when no endpoint is configured, so
        // `forge test` is still useful without one.
        try vm.envString("SEPOLIA_RPC_URL") returns (string memory url) {
            vm.createSelectFork(url);
        } catch {
            vm.skip(true);
        }

        // A real UserRegistry, deployed the way a name owner would deploy one.
        IUserRegistry.Grant[] memory grants = new IUserRegistry.Grant[](1);
        grants[0] = IUserRegistry.Grant({account: address(this), roleBitmap: RegistryRoles.ALL_ROLES});
        bytes memory init = abi.encodeCall(IUserRegistry.initialize, (grants));
        address proxy = IVerifiableFactory(SepoliaAddresses.ENS_VERIFIABLE_FACTORY)
            .deployProxy(SepoliaAddresses.ENS_USER_REGISTRY_IMPL, uint256(PARENT_NODE), init);
        registry = IPermissionedRegistry(proxy);

        namespace = new SlotNamespace(
            registry,
            ISlotFactory(SepoliaAddresses.SLOT_FACTORY),
            PARENT_NODE,
            SlotInit({
                recipient: recipient,
                currency: IERC20(address(0)), // native ETH
                manager: address(0),
                hook: address(0),
                hookData: bytes32(0),
                taxBps: TAX_BPS,
                minDepositSeconds: MIN_DEPOSIT_SECONDS,
                mutableTax: false,
                mutableHook: false
            }),
            owner
        );

        resolver = new SlotNamespaceResolver(namespace);

        // What the namespace needs, and nothing more. No ROLE_RENEW: names
        // here never expire, so that authority is never granted at all.
        registry.grantRootRoles(RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_UNREGISTER, address(namespace));

        vm.prank(owner);
        namespace.setResolver(address(resolver));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ── slotting ────────────────────────────────────────────────────────────

    /// @notice One call registers the name and creates the slot behind it.
    function test_SlottingALabelRegistersItAndCreatesASlot() public {
        (address slot,) = _slot("sponsor", address(0), false);

        IPermissionedRegistry.State memory state = registry.getState(uint256(keccak256("sponsor")));
        assertEq(uint8(state.status), uint8(IPermissionedRegistry.Status.REGISTERED), "the label is registered");
        assertEq(state.latestOwner, address(namespace), "and the namespace holds it, not any occupant");
        assertEq(state.expiry, type(uint64).max, "permanently: the tax is the only clock");
        assertEq(registry.getResolver("sponsor"), address(resolver), "pointed at our resolver");

        assertTrue(slot.code.length > 0, "a real slot was created");
        assertEq(ISlot(slot).taxBps(), TAX_BPS, "on the namespace's terms");
    }

    /// @notice A vacant name resolves to nobody rather than to the owner.
    function test_AVacantNameGoesDark() public {
        _slot("sponsor", address(0), false);
        assertEq(namespace.addrOf(_node("sponsor")), address(0));
    }

    function test_TheSameLabelCannotBeSlottedTwice() public {
        _slot("sponsor", address(0), false);
        vm.prank(owner);
        vm.expectRevert();
        namespace.slotLabel("sponsor", address(0), bytes32(0), false);
    }

    function test_OnlyTheOwnerMaySlot() public {
        vm.prank(alice);
        vm.expectRevert();
        namespace.slotLabel("sponsor", address(0), bytes32(0), false);
    }

    // ── the name follows the slot ───────────────────────────────────────────

    /// @notice The whole premise: buy the slot, hold the name.
    function test_BuyingTheSlotMovesTheName() public {
        (address slot,) = _slot("sponsor", address(0), false);
        bytes32 node = _node("sponsor");

        _take(slot, alice, 1 ether);
        assertEq(namespace.addrOf(node), alice, "alice holds it");

        _take(slot, bob, 2 ether);
        assertEq(namespace.addrOf(node), bob, "and then bob does");
    }

    /// @notice Releasing vacates the name. It does NOT unregister it.
    function test_ReleaseVacatesButKeepsTheRegistration() public {
        (address slot,) = _slot("sponsor", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(alice);
        ISlot(slot).release();

        assertEq(namespace.addrOf(_node("sponsor")), address(0), "dark");
        assertEq(
            uint8(registry.getStatus(uint256(keccak256("sponsor")))),
            uint8(IPermissionedRegistry.Status.REGISTERED),
            "but still ours: the name is bound to the slot, not the occupant"
        );
    }

    // ── records ─────────────────────────────────────────────────────────────

    function test_TheOccupantOwnsTheRecords() public {
        (address slot,) = _slot("sponsor", address(0), false);
        bytes32 node = _node("sponsor");
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
        (address slot,) = _slot("sponsor", address(0), false);
        bytes32 node = _node("sponsor");

        _take(slot, alice, 1 ether);
        vm.prank(alice);
        namespace.setText(node, "avatar", "alice.png");
        assertEq(namespace.textOf(node, "avatar"), "alice.png");

        _take(slot, bob, 2 ether);
        assertEq(namespace.textOf(node, "avatar"), "", "cleared for bob");

        _take(slot, alice, 4 ether);
        assertEq(namespace.textOf(node, "avatar"), "", "and STILL cleared when alice returns");
    }

    // ── unslotting ──────────────────────────────────────────────────────────

    function test_AVacantLabelCanBeUnslotted() public {
        _slot("sponsor", address(0), false);

        vm.prank(owner);
        namespace.unslotLabel("sponsor");

        assertEq(
            uint8(registry.getStatus(uint256(keccak256("sponsor")))),
            uint8(IPermissionedRegistry.Status.AVAILABLE),
            "back on the market"
        );
        assertEq(namespace.slotOfNode(_node("sponsor")), address(0));
    }

    /// @notice Never out from under somebody who is paying for it.
    function test_AnOccupiedLabelCannotBeUnslotted() public {
        (address slot,) = _slot("sponsor", address(0), false);
        _take(slot, alice, 1 ether);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespace.SlotOccupied.selector, alice));
        namespace.unslotLabel("sponsor");
    }

    /// @notice And never at all, once promised.
    function test_APermanentLabelCanNeverBeUnslotted() public {
        _slot("forever", address(0), true);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SlotNamespace.PermanentlySlotted.selector, "forever"));
        namespace.unslotLabel("forever");
    }

    // ── the ENS-facing surface ──────────────────────────────────────────────

    /// @notice What the Universal Resolver will actually call.
    function test_TheResolverAnswersTheExtendedProfile() public {
        (address slot,) = _slot("sponsor", address(0), false);
        _take(slot, alice, 1 ether);

        bytes memory dnsName = _dnsEncode("sponsor", "slotsdemo", "eth");

        bytes memory answer = resolver.resolve(dnsName, abi.encodeWithSelector(bytes4(0x3b3b57de), bytes32(0)));
        assertEq(abi.decode(answer, (address)), alice, "addr(bytes32)");

        vm.prank(alice);
        namespace.setText(_node("sponsor"), "url", "https://example.com");

        answer = resolver.resolve(dnsName, abi.encodeWithSelector(bytes4(0x59d1d43c), bytes32(0), "url"));
        assertEq(abi.decode(answer, (string)), "https://example.com", "text(bytes32,string)");
    }

    /// @dev Without this the Universal Resolver refuses a namespace resolver.
    function test_TheResolverDeclaresTheExtendedInterface() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    function _slot(string memory label, address hook, bool permanent) internal returns (address slot, uint256 tokenId) {
        vm.prank(owner);
        return namespace.slotLabel(label, hook, bytes32(0), permanent);
    }

    /// @dev Buy `slot` for `who` at `price`, funding the protocol's floor.
    function _take(address slot, address who, uint256 price) internal {
        uint256 dep = ISlot(slot).minDepositForBuy(price);
        uint256 owed = ISlot(slot).quoteBuy(who, dep);
        vm.prank(who);
        ISlot(slot).buy{value: owed}(who, price, dep, type(uint256).max);
    }

    function _node(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PARENT_NODE, keccak256(bytes(label))));
    }

    /// @dev `sponsor.slotsdemo.eth` → `\x07sponsor\x09slotsdemo\x03eth\x00`
    function _dnsEncode(string memory a, string memory b, string memory c) internal pure returns (bytes memory) {
        return
            abi.encodePacked(uint8(bytes(a).length), a, uint8(bytes(b).length), b, uint8(bytes(c).length), c, uint8(0));
    }
}
