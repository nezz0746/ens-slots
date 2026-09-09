// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import {Versioned} from "./Versioned.sol";

/**
 * @title VersionedUUPS
 * @notice What every UUPS singleton here needs, in one place.
 *
 * @dev Declares NO storage, and must not start: base storage is allocated
 *      before derived, so anything added here would shift every inheriting
 *      contract's layout. Add to the inheriting contract's own gap instead.
 *
 *      `_authorizeUpgrade` stays abstract. {SlotNamespace} must not inherit
 *      this at all — it is a beacon implementation with no upgrade entry point
 *      of its own.
 */
abstract contract VersionedUUPS is Initializable, UUPSUpgradeable, Versioned {
    /// @dev Locks the IMPLEMENTATION so it can never be initialized directly.
    ///      Only the proxy delegating into it ever runs `initialize`.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Which MIGRATION has run in this proxy's storage — the
    ///         counterpart to {Versioned-version}, which reports which CODE.
    ///         A mismatch after an upgrade means a reinitializer did not run.
    function initializedVersion() external view returns (uint64) {
        return _getInitializedVersion();
    }
}
