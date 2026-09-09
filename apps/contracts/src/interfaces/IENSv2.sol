// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IENSv2
 * @notice The slice of ENSv2 this project actually calls, written by hand.
 *
 * @dev Not vendored: `ensdomains/contracts-v2` brings its own OpenZeppelin
 *      checkout, and the docs say these interfaces "are not yet final".
 *      `test/ForkSepolia.t.sol` exercises every signature here against the live
 *      deployment, so drift fails a test rather than a deploy.
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

    /// @dev Field order is load-bearing; taken from the reference docs.
    struct State {
        Status status;
        uint64 expiry;
        address latestOwner;
        uint256 tokenId;
        uint256 resource;
    }

    /// @notice Register (or, with `owner` zero, reserve) a label.
    /// @dev `expiry` is an ABSOLUTE unix timestamp, not a duration.
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

    /// @notice Everything about a name in one call.
    /// @dev `anyId` is polymorphic — labelhash, token id, resource all resolve
    ///      to one entry. Always pass the LABELHASH: ENSv2 token ids are
    ///      mutable and must never be cached.
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
 * @dev NOT what the published docs say — they document
 *      `initialize(address,uint256)` (0xcd6dc687), which the deployed bytecode
 *      does not have. Its dispatch table carries
 *      `initialize((address,uint256)[])` (0x37cb53a8). Written from the docs
 *      alone, this reverts on deploy with no message.
 */
interface IUserRegistry {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    function initialize(Grant[] calldata grants) external;
}

/// @notice ENSIP-10: the Universal Resolver hands over the DNS-encoded name and
///         the profile calldata, and the resolver derives the node itself. This
///         is what lets one resolver serve a whole namespace.
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @notice Registry role bits. One nybble each, with the admin variant 128 bits
///         up. `ROLE_CAN_TRANSFER_ADMIN` exists ONLY as an admin role.
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
