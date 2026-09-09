// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IExtendedResolver} from "./interfaces/IENSv2.sol";
import {SlotNamespace} from "./SlotNamespace.sol";
import {SlotNamespaceFactory} from "./SlotNamespaceFactory.sol";
import {Versioned} from "./upgrades/Versioned.sol";
import {VersionedUUPS} from "./upgrades/VersionedUUPS.sol";

/**
 * @title SlotNamespaceResolver
 * @notice The ENS-facing adapter for every namespace at once. Holds no records.
 *
 * @dev One instance for the whole system: it finds the namespace from the NAME
 *      through the factory's index. A resolver's address is written into an ENS
 *      entry at registration, so a per-namespace one could only be replaced per
 *      slotted label; this is upgraded in place instead.
 *
 *      The legacy `addr(bytes32)`/`text(bytes32,string)` getters are absent by
 *      design — a bare node cannot be resolved back to a namespace without
 *      inverting a hash. Universal Resolver V2 calls {resolve}.
 */
contract SlotNamespaceResolver is VersionedUUPS, IExtendedResolver, IERC165 {

    /// @notice The index this resolver looks names up in.
    SlotNamespaceFactory public factory;

    /// @notice May upgrade this resolver.
    address public admin;

    /// @dev Room to append. `script/layout.py` keys on this name.
    // forge-lint: disable-next-line(mixed-case-variable)
    uint256[48] private __gap;

    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256), ENSIP-9
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string), ENSIP-5
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923; // resolve, ENSIP-10

    uint256 private constant COIN_TYPE_ETH = 60; // SLIP-44

    error UnsupportedResolverProfile(bytes4 selector);
    error UnknownName();
    error NotAdmin(address caller);
    error ZeroAddress();

    modifier onlyAdmin() {
        _requireAdmin();
        _;
    }

    /// @dev Out of line: one copy of the check rather than one per function.
    function _requireAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
    }

    function initialize(address admin_, SlotNamespaceFactory factory_) external initializer {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        factory = factory_;
    }

    /// @notice Answer a resolver profile for a DNS-encoded name. The node in
    ///         `data` is ignored, as ENSv2's own resolvers do.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        (SlotNamespace namespace, bytes32 node) = _find(name);
        bytes4 selector = bytes4(data);

        if (selector == ADDR) {
            return abi.encode(namespace.addrOf(node));
        }

        if (selector == ADDR_COIN) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            // An unset record is not an error.
            if (coinType != COIN_TYPE_ETH) return abi.encode(bytes(""));
            address occupant = namespace.addrOf(node);
            return abi.encode(occupant == address(0) ? bytes("") : abi.encodePacked(occupant));
        }

        if (selector == TEXT) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(namespace.textOf(node, key));
        }

        revert UnsupportedResolverProfile(selector);
    }

    /// @notice Which namespace answers for a name, and the node to ask about.
    ///         Public so a broken name can be debugged from a block explorer.
    function find(bytes calldata name) external view returns (address namespace, bytes32 node) {
        (SlotNamespace ns, bytes32 n) = _find(name);
        return (address(ns), n);
    }

    function _find(bytes calldata name) internal view returns (SlotNamespace, bytes32) {
        if (name.length == 0 || name[0] == 0) revert UnknownName();

        bytes32 node = _namehash(name, 0);

        // The parent name itself, then one label down.
        address found = factory.namespaceOf(node);
        if (found != address(0)) return (SlotNamespace(found), node);

        found = factory.namespaceOf(_namehash(name, uint256(uint8(name[0])) + 1));
        if (found == address(0)) revert UnknownName();

        return (SlotNamespace(found), node);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == EXTENDED_RESOLVER || interfaceId == type(IERC165).interfaceId;
    }

    function transferAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        admin = next;
    }

    /// @inheritdoc Versioned
    /// @dev Bump alongside any change to this contract.
    function version() public pure virtual override returns (uint64) {
        return 1;
    }

    function _authorizeUpgrade(address) internal override onlyAdmin {}

    /// @dev namehash of a DNS-encoded name (`\x05alice\x03eth\x00`) from
    ///      `offset`. Starting at the second label gives the PARENT's namehash,
    ///      which is how {_find} asks its second question.
    function _namehash(bytes calldata name, uint256 offset) internal pure returns (bytes32) {
        if (offset >= name.length) return bytes32(0);

        uint256 length = uint8(name[offset]);
        if (length == 0) return bytes32(0);

        bytes32 parent = _namehash(name, offset + length + 1);
        bytes32 labelhash = keccak256(name[offset + 1:offset + 1 + length]);
        return keccak256(abi.encodePacked(parent, labelhash));
    }
}
