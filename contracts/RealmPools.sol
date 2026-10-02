// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

/**
 * @notice The pools SilverRealm buys $SC, $ZC and $STOCKER through: ZC/WETH and SC/ZC on Stockereum's hook, STOCKER/WETH
 *         on its first hook. All hold locked liquidity under immutable hooks, so they are fixed here; nobody can point
 *         SilverRealm elsewhere.
 */
library RealmPools {
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address internal constant ZC = 0x4E67DB19044549fF420860834c91b45BaD298722;
  address internal constant SC = 0x3C3959052f60cbddC498b384958841b718112353;
  address internal constant STOCKER = 0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2;
  address internal constant STOCKEREUM_HOOK = 0x322dcEc4958C14e021A9F1cD49DF11b9457968cC;
  /// @dev Stockereum's first hook: STOCKER trades against WETH there, same mechanics, a fixed 1% fee
  address internal constant STOCKEREUM_OLD_HOOK = 0xAFeD2c6e0d906520ca17143a8918Ce6d54b128Cc;
  address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

  /// @dev ZC is currency0, WETH currency1
  function zcWeth() internal pure returns (PoolKey memory) {
    return PoolKey(Currency.wrap(ZC), Currency.wrap(WETH), 0, 200, IHooks(STOCKEREUM_HOOK));
  }

  /// @dev SC is currency0, ZC currency1
  function scZc() internal pure returns (PoolKey memory) {
    return PoolKey(Currency.wrap(SC), Currency.wrap(ZC), 0, 200, IHooks(STOCKEREUM_HOOK));
  }

  /// @dev STOCKER is currency0, WETH currency1
  function stockerWeth() internal pure returns (PoolKey memory) {
    return PoolKey(Currency.wrap(STOCKER), Currency.wrap(WETH), 0, 200, IHooks(STOCKEREUM_OLD_HOOK));
  }

  function isBase(address _base) internal pure returns (bool) {
    return _base == WETH || _base == ZC || _base == SC || _base == STOCKER;
  }

  /// @dev Exact-input swap inside an unlock; returns what came out. A swap that cannot use all of its input leaves a
  ///      debt and the whole unlock reverts, so nothing is ever half done.
  function swapIn(IPoolManager _pm, PoolKey memory _key, bool _zeroForOne, uint256 _amountIn)
    internal
    returns (uint256 _out)
  {
    BalanceDelta _d = _pm.swap(
      _key,
      SwapParams(
        _zeroForOne, -int256(_amountIn), _zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
      ),
      ""
    );
    _out = uint256(uint128(_zeroForOne ? _d.amount1() : _d.amount0()));
  }
}
