// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IENSv2
 * @notice The slice of ENSv2 this project actually calls, written by hand.
 *
 * @dev Rather than vendoring `ensdomains/contracts-v2` as a submodule. That
 *      repository brings its own OpenZeppelin checkout, which would collide
 *      with the one this project already remaps, and the ENS docs are explicit
 *      that these interfaces "are not yet final and may change prior to
 *      mainnet deployment". Four functions on the registry and three on the
 *      factory is a small enough surface to state exactly and to re-check
 *      against a live deployment.
 *
 *      That re-check is not optional and is not done by reading: every one of
 *      these signatures is exercised against the deployed hackathon contracts
 *      in `test/ForkSepolia.t.sol`. A signature that has drifted shows up
 *      there as a failed call, not as a surprise on deploy day.
 */

/// @notice The minimum every registry in the hierarchy implements.
interface IRegistry {
    function getSubregistry(string calldata label) external view returns (IRegistry);

    function getResolver(string calldata label) external view returns (address);
}

/// @notice The tokenized registry: names, roles, lifecycle.
interface IPermissionedRegistry is IRegistry {
    enum Status {
        AVAILABLE,
        RESERVED,
        REGISTERED
    }

    /// @dev Field order matters and is taken from the reference docs:
    ///      status, expiry, latestOwner, tokenId, resource.
    struct State {
        Status status;
        uint64 expiry;
        address latestOwner;
        uint256 tokenId;
        uint256 resource;
    }

    /**
     * @notice Register (or, with `owner` zero, reserve) a label.
     *
     * @dev `expiry` is an ABSOLUTE unix timestamp, not a duration — the single
     *      most common way to get this wrong.
     */
    function register(
        string calldata label,
        address owner,
        IRegistry registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    /// @notice Make a name available again. Requires `ROLE_UNREGISTER`.
    function unregister(uint256 anyId) external;

    /// @notice Point a name at a resolver. Requires `ROLE_SET_RESOLVER`.
    function setResolver(uint256 anyId, address resolver) external;

    /// @notice Point a name at a child registry.
    function setSubregistry(uint256 anyId, IRegistry registry) external;

    /**
     * @notice Everything about a name in one call.
     *
     * @dev `anyId` is polymorphic: a labelhash, a token id (current or stale),
     *      a resource or a canonical id all resolve to the same entry, because
     *      the registry strips the low 32 bits. This project always passes the
     *      LABELHASH — token ids in ENSv2 are mutable and must never be cached.
     */
    function getState(uint256 anyId) external view returns (State memory);

    function getStatus(uint256 anyId) external view returns (Status);

    function getTokenId(uint256 anyId) external view returns (uint256);

    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);

    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

/// @notice Deploys the UUPS proxies ENSv2 uses for per-name registries.
interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes memory data) external returns (address proxy);
}

/**
 * @notice `UserRegistryImpl`'s initializer, for use as `deployProxy` data.
 *
 * @dev NOT what the published docs say. They document
 *      `initialize(address rootAccount, uint256 roleBitmap)`; the hackathon
 *      deployment's implementation has no such selector and takes an array of
 *      grants instead. Verified against the deployed bytecode at
 *      {SepoliaAddresses.ENS_USER_REGISTRY_IMPL}, whose dispatch table
 *      contains `initialize((address,uint256)[])` (0x37cb53a8) and not
 *      `initialize(address,uint256)` (0xcd6dc687).
 *
 *      This is the drift the fork test exists to find. Anything written from
 *      the docs alone reverts on deploy with no message.
 */
interface IUserRegistry {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    function initialize(Grant[] calldata grants) external;
}

/**
 * @notice The interface a resolver must answer for the Universal Resolver to
 *         accept it.
 *
 * @dev ENSIP-10. The Universal Resolver hands over the DNS-encoded name and
 *      the profile calldata; the resolver derives the node itself. A resolver
 *      that does NOT implement this is only usable on an exact match, so
 *      implementing it is what lets one resolver serve a whole namespace.
 */
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/**
 * @notice Registry role bits.
 *
 * @dev Each role occupies one nybble; the admin variant of a role sits at the
 *      same position 128 bits up. `ROLE_CAN_TRANSFER_ADMIN` is the odd one
 *      out — it exists ONLY as an admin role, with no regular counterpart.
 */
library RegistryRoles {
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_REGISTER_RESERVED = 1 << 4;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ROLE_SET_URI = 1 << 36;
    uint256 internal constant ROLE_UPGRADE = 1 << 124;

    /// @dev Every role and its admin — what a registry's own deployer takes.
    uint256 internal constant ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111;

    function admin(uint256 role) internal pure returns (uint256) {
        return role << 128;
    }
}
