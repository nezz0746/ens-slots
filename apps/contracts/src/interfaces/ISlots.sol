// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ISlots
 * @notice The slice of the 0xSlots protocol this project calls.
 *
 * @dev Hand-written as {IENSv2} is: this repo consumes a deployed protocol, not
 *      its source. `test/ForkSepolia.t.sol` exercises every signature live.
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
 * @notice One continuously taxed position under common ownership.
 *
 * @dev {tenureId} increments on every buy. This project reuses it as the
 *      generation for a subname's records, so an occupant who leaves and later
 *      returns does not find their old records waiting.
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

    /// @notice Queue a change of terms. `onlyManager`, and it only ever
    ///         QUEUES: terms ripen for `TERMS_DELAY` and land at the next
    ///         occupancy change, so nothing moves under a sitting occupant.
    function proposeTerms(
        uint256 newTaxBps,
        address newHook,
        bytes32 newHookData,
        bool changeTax,
        bool changeHook
    ) external;

    /// @notice Drop a queued change before it lands. `onlyManager`.
    function cancelTerms(bool cancelTax, bool cancelHook) external;

    /// @notice Take a payout that could not be pushed. Anyone may call it on
    ///         anyone's behalf; the funds always go to `account`.
    function claim(address account) external;

    /// @notice Flush accrued tax to the recipient. Anyone may call.
    function collect() external;
}
