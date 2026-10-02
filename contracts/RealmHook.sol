// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";

/**
 * @title RealmHook
 * @notice The Uniswap v4 hook of every SilverRealm pool. It takes the trading fee in the base currency (ETH, $ZC or $SC)
 *         and hands all of it to RealmBurner, which turns it into burned $SC and $ZC. It keeps nothing.
 * @dev The fee mechanics are Stockereum's LaunchHook, which $SC and $ZC trade on: buys pay from their input in
 *      beforeSwap, sells from their base output in afterSwap; exact-output swaps are refused. The fee starts at 99% and
 *      falls to the pool's rate over 20 seconds, so a bot buying in the launch block pays nearly everything; the
 *      creator's buy in the launch transaction pays the pool's rate. The whole supply is seeded on one side of the
 *      opening price and only this hook can add liquidity; there is no way to remove it, so the liquidity is locked.
 *      Fees are credited as PoolManager claims (ERC-6909) to the burner, never transferred during a swap.
 */
contract RealmHook is IHooks, IUnlockCallback {
  using PoolIdLibrary for PoolKey;
  using CurrencyLibrary for Currency;
  using SafeERC20 for IERC20;

  struct Launch {
    address token;
    address base;
    uint40 openedAt;
    uint24 feePpm;
    bool baseIsCurrency0;
    bool pendingDevBuy;
    int24 tickLower;
    int24 tickUpper;
    uint128 liquidity;
  }

  uint256 public constant FEE_DENOMINATOR = 1_000_000;
  uint256 public constant LAUNCH_FEE = 990_000;
  uint256 public constant ANTI_SNIPE = 20;
  int24 public constant TICK_SPACING = 200;

  IPoolManager public immutable POOL_MANAGER;
  address public immutable BURNER;
  address public immutable FACTORY;

  mapping(PoolId => Launch) internal launches;

  event Opened(
    PoolId indexed poolId, address indexed token, address base, uint24 feePpm, int24 tickLower, int24 tickUpper
  );
  event Trade(
    PoolId indexed poolId, address indexed sender, bool buy, uint256 amountIn, uint256 amountOut, uint256 fee
  );

  error NotPoolManager();
  error NotFactory();
  error NotSelf();
  error ExactOutputUnsupported();
  error UnknownPool();
  error LiquidityLocked();
  error HookNotImplemented();

  modifier onlyPoolManager() {
    if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
    _;
  }

  /// @dev deployed by RealmFactory's constructor, at an address whose low bits carry this hook's permissions
  constructor(IPoolManager _poolManager, address _burner) {
    POOL_MANAGER = _poolManager;
    BURNER = _burner;
    FACTORY = msg.sender;
  }

  function launch(PoolId _poolId) external view returns (Launch memory) {
    return launches[_poolId];
  }

  /// @notice The fee a trade pays now, in millionths
  function currentFee(PoolId _poolId) external view returns (uint256) {
    Launch storage _l = launches[_poolId];
    if (_l.token == address(0)) revert UnknownPool();
    return _feeRate(_l.openedAt, _l.feePpm);
  }

  struct OpenParams {
    address token;
    address base;
    uint160 sqrtPriceX96;
    int24 openingTick;
    uint24 feePpm;
    bool devBuy;
  }

  /// @notice Open a pool at the opening price and lock the whole supply on the token's side of it
  function open(PoolKey calldata _key, OpenParams calldata _o) external {
    if (msg.sender != FACTORY) revert NotFactory();
    POOL_MANAGER.initialize(_key, _o.sqrtPriceX96);
    bool _baseIs0 = Currency.unwrap(_key.currency0) == _o.base;
    (int24 _lower, int24 _upper, uint128 _liquidity) =
      _range(_baseIs0, _o.openingTick, IERC20(_o.token).balanceOf(address(this)));
    PoolId _id = _key.toId();
    launches[_id] = Launch({
      token: _o.token,
      base: _o.base,
      openedAt: uint40(block.timestamp),
      feePpm: _o.feePpm,
      baseIsCurrency0: _baseIs0,
      pendingDevBuy: _o.devBuy,
      tickLower: _lower,
      tickUpper: _upper,
      liquidity: _liquidity
    });
    POOL_MANAGER.unlock(abi.encode(_key, _lower, _upper, _liquidity, _o.token));
    emit Opened(_id, _o.token, _o.base, _o.feePpm, _lower, _upper);
  }

  /// @dev All of it is the token: token0 above the opening price, or token1 below it
  function _range(bool _baseIs0, int24 _tick, uint256 _amount)
    internal
    pure
    returns (int24 _lower, int24 _upper, uint128 _liquidity)
  {
    (_lower, _upper) = _baseIs0 ? (-_maxUsableTick(), _tick) : (_tick, _maxUsableTick());
    uint160 _a = TickMath.getSqrtPriceAtTick(_lower);
    uint160 _b = TickMath.getSqrtPriceAtTick(_upper);
    _liquidity = uint128(
      _baseIs0
        ? FullMath.mulDiv(_amount, FixedPoint96.Q96, _b - _a)
        : FullMath.mulDiv(_amount, FullMath.mulDiv(_a, _b, FixedPoint96.Q96), _b - _a)
    );
  }

  /// @dev Seeds the pool: adds the liquidity and pays the tokens it asks for. Only this hook ever unlocks for it.
  function unlockCallback(bytes calldata _data) external onlyPoolManager returns (bytes memory) {
    (PoolKey memory _key, int24 _lower, int24 _upper, uint128 _liquidity, address _token) =
      abi.decode(_data, (PoolKey, int24, int24, uint128, address));
    (BalanceDelta _delta,) = POOL_MANAGER.modifyLiquidity(
      _key, ModifyLiquidityParams(_lower, _upper, int256(uint256(_liquidity)), bytes32(0)), ""
    );
    int128 _owed = Currency.unwrap(_key.currency0) == _token ? _delta.amount0() : _delta.amount1();
    if (_owed < 0) {
      POOL_MANAGER.sync(Currency.wrap(_token));
      IERC20(_token).safeTransfer(address(POOL_MANAGER), uint256(uint128(-_owed)));
      POOL_MANAGER.settle();
    }
    return "";
  }

  function beforeInitialize(address _sender, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
    if (_sender != address(this)) revert NotSelf();
    return IHooks.beforeInitialize.selector;
  }

  function beforeAddLiquidity(address _sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
    external
    view
    onlyPoolManager
    returns (bytes4)
  {
    if (_sender != address(this)) revert LiquidityLocked();
    return IHooks.beforeAddLiquidity.selector;
  }

  /// @dev A buy pays its fee from the base it puts in: the pool swaps the rest, the burner gets the fee as a claim
  function beforeSwap(address _sender, PoolKey calldata _key, SwapParams calldata _params, bytes calldata)
    external
    onlyPoolManager
    returns (bytes4, BeforeSwapDelta, uint24)
  {
    if (_params.amountSpecified >= 0) revert ExactOutputUnsupported();
    Launch storage _l = launches[_key.toId()];
    if (_l.token == address(0)) revert UnknownPool();
    if (_params.zeroForOne != _l.baseIsCurrency0) {
      return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    uint256 _fee = uint256(-_params.amountSpecified) * _consumeRate(_l, _sender) / FEE_DENOMINATOR;
    if (_fee == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    POOL_MANAGER.mint(BURNER, Currency.wrap(_l.base).toId(), _fee);
    return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(_fee)), 0), 0);
  }

  /// @dev A sell pays its fee from the base it takes out
  function afterSwap(
    address _sender,
    PoolKey calldata _key,
    SwapParams calldata _params,
    BalanceDelta _delta,
    bytes calldata
  ) external onlyPoolManager returns (bytes4, int128) {
    return (
      IHooks.afterSwap.selector, _afterSwap(_key.toId(), _sender, _params.zeroForOne, _params.amountSpecified, _delta)
    );
  }

  function _afterSwap(PoolId _id, address _sender, bool _zeroForOne, int256 _specified, BalanceDelta _delta)
    internal
    returns (int128)
  {
    Launch storage _l = launches[_id];
    bool _is0 = _l.baseIsCurrency0;
    int128 _baseDelta = _is0 ? _delta.amount0() : _delta.amount1();
    uint256 _in = uint256(-_specified);
    if (_zeroForOne == _is0) {
      // a buy: the pool swapped what was left after the fee
      uint256 _out = uint256(uint128(_is0 ? _delta.amount1() : _delta.amount0()));
      emit Trade(_id, _sender, true, _in, _out, _in - uint256(uint128(-_baseDelta)));
      return 0;
    }
    uint256 _gross = uint256(uint128(_baseDelta));
    uint256 _fee = _gross * _consumeRate(_l, _sender) / FEE_DENOMINATOR;
    if (_fee != 0) POOL_MANAGER.mint(BURNER, Currency.wrap(_l.base).toId(), _fee);
    emit Trade(_id, _sender, false, _in, _gross - _fee, _fee);
    return int128(int256(_fee));
  }

  /// @dev The creator's buy in the launch transaction pays the pool's rate, once; anyone else in the first 20 seconds
  ///      pays the falling launch rate
  function _consumeRate(Launch storage _l, address _sender) internal returns (uint256) {
    if (_l.pendingDevBuy && _sender == FACTORY && block.timestamp == _l.openedAt) {
      _l.pendingDevBuy = false;
      return _l.feePpm;
    }
    return _feeRate(_l.openedAt, _l.feePpm);
  }

  function _feeRate(uint40 _openedAt, uint24 _feePpm) internal view returns (uint256) {
    uint256 _elapsed = block.timestamp - _openedAt;
    if (_elapsed >= ANTI_SNIPE) return _feePpm;
    return LAUNCH_FEE - (LAUNCH_FEE - _feePpm) * _elapsed / ANTI_SNIPE;
  }

  function _maxUsableTick() internal pure returns (int24) {
    return TickMath.MAX_TICK / TICK_SPACING * TICK_SPACING;
  }

  function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
    revert HookNotImplemented();
  }

  function afterAddLiquidity(
    address,
    PoolKey calldata,
    ModifyLiquidityParams calldata,
    BalanceDelta,
    BalanceDelta,
    bytes calldata
  ) external pure returns (bytes4, BalanceDelta) {
    revert HookNotImplemented();
  }

  function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
    external
    pure
    returns (bytes4)
  {
    revert HookNotImplemented();
  }

  function afterRemoveLiquidity(
    address,
    PoolKey calldata,
    ModifyLiquidityParams calldata,
    BalanceDelta,
    BalanceDelta,
    bytes calldata
  ) external pure returns (bytes4, BalanceDelta) {
    revert HookNotImplemented();
  }

  function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
    revert HookNotImplemented();
  }

  function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
    revert HookNotImplemented();
  }
}
