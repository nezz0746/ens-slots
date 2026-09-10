// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ERC1155HolderUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import {MulticallUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    using SafeERC20 for IERC20;

    /// @dev namehash("eth"), so a claimed labelhash can be checked against the
    ///      node rather than believed.
    bytes32 internal constant ETH_NODE = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));

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
        IPermissionedRegistry ethRegistry_;
        bytes32 parentLabelhash_;
        LabelSpec[] labels;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc Versioned
    /// @dev Bump alongside any change here or under `namespace/`.
    function version() public pure virtual override returns (uint64) {
        return 3;
    }

    /// @notice Stand this namespace up — called by the factory in the same
    ///         transaction as the proxy, so it is never live and unowned.
    function initialize(InitParams calldata p) external initializer {
        // No `__Ownable_init`. {owner} is DERIVED — see the override below —
        // so the stored owner would be a second answer to a question that
        // already has one, and the wrong one as soon as the name changed hands.
        //
        // The labelhash is checked rather than trusted: namehash("<label>.eth")
        // is `keccak(ETH_NODE, labelhash)`, so a caller who passes a labelhash
        // belonging to a different name is refused here rather than quietly
        // pointing this namespace's authority at somebody else's name.
        if (keccak256(abi.encodePacked(ETH_NODE, p.parentLabelhash_)) != p.parentNode_) {
            revert LabelhashMismatch();
        }
        ethRegistry = p.ethRegistry_;
        parentLabelhash = p.parentLabelhash_;

        registry = p.registry_;
        slotFactory = p.slotFactory_;
        parentNode = p.parentNode_;
        parentName = p.parentName_;
        resolver = p.resolver_;

        // The hook is kept, not blanked. It carries the minimum tenure every
        // space in this namespace is sold with — see {SlotNamespaceCuration}.
        _terms = p.terms_;

        // Terms are manageable, and only through this contract. `manager` and
        // `recipient` are overwritten per slot in {_slotOne}; these two flags
        // are what let the slot honour a proposal at all, and a namespace that
        // opened with them false could never be given them later.
        _terms.mutableTax = true;
        _terms.mutableHook = true;

        emit ResolverChanged(p.resolver_);

        for (uint256 i; i < p.labels.length; ++i) {
            _slotOne(p.labels[i]);
        }
    }

    /**
     * @notice Whoever owns the parent name in the `.eth` registry, right now.
     *
     * ── Why this is derived and not stored ──────────────────────────────────
     *
     * A stored owner is a SNAPSHOT of who held the name the day the namespace
     * opened. Sell `l2beat.eth` and the subname market underneath it would
     * still answer to the seller: the buyer controls the name, sees slots under
     * it, and can do nothing about them. Two answers to "who controls this
     * name", free to diverge and never to reconverge.
     *
     * Deriving it means authority follows the name with no transaction at all.
     * It also defuses the open squat: opening a namespace for a name you do not
     * own now makes its OWNER the owner, so the squatter pays gas to make
     * somebody else a working namespace.
     *
     * ── What it costs ───────────────────────────────────────────────────────
     *
     * `ownerOf` answers zero for an expired name, so a lapsed parent leaves a
     * namespace nobody can curate until it is renewed. That is the right
     * answer — the authority was the name, and the name is gone — but it is a
     * real behaviour and worth knowing before opening one.
     *
     * ── Two calls, and the second is not optional ───────────────────────────
     *
     * `ownerOf` takes a TOKEN ID, not a labelhash, and the two are different
     * numbers. Asking it about `keccak(label)` directly returns zero for a name
     * that is definitely registered — silently, which is the worst way to be
     * wrong about access control. `getTokenId` does the conversion, and it
     * carries a version counter, so a name that expired and was registered
     * again answers with the NEW id and this stays correct across that.
     */
    function owner() public view override returns (address) {
        return ethRegistry.ownerOf(ethRegistry.getTokenId(uint256(parentLabelhash)));
    }

    /// @notice Both revert. Ownership here is not a thing you hand over; it is
    ///         the parent name, so transfer THAT.
    function transferOwnership(address) public pure override {
        revert OwnershipFollowsTheName();
    }

    function renounceOwnership() public pure override {
        revert OwnershipFollowsTheName();
    }

    /**
     * @notice Send collected tax to whoever owns the parent name now.
     *
     * ── Why the namespace holds it at all ───────────────────────────────────
     *
     * A slot's `recipient` is written once and has no setter — it is frozen
     * harder than its tax. Naming a person there pays the day-one owner
     * forever. Naming this contract keeps the income attached to the NAME,
     * which is what {owner} already resolves.
     *
     * ── Why it accumulates rather than forwarding on arrival ────────────────
     *
     * There is nothing to forward from. An ERC20 `transfer` does not call its
     * recipient, so there is no hook to act in. Accumulating is the only thing
     * that can actually happen, so it happens deliberately.
     *
     * ── Both currencies, because the alternative traps money ────────────────
     *
     * Supporting native costs a payable `receive`, and a contract with one
     * cannot be reached by a plain `SlotNamespace(addr)` conversion — every
     * call site says `payable(addr)` instead, which is why they all do. The
     * alternative was ERC20 only, and it is not merely narrower: a native
     * namespace would have its tax pushed at a contract that cannot accept it,
     * credited in the slot, and then unreachable, because `claim` pays by
     * transfer too. Refusing the cast noise would have meant a contract that
     * silently strands funds in a currency the protocol allows.
     *
     * Anyone may call this. It pays {owner} whoever calls it, so there is
     * nothing to gate and someone other than the owner triggering a payment TO
     * the owner is a favour, not an attack.
     */
    function withdraw() external {
        IERC20 token = IERC20(address(_terms.currency));
        bool native = address(token) == address(0);

        uint256 amount = native ? address(this).balance : token.balanceOf(address(this));
        if (amount == 0) revert NothingToWithdraw();

        address to = owner();
        if (native) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NothingToWithdraw();
        } else {
            token.safeTransfer(to, amount);
        }
        emit Withdrawn(to, amount);
    }

    /// @dev Native tax arrives as a plain transfer, and the slot sends it with
    ///      only `PAYOUT_GAS` of head-room — so this must stay empty.
    receive() external payable {}

    /// @notice Pull back a payout the slot could not push to us — see
    ///         `_payOrCredit` in 0xSlots. Anyone may call; it credits this
    ///         contract, and {withdraw} then pays the owner.
    function sweep(string calldata label) external {
        _requireSlot(_node(keccak256(bytes(label)))).claim(address(this));
    }

    /// @notice Which MIGRATION has run in this namespace's storage. Always 1
    ///         for a beacon proxy — see {Versioned}.
    function initializedVersion() external view returns (uint64) {
        return _getInitializedVersion();
    }
}
