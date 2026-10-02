// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {RealmHook} from "./RealmHook.sol";
import {RealmPools} from "./RealmPools.sol";
import {RealmToken} from "./RealmToken.sol";

interface IWETH {
  function deposit() external payable;
}

interface IChainlinkFeed {
  function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/**
 * @title RealmFactory
 * @notice Launch a token from your Realm (your wallet's page on Silverchat). Every launch buys $5 of $SC and burns it.
 *         The token trades against ETH, $ZC, $SC or $STOCKER at a fee its creator picks, 1%, 2% or 3%, and all of that fee is
 *         burned as $SC (80%) and $ZC (20%) by RealmBurner. SilverRealm keeps nothing.
 * @dev No owner, no pause, no settings. The hook is created here, so it can only ever serve this factory.
 *      The $5 is priced with Chainlink ETH/USD and bought through the ZC/WETH and SC/ZC pools in the same unlock as the
 *      creator's optional first buy; the caller's minimums bound what a moved pool can cost.
 */
contract RealmFactory is IUnlockCallback, ReentrancyGuard {
  using PoolIdLibrary for PoolKey;
  using SafeERC20 for IERC20;

  struct LaunchParams {
    string name;
    string symbol;
    // where the image and description live; kept in the event only
    string uri;
    address base;
    uint24 feePpm;
    // what the whole supply is worth at the opening price, in the base's smallest unit (the app sets $4,000)
    uint256 openingFdv;
    uint256 minScBurned;
    // ETH for the creator's first buy, at the pool's fee; 0 for none
    uint256 devBuyEth;
    uint256 minTokensOut;
  }

  struct Unlock {
    address creator;
    address base;
    address token;
    PoolKey key;
    uint256 burnEth;
    uint256 devBuyEth;
    uint256 minScBurned;
    uint256 minTokensOut;
  }

  int24 public constant TICK_SPACING = 200;
  /// @notice $5 at Chainlink's 8 decimals
  uint256 public constant BURN_USD = 5e8;
  uint256 public constant MAX_FEED_AGE = 3 hours;
  address public constant ETH_USD = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

  IPoolManager public immutable POOL_MANAGER;
  RealmHook public immutable HOOK;

  /// @notice the Realm (wallet) each token was launched from
  mapping(address => address) public realmOf;
  mapping(address => uint256) public launchCount;

  event Launched(
    address indexed token, address indexed realm, address indexed base, PoolId poolId, uint24 feePpm, int24 openingTick
  );
  event Metadata(address indexed token, string name, string symbol, string uri);
  event LaunchBurn(address indexed token, uint256 eth, uint256 scBurned);
  event DevBuy(address indexed token, address indexed creator, uint256 eth, uint256 tokens);

  error BadHookAddress();
  error BadBase();
  error BadFee();
  error BadPrice();
  error StaleFeed();
  error NotEnoughEth();
  error NotPoolManager();
  error TooLittleBurned();
  error TooFewTokens();
  error RefundFailed();

  /// @param _hookSalt mined so the hook's address carries its permission bits (0x28CC) for this factory's address
  constructor(IPoolManager _poolManager, address _burner, bytes32 _hookSalt) {
    POOL_MANAGER = _poolManager;
    HOOK = new RealmHook{salt: _hookSalt}(_poolManager, _burner);
    // beforeInitialize, beforeAddLiquidity, beforeSwap, afterSwap, and the two swap return deltas
    if (uint160(address(HOOK)) & 0x3FFF != 0x28CC) revert BadHookAddress();
  }

  function launch(LaunchParams calldata _p)
    external
    payable
    nonReentrant
    returns (address _token, PoolKey memory _key)
  {
    if (!RealmPools.isBase(_p.base)) revert BadBase();
    if (_p.feePpm != 10_000 && _p.feePpm != 20_000 && _p.feePpm != 30_000) revert BadFee();
    uint256 _burnEth = ethForBurn();
    if (msg.value < _burnEth + _p.devBuyEth) revert NotEnoughEth();

    bytes32 _salt = keccak256(abi.encode(msg.sender, launchCount[msg.sender]++));
    _token = address(new RealmToken{salt: _salt}(_p.name, _p.symbol, address(HOOK)));
    _key = _open(_p, _token);
    emit Metadata(_token, _p.name, _p.symbol, _p.uri);

    POOL_MANAGER.unlock(
      abi.encode(Unlock(msg.sender, _p.base, _token, _key, _burnEth, _p.devBuyEth, _p.minScBurned, _p.minTokensOut))
    );

    uint256 _rest = msg.value - _burnEth - _p.devBuyEth;
    if (_rest != 0) {
      (bool _ok,) = msg.sender.call{value: _rest}("");
      if (!_ok) revert RefundFailed();
    }
  }

  /// @dev The pool, at the opening price, with the whole supply locked in it
  function _open(LaunchParams calldata _p, address _token) internal returns (PoolKey memory _key) {
    bool _baseIs0 = _p.base < _token;
    _key = PoolKey(
      Currency.wrap(_baseIs0 ? _p.base : _token),
      Currency.wrap(_baseIs0 ? _token : _p.base),
      0,
      TICK_SPACING,
      IHooks(address(HOOK))
    );
    (uint160 _sqrtPrice, int24 _tick) = openingPrice(_p.openingFdv, _baseIs0);
    HOOK.open(_key, RealmHook.OpenParams(_token, _p.base, _sqrtPrice, _tick, _p.feePpm, _p.devBuyEth != 0));
    realmOf[_token] = msg.sender;
    emit Launched(_token, msg.sender, _p.base, _key.toId(), _p.feePpm, _tick);
  }

  /// @dev Buys and burns the $5 of SC, then the creator's first buy, then pays for both in WETH
  function unlockCallback(bytes calldata _data) external returns (bytes memory) {
    if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
    Unlock memory _u = abi.decode(_data, (Unlock));
    IPoolManager _pm = POOL_MANAGER;

    uint256 _zc = RealmPools.swapIn(_pm, RealmPools.zcWeth(), false, _u.burnEth);
    uint256 _sc = RealmPools.swapIn(_pm, RealmPools.scZc(), false, _zc);
    if (_sc < _u.minScBurned) revert TooLittleBurned();
    _pm.take(Currency.wrap(RealmPools.SC), RealmPools.DEAD, _sc);
    emit LaunchBurn(_u.token, _u.burnEth, _sc);

    if (_u.devBuyEth != 0) {
      uint256 _in = _u.devBuyEth;
      // ETH → STOCKER on its own pool; ETH → ZC, then → SC for an SC pair
      if (_u.base == RealmPools.STOCKER) {
        _in = RealmPools.swapIn(_pm, RealmPools.stockerWeth(), false, _in);
      } else if (_u.base != RealmPools.WETH) {
        _in = RealmPools.swapIn(_pm, RealmPools.zcWeth(), false, _in);
        if (_u.base == RealmPools.SC) _in = RealmPools.swapIn(_pm, RealmPools.scZc(), false, _in);
      }
      uint256 _out = RealmPools.swapIn(_pm, _u.key, Currency.unwrap(_u.key.currency0) == _u.base, _in);
      if (_out < _u.minTokensOut) revert TooFewTokens();
      _pm.take(Currency.wrap(_u.token), _u.creator, _out);
      emit DevBuy(_u.token, _u.creator, _u.devBuyEth, _out);
    }

    uint256 _eth = _u.burnEth + _u.devBuyEth;
    IWETH(RealmPools.WETH).deposit{value: _eth}();
    _pm.sync(Currency.wrap(RealmPools.WETH));
    IERC20(RealmPools.WETH).safeTransfer(address(_pm), _eth);
    _pm.settle();
    return "";
  }

  /// @notice The ETH that buys $5 of SC now, from Chainlink ETH/USD; refuses a price older than 3 hours
  function ethForBurn() public view returns (uint256) {
    (, int256 _answer,, uint256 _updatedAt,) = IChainlinkFeed(ETH_USD).latestRoundData();
    if (_answer <= 0) revert BadPrice();
    if (_updatedAt + MAX_FEED_AGE < block.timestamp) revert StaleFeed();
    return Math.mulDiv(BURN_USD, 1e18, uint256(_answer), Math.Rounding.Ceil);
  }

  /**
   * @notice The opening price for a supply worth `_fdv` of the base, rounded down to the tick spacing: the price the
   *         pool opens at, with the whole supply for sale above it
   */
  function openingPrice(uint256 _fdv, bool _baseIs0) public pure returns (uint160 _sqrtPrice, int24 _tick) {
    if (_fdv == 0) revert BadPrice();
    uint256 _supply = 1_000_000_000 ether;
    // price = currency1 per currency0, in raw units, as a Q192
    uint256 _q = _baseIs0 ? FullMath.mulDiv(_supply, 1 << 192, _fdv) : FullMath.mulDiv(_fdv, 1 << 192, _supply);
    uint256 _root = Math.sqrt(_q);
    if (_root < TickMath.MIN_SQRT_PRICE || _root >= TickMath.MAX_SQRT_PRICE) revert BadPrice();
    int24 _raw = TickMath.getTickAtSqrtPrice(uint160(_root));
    int24 _c = _raw / TICK_SPACING;
    if (_raw < 0 && _raw % TICK_SPACING != 0) --_c;
    _tick = _c * TICK_SPACING;
    // one spacing inside the usable range, so the locked range is never empty
    int24 _bound = TickMath.MAX_TICK / TICK_SPACING * TICK_SPACING - TICK_SPACING;
    if (_tick > _bound) _tick = _bound;
    if (_tick < -_bound) _tick = -_bound;
    _sqrtPrice = TickMath.getSqrtPriceAtTick(_tick);
  }

  /// @notice Where a creator's next token will be deployed, so an app can order the pool before launching
  function nextToken(address _creator, string calldata _name, string calldata _symbol) external view returns (address) {
    bytes32 _salt = keccak256(abi.encode(_creator, launchCount[_creator]));
    bytes32 _init =
      keccak256(abi.encodePacked(type(RealmToken).creationCode, abi.encode(_name, _symbol, address(HOOK))));
    return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), _salt, _init)))));
  }
}
