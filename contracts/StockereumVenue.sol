// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IVenue} from "./SilverBuyback.sol";

struct PoolKey {
  address currency0;
  address currency1;
  uint24 fee;
  int24 tickSpacing;
  address hooks;
}

interface IStockereumRouter {
  function buy(PoolKey calldata _key, address _quote, uint256 _amountIn, uint256 _minOut, bytes calldata _hookData)
    external
    returns (uint256 _amountOut);
}

/**
 * @title StockereumVenue
 * @notice Buys a Stockereum launch token with its quote token through the launchpad's router
 * @dev Pool key as the Stockereum factory builds it: sorted currencies, fee 0 (the hook charges), tick spacing 200.
 *      Holds nothing between calls; anyone may use it with their own funds.
 */
contract StockereumVenue is IVenue {
  using SafeERC20 for IERC20;

  IStockereumRouter public immutable ROUTER;
  IERC20 public immutable QUOTE;
  IERC20 public immutable TOKEN;
  address public immutable HOOK;

  constructor(IStockereumRouter _router, IERC20 _quote, IERC20 _token, address _hook) {
    ROUTER = _router;
    QUOTE = _quote;
    TOKEN = _token;
    HOOK = _hook;
  }

  function buy(uint256 _amountIn, uint256 _minOut) external returns (uint256 _amountOut) {
    QUOTE.safeTransferFrom(msg.sender, address(this), _amountIn);
    QUOTE.forceApprove(address(ROUTER), _amountIn);
    ROUTER.buy(key(), address(QUOTE), _amountIn, _minOut, "");
    QUOTE.forceApprove(address(ROUTER), 0);
    _amountOut = TOKEN.balanceOf(address(this));
    TOKEN.safeTransfer(msg.sender, _amountOut);
  }

  function key() public view returns (PoolKey memory) {
    (address _a, address _b) =
      address(QUOTE) < address(TOKEN) ? (address(QUOTE), address(TOKEN)) : (address(TOKEN), address(QUOTE));
    return PoolKey({currency0: _a, currency1: _b, fee: 0, tickSpacing: 200, hooks: HOOK});
  }
}
