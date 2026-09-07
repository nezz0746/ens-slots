// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ISlots
 * @notice The slice of the 0xSlots protocol this project calls.
 *
 * @dev Hand-written for the same reason as {IENSv2}: this repository consumes
 *      a deployed protocol, not its source tree. `test/ForkSepolia.t.sol`
 *      exercises every signature here against the live Sepolia deployment.
 */

/// @notice The eight values a slot is born with. Field order is load-bearing.
struct SlotInit {
    address recipient;
    IERC20 currency;
    address manager;
    address hook;
    /// @dev Opaque to the slot, meaningful to the hook. Zero when `hook` is.
    bytes32 hookData;
    uint256 taxBps;
    uint256 minDepositSeconds;
    bool mutableTax;
    bool mutableHook;
}

interface ISlotFactory {
    function createSlot(SlotInit calldata init) external returns (address slot);
}

/**
 * @notice One Harberger-taxed position.
 *
 * @dev {tenureId} is the important one here and it is not decoration. The
 *      protocol increments it on every buy and already uses it to scope
 *      operator approvals, so that an approval "dies silently when somebody
 *      else is seated". This project reuses it as the generation for a
 *      subname's records — records belong to a TENANCY, not to a person, so
 *      an occupant who leaves and later returns does not find their old
 *      records waiting for them.
 */
interface ISlot {
    function occupant() external view returns (address);

    function tenureId() external view returns (uint64);

    function occupiedSince() external view returns (uint64);

    function price() external view returns (uint256);

    function taxBps() external view returns (uint256);

    function minDepositForBuy(uint256 price_) external view returns (uint256);

    function quoteBuy(address account, uint256 depositAmount) external view returns (uint256);

    function buy(address account, uint256 selfAssessedPrice, uint256 depositAmount, uint256 maxPayment) external payable;

    function release() external;
}
