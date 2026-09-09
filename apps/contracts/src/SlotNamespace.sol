// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ERC1155HolderUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import {MulticallUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import {IPermissionedRegistry} from "./interfaces/IENSv2.sol";
import {ISlotFactory, SlotInit} from "./interfaces/ISlots.sol";
import {SlotNamespaceBase} from "./namespace/SlotNamespaceBase.sol";
import {SlotNamespaceCuration} from "./namespace/SlotNamespaceCuration.sol";
import {SlotNamespaceRecords} from "./namespace/SlotNamespaceRecords.sol";
import {SlotNamespaceViews} from "./namespace/SlotNamespaceViews.sol";
import {Versioned} from "./upgrades/Versioned.sol";

/**
 * @title SlotNamespace
 * @notice One parent name's slotted subnames: curator, ENS custodian, and the
 *         store for whatever their occupants write.
 *
 * @dev The name stays with this contract permanently; what follows the occupant
 *      is RESOLUTION, `addr()` reading `occupant()` at call time. So turnover
 *      needs no registry write, and an occupant never holds a name NFT.
 *
 *      Behaviour is under `namespace/`, split by who asks. {SlotNamespaceBase}
 *      must stay first: it declares all the storage.
 *
 *      {ERC1155HolderUpgradeable} is load-bearing — ENSv2 names are ERC1155 and
 *      the registry's mint reverts without it. As a beacon proxy, nothing may
 *      be `immutable` and new state must have a correct zero value.
 */
contract SlotNamespace is
    SlotNamespaceBase,
    SlotNamespaceCuration,
    SlotNamespaceRecords,
    SlotNamespaceViews,
    ERC1155HolderUpgradeable,
    MulticallUpgradeable,
    Versioned
{
    /// @notice Everything a namespace is born with. `registry_` must grant this
    ///         contract `ROLE_REGISTRAR` and `ROLE_UNREGISTER` on
    ///         `ROOT_RESOURCE` — never `ROLE_RENEW`, as names here do not
    ///         expire. `terms_.hook`/`hookData` apply to every label opened
    ///         here. `labels` may be empty.
    struct InitParams {
        IPermissionedRegistry registry_;
        ISlotFactory slotFactory_;
        bytes32 parentNode_;
        string parentName_;
        address resolver_;
        SlotInit terms_;
        address owner_;
        LabelSpec[] labels;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc Versioned
    /// @dev Bump alongside any change here or under `namespace/`.
    function version() public pure virtual override returns (uint64) {
        return 2;
    }

    /// @notice Stand this namespace up — called by the factory in the same
    ///         transaction as the proxy, so it is never live and unowned.
    function initialize(InitParams calldata p) external initializer {
        __Ownable_init(p.owner_);

        registry = p.registry_;
        slotFactory = p.slotFactory_;
        parentNode = p.parentNode_;
        parentName = p.parentName_;
        resolver = p.resolver_;

        // The hook is kept, not blanked. It carries the minimum tenure every
        // space in this namespace is sold with — see {SlotNamespaceCuration}.
        _terms = p.terms_;

        emit ResolverChanged(p.resolver_);

        for (uint256 i; i < p.labels.length; ++i) {
            _slotOne(p.labels[i]);
        }
    }

    /// @notice Which MIGRATION has run in this namespace's storage. Always 1
    ///         for a beacon proxy — see {Versioned}.
    function initializedVersion() external view returns (uint64) {
        return _getInitializedVersion();
    }
}
