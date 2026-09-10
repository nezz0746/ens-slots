// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {IPermissionedRegistry} from "../../src/interfaces/IENSv2.sol";
import {SepoliaAddresses} from "../../src/Addresses.sol";
import {SlotNamespace} from "../../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../../src/SlotNamespaceFactory.sol";
import {SlotNamespaceResolver} from "../../src/SlotNamespaceResolver.sol";
import {IVerifiableFactory} from "../../src/interfaces/IENSv2.sol";
import {ISlotFactory} from "../../src/interfaces/ISlots.sol";
import {Config} from "./Config.s.sol";

/**
 * @title Deploy
 * @notice Stand the whole system up on a chain that has never had it.
 *
 *   pnpm protocol deploy            # local fork
 *   pnpm protocol deploy --sepolia
 *
 * @dev ── Five contracts, three of which are the same thing twice ──────────
 *
 *        SlotNamespace            beacon implementation, behind every namespace
 *        SlotNamespaceFactory     implementation + ERC-1967 proxy
 *        SlotNamespaceResolver    implementation + ERC-1967 proxy
 *
 *      The factory creates its own beacon inside `initialize`, so the beacon is
 *      never an argument anybody can get wrong and can never be an
 *      already-owned beacon pointed at this factory.
 *
 *      ── Why the resolver comes second ──────────────────────────────────────
 *
 *      The two point at each other: the resolver looks names up in the factory's
 *      index, and the factory hands its resolver to every namespace it opens.
 *      One of them has to exist first. The resolver is the one that can take its
 *      pointer at construction, so the factory takes its own afterwards, in the
 *      `setResolver` at the end. A factory with no resolver cannot open a
 *      namespace that works — {SlotNamespaceCuration-_slotOne} reverts
 *      `NoResolver` — so the failure mode of stopping halfway is loud.
 *
 *      ── Idempotence is NOT claimed ─────────────────────────────────────────
 *
 *      Run this twice and you get a second, unrelated deployment: new proxies,
 *      an empty namespace index, and a ledger pointing at them. That is what
 *      `pnpm protocol upgrade` is for, and why this refuses to run when the
 *      ledger already names a factory.
 */
contract Deploy is Config {
    error AlreadyDeployed(address factory);

    function run() external {
        header("deploy");

        address existing = deployed("SlotNamespaceFactory");
        if (existing != address(0)) revert AlreadyDeployed(existing);

        address admin_ = admin();
        console2.log("admin   ", admin_);
        console2.log("");

        vm.startBroadcast();

        // ── implementations ──────────────────────────────────────────────
        SlotNamespace namespaceImpl = new SlotNamespace();
        SlotNamespaceFactory factoryImpl = new SlotNamespaceFactory();
        SlotNamespaceResolver resolverImpl = new SlotNamespaceResolver();

        // ── the factory, initialized inside its proxy's constructor ───────
        //
        // Rather than deploying the proxy and initializing it in a second
        // transaction, which would leave it live and unowned in between — the
        // window in which anybody can claim `admin`.
        SlotNamespaceFactory factory = SlotNamespaceFactory(
            address(
                new ERC1967Proxy(
                    address(factoryImpl),
                    abi.encodeCall(
                        SlotNamespaceFactory.initialize,
                        (
                            admin_,
                            address(namespaceImpl),
                            ISlotFactory(SepoliaAddresses.SLOT_FACTORY),
                            IVerifiableFactory(SepoliaAddresses.ENS_VERIFIABLE_FACTORY),
                            SepoliaAddresses.ENS_USER_REGISTRY_IMPL,
                            IPermissionedRegistry(SepoliaAddresses.ENS_ETH_REGISTRY)
                        )
                    )
                )
            )
        );

        // ── the resolver, which needs the factory to look names up in ─────
        SlotNamespaceResolver resolver = SlotNamespaceResolver(
            address(
                new ERC1967Proxy(
                    address(resolverImpl), abi.encodeCall(SlotNamespaceResolver.initialize, (admin_, factory))
                )
            )
        );

        // ── and the pointer back ──────────────────────────────────────────
        //
        // Only the admin may do this, so a deploy run by a key that is handing
        // `admin` to a multisig has to stop here and let the multisig finish.
        if (admin_ == msg.sender) {
            factory.setResolver(address(resolver));
        }

        vm.stopBroadcast();

        record("SlotNamespaceImplementation", address(namespaceImpl), namespaceImpl.version());
        record("SlotNamespaceFactoryImplementation", address(factoryImpl), factoryImpl.version());
        record("SlotNamespaceResolverImplementation", address(resolverImpl), resolverImpl.version());
        record("SlotNamespaceFactory", address(factory), factoryImpl.version());
        record("SlotNamespaceResolver", address(resolver), resolverImpl.version());

        console2.log("SlotNamespaceFactory  ", address(factory));
        console2.log("SlotNamespaceResolver ", address(resolver));
        console2.log("beacon                ", address(factory.beacon()));
        console2.log("namespace impl        ", factory.implementation());
        console2.log("");

        if (admin_ != msg.sender) {
            console2.log("admin is not the deployer, so one call is left for it:");
            console2.log("  factory.setResolver(", address(resolver), ")");
        }
    }
}
