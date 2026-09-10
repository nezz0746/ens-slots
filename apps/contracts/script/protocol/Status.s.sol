// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";

import {SlotNamespace} from "../../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../../src/SlotNamespaceFactory.sol";
import {SlotNamespaceResolver} from "../../src/SlotNamespaceResolver.sol";
import {Config} from "./Config.s.sol";

/**
 * @title Status
 * @notice What is actually live, read off the chain rather than off the ledger.
 *
 *   pnpm protocol status
 *
 * @dev Every number here comes from a call, and that is the point. The ledger in
 *      `deployments/` is what we believe; this is what is true. The two drift
 *      whenever an upgrade is sent by hand, from a multisig, or from a branch
 *      that was never merged — and the first symptom is otherwise an upgrade
 *      that silently skips because the version it compares against was wrong.
 *
 *      It compares the two explicitly and says so, rather than leaving a reader
 *      to notice.
 */
contract Status is Config {
    function run() external view {
        header("status");

        address factoryAddr = deployed("SlotNamespaceFactory");
        if (factoryAddr == address(0)) {
            console2.log("nothing deployed on this chain.");
            console2.log("run: pnpm protocol deploy");
            return;
        }

        SlotNamespaceFactory factory = SlotNamespaceFactory(factoryAddr);
        SlotNamespaceResolver resolver = SlotNamespaceResolver(deployed("SlotNamespaceResolver"));

        console2.log("factory        ", factoryAddr);
        console2.log("  version      ", factory.version());
        console2.log("  admin        ", factory.admin());
        console2.log("  beacon       ", address(factory.beacon()));
        console2.log("  resolver     ", factory.resolver());
        console2.log("  namespaces   ", factory.count());
        console2.log("");

        address impl = factory.implementation();
        console2.log("namespace impl ", impl);
        console2.log("  version      ", SlotNamespace(payable(impl)).version());
        console2.log("");

        console2.log("resolver       ", address(resolver));
        console2.log("  version      ", resolver.version());
        console2.log("  admin        ", resolver.admin());
        console2.log("  factory      ", address(resolver.factory()));
        console2.log("");

        // The two wiring mistakes that leave everything looking deployed and
        // nothing working: a factory with no resolver opens namespaces whose
        // every `slotLabel` reverts, and a resolver pointed at a different
        // factory answers `UnknownName` for names that resolve perfectly well.
        if (factory.resolver() != address(resolver)) {
            console2.log("WARNING factory.resolver() is not the recorded resolver");
        }
        if (address(resolver.factory()) != factoryAddr) {
            console2.log("WARNING resolver.factory() is not the recorded factory");
        }

        _drift("factory  ", factory.version(), recordedVersion("SlotNamespaceFactory"));
        _drift("resolver ", resolver.version(), recordedVersion("SlotNamespaceResolver"));
        _drift("namespace", SlotNamespace(payable(impl)).version(), recordedVersion("SlotNamespaceImplementation"));

        for (uint256 i; i < factory.count(); ++i) {
            SlotNamespace ns = SlotNamespace(payable(factory.at(i)));
            console2.log(ns.parentName(), address(ns), ns.slottedCount());
        }
    }

    function _drift(string memory what, uint64 onChain, uint64 recorded) internal pure {
        if (onChain != recorded) {
            console2.log("WARNING", what, "on chain / recorded disagree:");
            console2.log("        ", onChain, recorded);
        }
    }
}
