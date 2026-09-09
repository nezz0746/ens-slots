// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

/**
 * @title Config
 * @notice The deployment ledger, and the two rules every script here obeys.
 *
 * @dev ── One chain, one file per contract ────────────────────────────────
 *
 *      `deployments/<chainid>/<Name>.json` holds `{address, version,
 *      startBlock}` and is the ONLY record of what is live. The chain id comes
 *      from `block.chainid`, so the RPC a script is pointed at decides which
 *      ledger it writes — there is no `--chain` flag to disagree with the
 *      `--rpc-url`, and no way to deploy to Sepolia while recording it as local.
 *
 *      ── `--broadcast` does not mean what it looks like ────────────────────
 *
 *      `forge script` runs the body either way; the flag decides only whether
 *      the transactions are SENT. So a dry run reaches every `record()` call and
 *      would happily rewrite the ledger with addresses it merely predicted,
 *      pointing everything downstream at contracts that do not exist. Nothing in
 *      forge tells a script which mode it is in, so the CLI says: `DRY_RUN=true`
 *      turns every write into a line of output.
 *
 *      ── `startBlock` belongs to the deployment ────────────────────────────
 *
 *      Not to the run that happens to be writing. An upgrade keeps the address
 *      it already had, so stamping today's block on it would tell an indexer to
 *      start after everything that has already happened.
 */
abstract contract Config is Script {
    using stdJson for string;

    error AdminNotSet();
    error NotDeployed(string name);

    /// @notice Who holds the upgrade keys on this deployment.
    /// @dev Defaults to the broadcasting key, which is right for a local chain
    ///      and for the first Sepolia deploy. Set `ADMIN` to hand the beacon and
    ///      both proxies to a multisig instead.
    function admin() internal view returns (address a) {
        a = vm.envOr("ADMIN", msg.sender);
        if (a == address(0)) revert AdminNotSet();
    }

    function dryRun() internal view returns (bool) {
        return vm.envOr("DRY_RUN", false);
    }

    function chainName() internal view returns (string memory) {
        if (block.chainid == 11155111) return "sepolia";
        if (block.chainid == 31337) return "local (sepolia fork)";
        return "unknown";
    }

    // ─── the ledger ─────────────────────────────────────────────────────────

    function recordPath(string memory name) internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "/", name, ".json");
    }

    /**
     * @notice The address recorded for `name` on this chain, or zero.
     *
     * @dev A record naming an address with NO CODE is treated as absent, and
     *      that is the whole reason this is not a one-line file read.
     *
     *      The ledger is a file on disk; the chain it describes is not. A local
     *      fork is wiped every time anvil restarts, and the records it wrote
     *      outlive it — so `deploy` read a factory address from a previous
     *      session, found it non-zero, and refused with `AlreadyDeployed`
     *      naming a contract that had not existed for hours. The same happened
     *      on `deployments/11155111/`, written by a fork back when it still
     *      reported Sepolia's own chain id.
     *
     *      Checking for code makes the ledger describe the chain rather than
     *      the filesystem. A live deployment still blocks a second `deploy`,
     *      which is the guard's actual purpose; a dead one stops pretending.
     */
    function deployed(string memory name) internal view returns (address) {
        string memory path = recordPath(name);
        if (!vm.exists(path)) return address(0);
        address recorded = vm.readFile(path).readAddress(".address");
        return recorded.code.length == 0 ? address(0) : recorded;
    }

    /// @notice The same, but refusing to continue when there is nothing there.
    /// @dev Every upgrade path calls this. A missing record means the chain the
    ///      RPC points at has never been deployed to, and the honest response is
    ///      to stop rather than to deploy something fresh and call it an upgrade.
    function requireDeployed(string memory name) internal view returns (address) {
        address a = deployed(name);
        if (a == address(0)) revert NotDeployed(name);
        return a;
    }

    /// @notice The version last recorded for `name`, or zero.
    function recordedVersion(string memory name) internal view returns (uint64) {
        string memory path = recordPath(name);
        if (!vm.exists(path)) return 0;
        return uint64(vm.readFile(path).readUint(".version"));
    }

    function record(string memory name, address addr, uint64 v) internal {
        string memory path = recordPath(name);

        uint256 start = block.number;
        address previous;
        if (vm.exists(path)) {
            string memory prev = vm.readFile(path);
            previous = prev.readAddress(".address");
            // Keep the block the CONTRACT appeared in, not this run's.
            if (previous == addr) start = prev.readUint(".startBlock");
        }

        if (dryRun()) {
            if (previous != addr) console2.log("  would record", name, addr);
            return;
        }

        string memory obj = name;
        vm.serializeAddress(obj, "address", addr);
        vm.serializeUint(obj, "version", v);
        vm.writeFile(path, vm.serializeUint(obj, "startBlock", start));
    }

    // ─── output ─────────────────────────────────────────────────────────────

    function header(string memory what) internal view {
        console2.log("");
        console2.log("===", what, "===");
        console2.log("chain   ", chainName());
        if (dryRun()) console2.log("mode     DRY RUN - nothing is sent, nothing is recorded");
        console2.log("");
    }
}
