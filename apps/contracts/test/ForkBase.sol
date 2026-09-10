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
import {IEthRegistrar, IMintableERC20, IPermissionedRegistry, IVerifiableFactory} from "../src/interfaces/IENSv2.sol";
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

        (address ns, address reg) = _open("slotsdemo.eth", _noLabels());
        namespace = SlotNamespace(payable(ns));
        registry = IPermissionedRegistry(reg);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    /// @dev Exactly what `script/protocol/Deploy.s.sol` does, in the same order.
    /**
     * @dev Make the test accounts the plain EOAs they look like.
     *
     * `makeAddr` picks a deterministic address, and on a Sepolia FORK that
     * address is a real account with real state — several of these carry an
     * EIP-7702 delegation, which is 23 bytes of code. ENSv2 names are ERC1155,
     * so a mint runs the acceptance check against anything with code, the
     * delegate does not implement `onERC1155Received`, and registering a parent
     * reverts with no message worth reading.
     *
     * `scripts/seed.sh` already does exactly this to anvil's own accounts, for
     * exactly this reason. Fork-only, and invisible to anything but this test.
     */
    function _unwrapAccounts() internal {
        vm.etch(owner, "");
        vm.etch(alice, "");
        vm.etch(bob, "");
        vm.etch(recipient, "");
        vm.etch(admin, "");
    }

    function _deployStack() internal {
        _unwrapAccounts();
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
                            SepoliaAddresses.ENS_USER_REGISTRY_IMPL,
                            IPermissionedRegistry(SepoliaAddresses.ENS_ETH_REGISTRY),
                            SepoliaAddresses.MINIMUM_TENURE_HOOK
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

    /**
     * @dev Register the parent to `owner` if nobody holds it yet.
     *
     * A namespace derives its owner from the `.eth` registry, so a test that
     * opens one under a name nobody has registered is refused — correctly, and
     * that is its own test. Every OTHER test wants the ordinary case, so this
     * makes the ordinary case true rather than mocking `ownerOf` to pretend it
     * is. The whole point of forking is that these are the real contracts.
     *
     * Commit-reveal, exactly as `scripts/seed.sh` drives it: price it, mint and
     * approve the registrar's token, commit, jump the minimum age, register.
     * `subregistry` is zero here — the namespace's registry does not exist
     * until `open` runs, and resolution through the parent is not what these
     * tests are about.
     */
    function _ownParent(string memory parentName) internal {
        bytes32 labelhash = _labelhashOf(parentName);
        IPermissionedRegistry ethRegistry = IPermissionedRegistry(SepoliaAddresses.ENS_ETH_REGISTRY);
        if (ethRegistry.ownerOf(ethRegistry.getTokenId(uint256(labelhash))) != address(0)) {
            return;
        }

        IEthRegistrar registrar = IEthRegistrar(SepoliaAddresses.ENS_ETH_REGISTRAR);
        string memory label = _labelOf(parentName);
        uint64 duration = 365 days;
        bytes32 secret = keccak256(abi.encodePacked("nameslots-test-", parentName));

        (uint256 base, uint256 premium) =
            registrar.getRegisterPrice(label, duration, SepoliaAddresses.ENS_MOCK_USDC);
        uint256 total = base + premium;

        vm.startPrank(owner);
        IMintableERC20(SepoliaAddresses.ENS_MOCK_USDC).mint(owner, total);
        IMintableERC20(SepoliaAddresses.ENS_MOCK_USDC).approve(address(registrar), total);
        registrar.commit(
            registrar.makeCommitment(label, owner, secret, address(0), address(0), duration, bytes32(0))
        );
        vm.stopPrank();

        vm.warp(block.timestamp + registrar.MIN_COMMITMENT_AGE() + 1);

        vm.prank(owner);
        registrar.register(
            label, owner, secret, address(0), address(0), duration, SepoliaAddresses.ENS_MOCK_USDC, bytes32(0)
        );
    }

    /// @dev The label of a `<label>.eth` name, as a string.
    function _labelOf(string memory parentName) internal pure returns (string memory) {
        bytes memory b = bytes(parentName);
        uint256 dot = b.length;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] == ".") { dot = i; break; }
        }
        bytes memory label = new bytes(dot);
        for (uint256 i; i < dot; ++i) label[i] = b[i];
        return string(label);
    }

    function _open(string memory parentName, SlotNamespaceCuration.LabelSpec[] memory labels)
        internal
        returns (address ns, address reg)
    {
        _ownParent(parentName);
        return factory.open(
            SlotNamespaceFactory.OpenParams({
                registry: IPermissionedRegistry(address(0)),
                parentName: parentName,
                // Native, so the tests exercise the payout path with the gas
                // cap on it rather than the easier ERC20 one.
                currency: IERC20(address(0)),
                taxBps: TAX_BPS,
                minTenureSeconds: 0,
                labels: labels
            })
        );
    }

    function _noLabels() internal pure returns (SlotNamespaceCuration.LabelSpec[] memory) {
        return new SlotNamespaceCuration.LabelSpec[](0);
    }

    function _spec(string memory label) internal pure returns (SlotNamespaceCuration.LabelSpec memory) {
        return SlotNamespaceCuration.LabelSpec({
            label: label, hook: address(0), hookData: bytes32(0), taxBps: 0, permanent: false
        });
    }

    /// @dev `keccak(label)` for a `<label>.eth` name — how the `.eth` registry
    ///      keys it, and what the namespace derives its owner from.
    function _labelhashOf(string memory parentName) internal pure returns (bytes32) {
        return keccak256(bytes(_labelOf(parentName)));
    }

    function _slot(string memory label, address hook, bool permanent) internal returns (address slot, uint256 tokenId) {
        return _slot(label, hook, permanent, 0);
    }

    function _slot(string memory label, address hook, bool permanent, uint256 taxBps)
        internal
        returns (address slot, uint256 tokenId)
    {
        vm.prank(owner);
        return namespace.slotLabel(label, hook, bytes32(0), taxBps, permanent);
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

    /// @dev `alpha.slotsdemo.eth` → `\x05alpha\x09slotsdemo\x03eth\x00`
    function _dnsEncode(string memory a, string memory b, string memory c) internal pure returns (bytes memory) {
        return
            abi.encodePacked(uint8(bytes(a).length), a, uint8(bytes(b).length), b, uint8(bytes(c).length), c, uint8(0));
    }

    /// @dev `slotsdemo.eth` → `\x09slotsdemo\x03eth\x00`
    function _dnsEncode(string memory a, string memory b) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(a).length), a, uint8(bytes(b).length), b, uint8(0));
    }
}
