// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IExtendedResolver} from "./interfaces/IENSv2.sol";
import {SlotNamespace} from "./SlotNamespace.sol";

/**
 * @title SlotNamespaceResolver
 * @notice ENS-facing adapter for a {SlotNamespace}. Holds nothing.
 *
 * @dev Every value it returns is read from the namespace, which reads it from
 *      the slot. Stateless on purpose: the ENS documentation says these
 *      resolver interfaces "are not yet final and may change prior to mainnet
 *      deployment", so the half of this system most likely to need replacing
 *      is the half that owns no data. Swapping it costs one `setResolver`
 *      call and loses nothing.
 *
 *      {IExtendedResolver} rather than the legacy per-record getters, because
 *      that is what the Universal Resolver V2 calls: it hands over the
 *      DNS-encoded name plus the profile calldata and expects the resolver to
 *      derive the node itself. A resolver without it is only usable on an
 *      exact match, which would rule out serving a namespace.
 */
contract SlotNamespaceResolver is IExtendedResolver, IERC165 {
    SlotNamespace public immutable NAMESPACE;

    /// @dev `addr(bytes32)`
    bytes4 private constant ADDR = 0x3b3b57de;
    /// @dev `addr(bytes32,uint256)` — ENSIP-9
    bytes4 private constant ADDR_COIN = 0xf1cb7e06;
    /// @dev `text(bytes32,string)` — ENSIP-5
    bytes4 private constant TEXT = 0x59d1d43c;
    /// @dev `resolve(bytes,bytes)` — ENSIP-10
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923;

    /// @dev Ethereum, in SLIP-44 terms.
    uint256 private constant COIN_TYPE_ETH = 60;

    error UnsupportedResolverProfile(bytes4 selector);

    constructor(SlotNamespace namespace) {
        NAMESPACE = namespace;
    }

    /**
     * @notice Answer a resolver profile for a DNS-encoded name.
     *
     * @dev The node inside `data` is ignored, as the ENSv2 resolvers do: the
     *      authoritative node is the one derived from `name`.
     */
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes32 node = _namehash(name, 0);
        bytes4 selector = bytes4(data);

        if (selector == ADDR) {
            return abi.encode(NAMESPACE.addrOf(node));
        }

        if (selector == ADDR_COIN) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            // Anything but mainnet ETH is an empty answer rather than a
            // revert: an unset record is not an error.
            if (coinType != COIN_TYPE_ETH) return abi.encode(bytes(""));
            address occupant = NAMESPACE.addrOf(node);
            return abi.encode(occupant == address(0) ? bytes("") : abi.encodePacked(occupant));
        }

        if (selector == TEXT) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(NAMESPACE.textOf(node, key));
        }

        revert UnsupportedResolverProfile(selector);
    }

    /// @notice The direct form, for callers that already hold the node.
    function addr(bytes32 node) external view returns (address) {
        return NAMESPACE.addrOf(node);
    }

    /// @notice The direct form, for callers that already hold the node.
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return NAMESPACE.textOf(node, key);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == EXTENDED_RESOLVER || interfaceId == type(IERC165).interfaceId;
    }

    /**
     * @dev namehash of a DNS-encoded name, computed the way the spec defines
     *      it: recursively, from the end backwards.
     *
     *      A DNS-encoded name is a series of length-prefixed labels ending in
     *      a zero byte — `\x05alice\x03eth\x00`. The namehash of the empty name
     *      is zero, and each label hashes into its parent.
     */
    function _namehash(bytes calldata name, uint256 offset) internal pure returns (bytes32) {
        uint256 length = uint8(name[offset]);
        if (length == 0) return bytes32(0);

        bytes32 parent = _namehash(name, offset + length + 1);
        bytes32 labelhash = keccak256(name[offset + 1:offset + 1 + length]);
        return keccak256(abi.encodePacked(parent, labelhash));
    }
}
