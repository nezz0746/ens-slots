// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SepoliaAddresses} from "../src/Addresses.sol";
import {SlotNamespace} from "../src/SlotNamespace.sol";
import {SlotNamespaceResolver} from "../src/SlotNamespaceResolver.sol";
import {IPermissionedRegistry, IUserRegistry, IVerifiableFactory, RegistryRoles} from "../src/interfaces/IENSv2.sol";
import {ISlotFactory, SlotInit} from "../src/interfaces/ISlots.sol";

/**
 * @notice Stand a namespace up on Sepolia.
 *
 * @dev Four steps, in this order, and the third is the one people forget:
 *
 *        1. Deploy a UserRegistry for the parent name (or reuse one).
 *        2. Deploy {SlotNamespace} and {SlotNamespaceResolver}.
 *        3. Grant the namespace `ROLE_REGISTRAR | ROLE_UNREGISTER` on the
 *           registry's ROOT_RESOURCE. Without it every {slotLabel} reverts.
 *        4. Point the PARENT NAME at the registry with `setSubregistry` on the
 *           `.eth` registry. Until that happens names register and mint fine
 *           but resolve to nothing, because the Universal Resolver walks down
 *           from the root and never reaches them.
 *
 *      Step 4 is not scripted: it needs the parent name's owner, which is a
 *      key this script has no business holding. Run it yourself against
 *      {SepoliaAddresses.ENS_ETH_REGISTRY}.
 *
 *      forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
 */
contract Deploy is Script {
    function run() external {
        bytes32 parentNode = vm.envBytes32("PARENT_NODE");
        address owner = vm.envOr("NAMESPACE_OWNER", msg.sender);
        address recipient = vm.envOr("TAX_RECIPIENT", owner);
        uint256 taxBps = vm.envOr("TAX_BPS", uint256(500));
        uint256 minDeposit = vm.envOr("MIN_DEPOSIT_SECONDS", uint256(7 days));

        vm.startBroadcast();

        // 1. The registry, unless one was supplied.
        address registryAddr = vm.envOr("USER_REGISTRY", address(0));
        if (registryAddr == address(0)) {
            IUserRegistry.Grant[] memory grants = new IUserRegistry.Grant[](1);
            grants[0] = IUserRegistry.Grant({account: msg.sender, roleBitmap: RegistryRoles.ALL_ROLES});
            registryAddr = IVerifiableFactory(SepoliaAddresses.ENS_VERIFIABLE_FACTORY)
                .deployProxy(
                    SepoliaAddresses.ENS_USER_REGISTRY_IMPL,
                    uint256(parentNode),
                    abi.encodeCall(IUserRegistry.initialize, (grants))
                );
            console.log("UserRegistry     ", registryAddr);
        }
        IPermissionedRegistry registry = IPermissionedRegistry(registryAddr);

        // 2. The namespace and its resolver.
        SlotNamespace namespace = new SlotNamespace(
            registry,
            ISlotFactory(SepoliaAddresses.SLOT_FACTORY),
            parentNode,
            vm.envOr("PARENT_NAME", string("example.eth")),
            SlotInit({
                recipient: recipient,
                currency: IERC20(address(0)), // native ETH
                manager: address(0),
                hook: address(0),
                hookData: bytes32(0),
                taxBps: taxBps,
                minDepositSeconds: minDeposit,
                mutableTax: false,
                mutableHook: false
            }),
            owner
        );
        SlotNamespaceResolver resolver = new SlotNamespaceResolver(namespace);

        // 3. Exactly the two roles it needs. No ROLE_RENEW: these names never
        //    expire, so that authority is never granted at all.
        registry.grantRootRoles(RegistryRoles.ROLE_REGISTRAR | RegistryRoles.ROLE_UNREGISTER, address(namespace));

        vm.stopBroadcast();

        console.log("SlotNamespace    ", address(namespace));
        console.log("Resolver         ", address(resolver));
        console.log("");
        console.log("Still to do, from the parent name's owner:");
        console.log("  ethRegistry.setSubregistry(labelhash(parent), registry)");
        console.log("  namespace.setResolver(resolver)");
    }
}
