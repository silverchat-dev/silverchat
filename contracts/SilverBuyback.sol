// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Swaps an exact amount of the caller's input token for the output token and sends it back to the caller
interface IVenue {
  function buy(uint256 _amountIn, uint256 _minOut) external returns (uint256 _amountOut);
}

/**
 * @title SilverBuyback
 * @notice Takes the 20% share of every Silverchat poll in ZC, buys $SC with it and burns the SC.
 * @dev There is no way to take ZC out other than buying SC. The SC token and the swap venue are set once, after the SC
 *      launch, and never change. The keeper only picks amounts, inside limits, and sends through a private mempool.
 */
contract SilverBuyback is Ownable2Step {
  using SafeERC20 for IERC20;

  address public constant BURN = 0x000000000000000000000000000000000000dEaD;

  IERC20 public immutable ZC;

  IERC20 public sc;
  IVenue public venue;
  address public keeper;
  /// @notice Most ZC one buyback may spend
  uint256 public maxBuy;
  /// @notice Least time between two buybacks
  uint256 public minGap;
  uint256 public lastBuy;

  event ScSet(IERC20 sc, IVenue venue);
  event KeeperSet(address keeper);
  event LimitsSet(uint256 maxBuy, uint256 minGap);
  event Bought(uint256 zcIn, uint256 scOut, uint256 burned);

  error ZeroAddress();
  error AlreadySet();
  error NotKeeper();
  error NoSc();
  error Expired();
  error BadAmount();
  error TooSoon();
  error TooLittle();

  constructor(IERC20 _zc, address _owner, address _keeper, uint256 _maxBuy, uint256 _minGap) Ownable(_owner) {
    if (address(_zc) == address(0)) revert ZeroAddress();
    ZC = _zc;
    keeper = _keeper;
    maxBuy = _maxBuy;
    minGap = _minGap;
    emit KeeperSet(_keeper);
    emit LimitsSet(_maxBuy, _minGap);
  }

  /// @notice Set the SC token and the venue that buys it. Once, forever.
  function setSc(IERC20 _sc, IVenue _venue) external onlyOwner {
    if (address(sc) != address(0)) revert AlreadySet();
    if (address(_sc) == address(0) || address(_venue) == address(0)) revert ZeroAddress();
    sc = _sc;
    venue = _venue;
    emit ScSet(_sc, _venue);
  }

  function setKeeper(address _keeper) external onlyOwner {
    keeper = _keeper;
    emit KeeperSet(_keeper);
  }

  function setLimits(uint256 _maxBuy, uint256 _minGap) external onlyOwner {
    maxBuy = _maxBuy;
    minGap = _minGap;
    emit LimitsSet(_maxBuy, _minGap);
  }

  /**
   * @notice Spend `_zcIn` ZC on SC and burn every SC this contract holds
   * @param _minScOut Least SC the swap must return; never zero, so a swap cannot be given away
   */
  function buyback(uint256 _zcIn, uint256 _minScOut, uint256 _deadline) external {
    if (msg.sender != keeper) revert NotKeeper();
    IVenue _venue = venue;
    if (address(_venue) == address(0)) revert NoSc();
    if (block.timestamp > _deadline) revert Expired();
    if (_zcIn == 0 || _zcIn > maxBuy || _minScOut == 0) revert BadAmount();
    if (lastBuy != 0 && block.timestamp < lastBuy + minGap) revert TooSoon();
    lastBuy = block.timestamp;

    uint256 _before = sc.balanceOf(address(this));
    ZC.forceApprove(address(_venue), _zcIn);
    _venue.buy(_zcIn, _minScOut);
    ZC.forceApprove(address(_venue), 0);
    uint256 _held = sc.balanceOf(address(this));
    if (_held - _before < _minScOut) revert TooLittle();

    sc.safeTransfer(BURN, _held);
    emit Bought(_zcIn, _held - _before, _held);
  }
}
