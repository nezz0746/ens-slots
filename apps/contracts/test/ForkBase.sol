// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SepoliaAddresses} from "../src/Addresses.sol";
import {SlotNamespace} from "../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../src/SlotNamespaceFactory.sol";
import {SlotNamespaceResolver} from "../src/SlotNamespaceResolver.sol";
import {SlotNamespaceCuration} from "../src/namespace/SlotNamespaceCuration.sol";
import {IPermissionedRegistry, IVerifiableFactory} from "../src/interfaces/IENSv2.sol";
import {ISlot, ISlotFactory, SlotInit} from "../src/interfaces/ISlots.sol";

/**
 * @notice The whole stack, against the real contracts on Sepolia.
 *
 * @dev Every external signature this project declares by hand — the ENSv2
 *      registry, the verifiable factory, the 0xSlots factory and slot — is
 *      exercised against a live deployment. That is the point of running on a
 *      fork rather than against mocks: a mock would agree with whatever
 *      interface it was written from, including a wrong one, and the ENS docs
 *      say these interfaces are not final. Here a drifted signature shows up as
 *      a failed call.
 *
 *      ── Deployed the way production is ─────────────────────────────────────
 *
 *      Both proxies, the beacon, and a namespace opened through
 *      {SlotNamespaceFactory-open} — including the UserRegistry, which the
 *      factory now deploys through ENS's real VerifiableFactory. Constructing a
 *      `SlotNamespace` directly, as this suite used to, would test an object
 *      that no longer exists anywhere: the implementation is locked by
 *      `_disableInitializers` and every real namespace is a beacon proxy.
 *
 *      The parent name is NOT wired up. Pointing a `.eth` name at this registry
 *      requires owning one, and none of the behaviour under test depends on it
 *      — what the hierarchy adds is resolution through the Universal Resolver,
 *      which is a separate concern from whether the namespace works.
 *
 *      Run with:  forge test --fork-url $SEPOLIA_RPC_URL
 */
abstract contract ForkBase is Test {
    SlotNamespaceFactory factory;
    SlotNamespaceResolver resolver;
    IPermissionedRegistry registry;
    SlotNamespace namespace;

    address admin = makeAddr("admin");
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address recipient = makeAddr("recipient");

    /// @dev The parent this namespace sits under.
    bytes32 constant PARENT_NODE =
        keccak256(abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), keccak256("eth"))), keccak256("slotsdemo")));

    uint256 constant TAX_BPS = 500; // 5% per 30 days
    uint64 constant MIN_DEPOSIT_SECONDS = 7 days;

    function setUp() public virtual {
        // Skips cleanly rather than failing when no endpoint is configured, so
        // `forge test` is still useful without one.
        try vm.envString("SEPOLIA_RPC_URL") returns (string memory url) {
            vm.createSelectFork(url);
        } catch {
            vm.skip(true);
        }

        _deployStack();

        (address ns, address reg) = _open(PARENT_NODE, "slotsdemo.eth", _noLabels());
        namespace = SlotNamespace(ns);
        registry = IPermissionedRegistry(reg);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    /// @dev Exactly what `script/protocol/Deploy.s.sol` does, in the same order.
    function _deployStack() internal {
        SlotNamespace namespaceImpl = new SlotNamespace();

        factory = SlotNamespaceFactory(
            address(
                new ERC1967Proxy(
                    address(new SlotNamespaceFactory()),
                    abi.encodeCall(
                        SlotNamespaceFactory.initialize,
                        (
                            admin,
                            address(namespaceImpl),
                            ISlotFactory(SepoliaAddresses.SLOT_FACTORY),
                            IVerifiableFactory(SepoliaAddresses.ENS_VERIFIABLE_FACTORY),
                            SepoliaAddresses.ENS_USER_REGISTRY_IMPL
                        )
                    )
                )
            )
        );

        resolver = SlotNamespaceResolver(
            address(
                new ERC1967Proxy(
                    address(new SlotNamespaceResolver()),
                    abi.encodeCall(SlotNamespaceResolver.initialize, (admin, factory))
                )
            )
        );

        vm.prank(admin);
        factory.setResolver(address(resolver));
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    function _terms() internal view returns (SlotInit memory) {
        return SlotInit({
            recipient: recipient,
            currency: IERC20(address(0)), // native ETH
            manager: address(0),
            hook: address(0),
            hookData: bytes32(0),
            taxBps: TAX_BPS,
            minDepositSeconds: MIN_DEPOSIT_SECONDS,
            mutableTax: false,
            mutableHook: false
        });
    }

    function _open(bytes32 parentNode, string memory parentName, SlotNamespaceCuration.LabelSpec[] memory labels)
        internal
        returns (address ns, address reg)
    {
        return factory.open(
            SlotNamespaceFactory.OpenParams({
                registry: IPermissionedRegistry(address(0)),
                parentNode: parentNode,
                parentName: parentName,
                terms: _terms(),
                owner: owner,
                labels: labels
            })
        );
    }

    function _noLabels() internal pure returns (SlotNamespaceCuration.LabelSpec[] memory) {
        return new SlotNamespaceCuration.LabelSpec[](0);
    }

    function _spec(string memory label) internal pure returns (SlotNamespaceCuration.LabelSpec memory) {
        return SlotNamespaceCuration.LabelSpec({
            label: label, hook: address(0), hookData: bytes32(0), permanent: false
        });
    }

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

    function _ethNode(string memory label) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), keccak256("eth"))), keccak256(bytes(label)))
            );
    }

    /// @dev `sponsor.slotsdemo.eth` → `\x07sponsor\x09slotsdemo\x03eth\x00`
    function _dnsEncode(string memory a, string memory b, string memory c) internal pure returns (bytes memory) {
        return
            abi.encodePacked(uint8(bytes(a).length), a, uint8(bytes(b).length), b, uint8(bytes(c).length), c, uint8(0));
    }

    /// @dev `slotsdemo.eth` → `\x09slotsdemo\x03eth\x00`
    function _dnsEncode(string memory a, string memory b) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(a).length), a, uint8(bytes(b).length), b, uint8(0));
    }
}
