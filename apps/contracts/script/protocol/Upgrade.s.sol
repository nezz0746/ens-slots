// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";

import {SlotNamespace} from "../../src/SlotNamespace.sol";
import {SlotNamespaceFactory} from "../../src/SlotNamespaceFactory.sol";
import {SlotNamespaceResolver} from "../../src/SlotNamespaceResolver.sol";
import {Config} from "./Config.s.sol";

/**
 * @title Upgrade
 * @notice Ship new code to what is already live, and refuse to do anything else.
 *
 *   pnpm protocol upgrade --dry     # what would change, sending nothing
 *   pnpm protocol upgrade
 *
 * @dev ── Three things can be upgraded, and only one of them is dangerous ───
 *
 *        SlotNamespaceFactory   UUPS. One proxy. Storage is its own.
 *        SlotNamespaceResolver  UUPS. One proxy. Holds two words and no records.
 *        SlotNamespace          BEACON. Reinterprets the storage of EVERY
 *                               namespace, at once, in one transaction.
 *
 *      The third has no undo and no partial failure. If a slot moved, every live
 *      namespace misreads its own registry pointer and parent node from the
 *      moment the transaction lands. That is what {_witness} is for.
 *
 *      ── The version gate ───────────────────────────────────────────────────
 *
 *      Each contract's `version()` is read off the live proxy and off the
 *      freshly compiled code, and anything that does not strictly increase is
 *      skipped rather than shipped. That turns three silent mistakes into a line
 *      of output: shipping the same implementation twice, shipping an OLDER one
 *      from a stale branch, and shipping the right code to the wrong chain.
 *
 *      It also means a run that changes nothing is safe and cheap, so `--dry`
 *      before every real run costs nothing.
 *
 *      ── What this deliberately does not do ─────────────────────────────────
 *
 *      Check the storage LAYOUT. That is `pnpm protocol layout`, which diffs the
 *      compiled layout against a committed snapshot and runs before this in the
 *      CLI. A layout check belongs where the source is, not in a script that has
 *      already been given a private key.
 */
contract Upgrade is Config {
    error NotAdmin(address admin, address caller);

    function run() external {
        header("upgrade");

        SlotNamespaceFactory factory = SlotNamespaceFactory(requireDeployed("SlotNamespaceFactory"));
        SlotNamespaceResolver resolver = SlotNamespaceResolver(requireDeployed("SlotNamespaceResolver"));

        // Fail here, with both addresses, rather than deep inside an
        // `onlyAdmin` revert that names neither.
        if (factory.admin() != msg.sender && !dryRun()) {
            revert NotAdmin(factory.admin(), msg.sender);
        }

        _namespace(factory);
        _factory(factory);
        _resolver(resolver);

        console2.log("");
        console2.log("done. versions now:");
        console2.log("  factory  ", factory.version());
        console2.log("  resolver ", resolver.version());
        console2.log("  namespace", SlotNamespace(payable(factory.implementation())).version());
    }

    // ─── the beacon: every namespace at once ────────────────────────────────

    function _namespace(SlotNamespaceFactory factory) internal {
        uint64 live = SlotNamespace(payable(factory.implementation())).version();
        uint64 next = new SlotNamespace().version();

        if (next <= live) {
            console2.log("namespace  skip  live", live);
            return;
        }
        console2.log("namespace  UPGRADE", live, "->", next);

        // Read a live namespace through the OLD code before the swap and
        // through the NEW code after it. `forge inspect storage` proves the
        // layout is unchanged in SOURCE; only this proves it against the storage
        // that actually exists on this chain.
        (bytes32 before_, bool hasWitness) = _witness(factory);

        if (dryRun()) {
            console2.log("           would deploy a new implementation and upgrade the beacon");
            return;
        }

        vm.startBroadcast();
        SlotNamespace impl = new SlotNamespace();
        factory.upgradeBeacon(address(impl));
        vm.stopBroadcast();

        require(factory.implementation() == address(impl), "beacon did not take the new implementation");

        if (hasWitness) {
            (bytes32 after_,) = _witness(factory);
            require(before_ == after_, "STORAGE MOVED: a live namespace reads differently after the upgrade");
            console2.log("           witness ok");
        }

        record("SlotNamespaceImplementation", address(impl), impl.version());
        console2.log("           impl", address(impl));
    }

    /**
     * @dev A fingerprint of one live namespace, taken through whatever code is
     *      behind the beacon right now.
     *
     *      The fields are chosen for what a moved slot would break first: the
     *      two the beacon forced out of `immutable` and into storage
     *      ({SlotNamespace-registry}, {SlotNamespace-parentNode}), the owner, and
     *      the label listing — which walks a dynamic array and four mappings, so
     *      a shifted base slot shows up as garbage rather than as a plausible
     *      wrong answer.
     *
     *      Silent when no namespace has been opened yet. On a fresh chain there
     *      is nothing to witness, and refusing to upgrade for that reason would
     *      make the first upgrade the only impossible one.
     */
    function _witness(SlotNamespaceFactory factory) internal view returns (bytes32, bool) {
        if (factory.count() == 0) return (bytes32(0), false);

        SlotNamespace ns = SlotNamespace(payable(factory.at(0)));
        (bytes32[] memory nodes, string[] memory labels, address[] memory slots) = ns.listing();

        return (
            keccak256(
                abi.encode(
                    address(ns.registry()),
                    ns.parentNode(),
                    ns.parentName(),
                    ns.owner(),
                    ns.resolver(),
                    nodes,
                    labels,
                    slots
                )
            ),
            true
        );
    }

    // ─── the two UUPS singletons ────────────────────────────────────────────

    function _factory(SlotNamespaceFactory factory) internal {
        uint64 live = factory.version();
        uint64 next = new SlotNamespaceFactory().version();

        if (next <= live) {
            console2.log("factory    skip  live", live);
            return;
        }
        console2.log("factory    UPGRADE", live, "->", next);

        if (dryRun()) {
            console2.log("           would deploy a new implementation and upgradeToAndCall");
            return;
        }

        vm.startBroadcast();
        SlotNamespaceFactory impl = new SlotNamespaceFactory();
        factory.upgradeToAndCall(address(impl), "");
        vm.stopBroadcast();

        require(factory.version() == next, "factory did not take the new implementation");

        record("SlotNamespaceFactoryImplementation", address(impl), next);
        record("SlotNamespaceFactory", address(factory), next);
        console2.log("           impl", address(impl));
    }

    function _resolver(SlotNamespaceResolver resolver) internal {
        uint64 live = resolver.version();
        uint64 next = new SlotNamespaceResolver().version();

        if (next <= live) {
            console2.log("resolver   skip  live", live);
            return;
        }
        console2.log("resolver   UPGRADE", live, "->", next);

        if (dryRun()) {
            console2.log("           would deploy a new implementation and upgradeToAndCall");
            return;
        }

        vm.startBroadcast();
        SlotNamespaceResolver impl = new SlotNamespaceResolver();
        resolver.upgradeToAndCall(address(impl), "");
        vm.stopBroadcast();

        require(resolver.version() == next, "resolver did not take the new implementation");

        record("SlotNamespaceResolverImplementation", address(impl), next);
        record("SlotNamespaceResolver", address(resolver), next);
        console2.log("           impl", address(impl));
    }
}
