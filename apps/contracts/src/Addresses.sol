// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SepoliaAddresses
 * @notice Everything this project talks to on Ethereum Sepolia.
 *
 * @dev Two deployments meet here, and they are both testnet-only.
 *
 *      The ENS side is the ETHOnline 2026 HACKATHON deployment, which is a
 *      separate set of contracts from the standard ENSv2 Beta on the same
 *      chain. Mixing the two is the mistake this file exists to prevent: a
 *      name registered against one is invisible to the other, and both answer
 *      on Sepolia. Clients must also override the Universal Resolver built
 *      into viem/ethers with {ENS_UNIVERSAL_RESOLVER} below, or resolution
 *      silently goes to the wrong deployment.
 */
library SepoliaAddresses {
    // ─── ENSv2, ETHOnline 2026 hackathon deployment ─────────────────────────

    /// @notice `UpgradableUniversalResolverProxy` — the one clients must use.
    address internal constant ENS_UNIVERSAL_RESOLVER = 0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142;

    /// @notice Deploys the UUPS proxies for per-name registries and resolvers.
    address internal constant ENS_VERIFIABLE_FACTORY = 0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780;

    /// @notice Implementation behind every per-name subname registry.
    address internal constant ENS_USER_REGISTRY_IMPL = 0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546;

    /// @notice Implementation behind every per-account resolver.
    address internal constant ENS_PERMISSIONED_RESOLVER_IMPL = 0xa9d3814AB151BF6E37A427432795371a8361614e;

    /// @notice The `.eth` registry — where a second-level name is an entry.
    address internal constant ENS_ETH_REGISTRY = 0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e;

    /// @notice The `.eth` registrar, for acquiring a parent name to slot under.
    address internal constant ENS_ETH_REGISTRAR = 0x7d1B7f586a62Ac3F54b9A396849757814283270b;

    address internal constant ENS_ROOT_REGISTRY = 0xe7f0D5724f8337e3Aa9A9910540341Ff4273fEd9;

    /// @notice Test payment tokens the hackathon registrar accepts.
    address internal constant ENS_MOCK_USDC = 0xcBFD80F74375c54E545AF34788Ff465F96F66F05;
    address internal constant ENS_MOCK_DAI = 0x93403a98c3A6be906585CD0D68447c0Fc600FB38;

    // ─── 0xSlots ────────────────────────────────────────────────────────────

    /// @notice Creates one Harberger-taxed slot per slotted label.
    address internal constant SLOT_FACTORY = 0x14df7d78ef556A80F0AD3ede3F10F1e24f92E1cE;

    /// @notice The beacon implementation every slot proxy delegates to.
    address internal constant SLOT_IMPLEMENTATION = 0xfc2Bf27aD41C9C4B23b675Ef5c270161Ab87f530;

    /// @notice A window inside which an occupant cannot be outbid cheaply.
    /// @dev Optional per label — the hook slot stays free precisely so a
    ///      slotted name can carry a policy like this one.
    address internal constant MINIMUM_TENURE_HOOK = 0xB1e68532Ba467b2310A931abcDD682E718426c9C;

    address internal constant ADLAND_HOOK = 0xA8079a3226C29D0D91DaDc698823Fd3cE96D7Ee7;
}
