// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test, Vm} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IProtocolFees} from "v4-core/src/interfaces/IProtocolFees.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {CustomRevert} from "v4-core/src/libraries/CustomRevert.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {RealmBurner} from "./RealmBurner.sol";
import {RealmFactory} from "./RealmFactory.sol";
import {RealmHook} from "./RealmHook.sol";
import {RealmPools} from "./RealmPools.sol";

interface ILaunchRouter {
  function buy(PoolKey calldata key, address quote, uint256 amountIn, uint256 minOut, bytes calldata hookData)
    external
    returns (uint256);
  function sell(
    PoolKey calldata key,
    address token,
    address quote,
    uint256 amountIn,
    uint256 minOut,
    bytes calldata hookData
  ) external returns (uint256);
  function buyWethPairWithEth(PoolKey calldata key, uint256 minOut, bytes calldata hookData)
    external
    payable
    returns (uint256);
}

/// @dev Tries what nobody may do to a SilverRealm pool
contract Intruder is IUnlockCallback {
  IPoolManager immutable PM;
  PoolKey key;
  uint8 action;

  constructor(IPoolManager _pm) {
    PM = _pm;
  }

  function poke(PoolKey memory _key, uint8 _action) external {
    (key, action) = (_key, _action);
    PM.unlock("");
  }

  function unlockCallback(bytes calldata) external returns (bytes memory) {
    if (action == 0) PM.modifyLiquidity(key, ModifyLiquidityParams(-887_200, 887_200, 1e18, 0), "");
    else PM.swap(key, SwapParams(true, 1e18, TickMath.MIN_SQRT_PRICE + 1), "");
    return "";
  }
}

/// @notice SilverRealm against the mainnet PoolManager, Stockereum's pools and router, real $SC, $ZC, WETH and Chainlink.
///         `forge test --match-contract RealmFork`
contract RealmFork is Test {
  using CurrencyLibrary for Currency;

  IPoolManager constant PM = IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90);
  ILaunchRouter constant ROUTER = ILaunchRouter(0xcdf832D2C11DA16055bb6C6145cF38EDD7233767);
  address constant WETH = RealmPools.WETH;
  address constant ZC = RealmPools.ZC;
  address constant SC = RealmPools.SC;
  address constant DEAD = RealmPools.DEAD;
  address constant STOCKER = RealmPools.STOCKER;

  RealmBurner burner;
  RealmFactory factory;
  RealmHook hook;
  address buyer = makeAddr("buyer");

  function setUp() public {
    vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://eth.drpc.org")), 26_107_000);
    burner = new RealmBurner(PM, address(this), address(this));
    address _factory = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
    bytes32 _init = keccak256(abi.encodePacked(type(RealmHook).creationCode, abi.encode(PM, address(burner))));
    bytes32 _salt;
    for (uint256 _i;; ++_i) {
      _salt = bytes32(_i);
      if (uint160(vm.computeCreate2Address(_salt, _init, _factory)) & 0x3FFF == 0x28CC) break;
    }
    factory = new RealmFactory(PM, address(burner), _salt);
    assertEq(address(factory), _factory);
    hook = factory.HOOK();
    vm.deal(buyer, 100 ether);
    deal(ZC, buyer, 10_000_000 ether);
    deal(SC, buyer, 10_000_000 ether);
    deal(STOCKER, buyer, 50_000_000_000 ether);
    vm.startPrank(buyer);
    IERC20(ZC).approve(address(ROUTER), type(uint256).max);
    IERC20(SC).approve(address(ROUTER), type(uint256).max);
    IERC20(STOCKER).approve(address(ROUTER), type(uint256).max);
    vm.stopPrank();
  }

  // ---- helpers

  /// @dev $4,000 of the base, at today's rough prices; only the opening price depends on it
  function _fdv(address _base) internal pure returns (uint256) {
    if (_base == WETH) return 1.5 ether;
    if (_base == ZC) return 270_000 ether;
    // STOCKER at about 1.0e-6 ETH today: $4,000 is some 1.5 million
    if (_base == STOCKER) return 1_500_000 ether;
    return 10_000_000 ether;
  }

  /// @dev A creator whose next token sorts below or above the base, so both pool orderings are tested
  function _creator(address _base, bool _tokenBelow) internal view returns (address _c) {
    for (uint256 _i;; ++_i) {
      _c = address(uint160(uint256(keccak256(abi.encode("creator", _i)))));
      if ((factory.nextToken(_c, "Realm Coin", "REALM") < _base) == _tokenBelow) return _c;
    }
  }

  function _launch(address _creatorAddr, address _base, uint24 _fee, uint256 _devBuy)
    internal
    returns (address _token, PoolKey memory _key)
  {
    vm.deal(_creatorAddr, 10 ether);
    uint256 _value = factory.ethForBurn() + _devBuy + 0.01 ether;
    address _next = factory.nextToken(_creatorAddr, "Realm Coin", "REALM");
    vm.prank(_creatorAddr);
    (_token, _key) = factory.launch{value: _value}(
      RealmFactory.LaunchParams("Realm Coin", "REALM", "ipfs://x", _base, _fee, _fdv(_base), 1, _devBuy, 0)
    );
    assertEq(_token, _next);
  }

  function _buy(PoolKey memory _key, address _base, uint256 _amount) internal returns (uint256 _got) {
    vm.prank(buyer);
    _got =
      _base == WETH ? ROUTER.buyWethPairWithEth{value: _amount}(_key, 0, "") : ROUTER.buy(_key, _base, _amount, 0, "");
  }

  function _sell(PoolKey memory _key, address _token, address _base, uint256 _amount) internal returns (uint256 _got) {
    vm.startPrank(buyer);
    IERC20(_token).approve(address(ROUTER), _amount);
    _got = ROUTER.sell(_key, _token, _base, _amount, 0, "");
    vm.stopPrank();
  }

  /// @dev The hook's Trade log for the launch transaction's buy
  function _devTrade() internal returns (uint256 _in, uint256 _fee) {
    Vm.Log[] memory _logs = vm.getRecordedLogs();
    bytes32 _trade = keccak256("Trade(bytes32,address,bool,uint256,uint256,uint256)");
    for (uint256 _i; _i < _logs.length; ++_i) {
      if (_logs[_i].emitter != address(hook) || _logs[_i].topics[0] != _trade) continue;
      bool _isBuy;
      (_isBuy, _in,, _fee) = abi.decode(_logs[_i].data, (bool, uint256, uint256, uint256));
      assertTrue(_isBuy);
      return (_in, _fee);
    }
    fail();
  }

  function _pending(address _base) internal view returns (uint256) {
    return burner.pending(_base);
  }

  // ---- tests

  function test_a_launch_on_each_base_and_both_orderings_burns_5_dollars_of_sc_and_locks_the_supply() public {
    address[3] memory _bases = [WETH, ZC, SC];
    for (uint256 _b; _b < 3; ++_b) {
      for (uint256 _o; _o < 2; ++_o) {
        address _c = _creator(_bases[_b], _o == 0);
        uint256 _dead = IERC20(SC).balanceOf(DEAD);
        (address _token, PoolKey memory _key) = _launch(_c, _bases[_b], 10_000, 0);
        // the burn happened and the extra 0.01 ETH came back
        assertGt(IERC20(SC).balanceOf(DEAD) - _dead, 1000 ether);
        assertEq(_c.balance, 10 ether - factory.ethForBurn());
        assertEq(factory.realmOf(_token), _c);
        // nearly all of the supply sits in the pool; the hook keeps at most rounding dust
        assertLt(IERC20(_token).balanceOf(address(hook)), 1e9);
        assertEq(Currency.unwrap(_key.currency0) == _bases[_b], _bases[_b] < _token);
      }
    }
  }

  function test_trades_through_the_stockereum_router_send_every_fee_to_the_burner() public {
    (address _token, PoolKey memory _key) = _launch(_creator(WETH, true), WETH, 10_000, 0);
    vm.warp(block.timestamp + 21);
    vm.prank(buyer);
    uint256 _got = ROUTER.buyWethPairWithEth{value: 1 ether}(_key, 0, "");
    assertGt(_got, 0);
    assertEq(_pending(WETH), 0.01 ether);

    vm.startPrank(buyer);
    IERC20(_token).approve(address(ROUTER), _got);
    ROUTER.sell(_key, _token, WETH, _got / 2, 0, "");
    vm.stopPrank();
    assertGt(_pending(WETH), 0.01 ether);
    // the hook itself never holds a claim
    assertEq(PM.balanceOf(address(hook), Currency.wrap(WETH).toId()), 0);
  }

  function test_a_buy_in_the_launch_block_pays_99_percent_and_the_fee_falls_over_20_seconds() public {
    (, PoolKey memory _key) = _launch(_creator(WETH, true), WETH, 10_000, 0);
    vm.prank(buyer);
    ROUTER.buyWethPairWithEth{value: 1 ether}(_key, 0, "");
    assertEq(_pending(WETH), 0.99 ether);
    vm.warp(block.timestamp + 10);
    vm.prank(buyer);
    ROUTER.buyWethPairWithEth{value: 1 ether}(_key, 0, "");
    assertEq(_pending(WETH), 0.99 ether + 0.5 ether);
    vm.warp(block.timestamp + 10);
    vm.prank(buyer);
    ROUTER.buyWethPairWithEth{value: 1 ether}(_key, 0, "");
    assertEq(_pending(WETH), 0.99 ether + 0.5 ether + 0.01 ether);
  }

  function test_the_creators_first_buy_pays_the_pool_rate_not_the_launch_rate() public {
    address _c = _creator(ZC, false);
    vm.recordLogs();
    (address _token,) = _launch(_c, ZC, 20_000, 0.1 ether);
    assertGt(IERC20(_token).balanceOf(_c), 0);
    // the hook's Trade log for the creator's buy: 2% of the ZC it put in, not 99%
    Vm.Log[] memory _logs = vm.getRecordedLogs();
    bytes32 _trade = keccak256("Trade(bytes32,address,bool,uint256,uint256,uint256)");
    for (uint256 _i; _i < _logs.length; ++_i) {
      if (_logs[_i].emitter != address(hook) || _logs[_i].topics[0] != _trade) continue;
      (bool _buy, uint256 _in,, uint256 _fee) = abi.decode(_logs[_i].data, (bool, uint256, uint256, uint256));
      assertTrue(_buy);
      assertEq(_fee, _in * 20_000 / 1_000_000);
      assertEq(_pending(ZC), _fee);
      return;
    }
    fail();
  }

  function test_nobody_can_add_liquidity_or_swap_exact_output_on_a_realm_pool() public {
    (, PoolKey memory _key) = _launch(_creator(WETH, true), WETH, 10_000, 0);
    Intruder _x = new Intruder(PM);
    // the PoolManager wraps the hook's refusal
    vm.expectPartialRevert(CustomRevert.WrappedError.selector);
    _x.poke(_key, 0);
    vm.expectPartialRevert(CustomRevert.WrappedError.selector);
    _x.poke(_key, 1);
    // nobody else can open a pool on this hook
    PoolKey memory _other =
      PoolKey(Currency.wrap(address(0xBEEF)), Currency.wrap(address(0xCAFE)), 0, 200, IHooks(address(hook)));
    vm.expectRevert();
    PM.initialize(_other, TickMath.getSqrtPriceAtTick(0));
  }

  function test_the_burner_turns_fees_into_burned_sc_and_zc_and_only_the_keeper_can() public {
    (address _token, PoolKey memory _key) = _launch(_creator(WETH, false), WETH, 30_000, 0);
    vm.warp(block.timestamp + 21);
    vm.prank(buyer);
    ROUTER.buyWethPairWithEth{value: 2 ether}(_key, 0, "");
    uint256 _fees = _pending(WETH);
    assertEq(_fees, 0.06 ether);
    _token;

    vm.prank(buyer);
    vm.expectRevert(RealmBurner.NotKeeper.selector);
    burner.convert(WETH, _fees, 0, 0);
    vm.expectRevert(RealmBurner.TooLittle.selector);
    burner.convert(WETH, _fees, type(uint256).max, 0);

    uint256 _sc = IERC20(SC).balanceOf(DEAD);
    uint256 _zc = IERC20(ZC).balanceOf(DEAD);
    vm.recordLogs();
    burner.convert(WETH, _fees, 1, 1);
    assertEq(_pending(WETH), 0);
    Vm.Log[] memory _logs = vm.getRecordedLogs();
    (uint256 _amount, uint256 _scBurned, uint256 _zcBurned) =
      abi.decode(_logs[_logs.length - 1].data, (uint256, uint256, uint256));
    assertEq(_amount, _fees);
    assertEq(IERC20(SC).balanceOf(DEAD) - _sc, _scBurned);
    assertEq(IERC20(ZC).balanceOf(DEAD) - _zc, _zcBurned);
    assertGt(_scBurned, 0);
    assertGt(_zcBurned, 0);
  }

  function test_fees_taken_in_sc_burn_80_percent_as_they_are() public {
    (address _token, PoolKey memory _key) = _launch(_creator(SC, true), SC, 10_000, 0);
    _token;
    vm.warp(block.timestamp + 21);
    deal(SC, buyer, 1_000_000 ether);
    vm.startPrank(buyer);
    IERC20(SC).approve(address(ROUTER), type(uint256).max);
    ROUTER.buy(_key, SC, 1_000_000 ether, 0, "");
    vm.stopPrank();
    uint256 _fees = _pending(SC);
    assertEq(_fees, 10_000 ether);
    uint256 _sc = IERC20(SC).balanceOf(DEAD);
    burner.convert(SC, _fees, 1, 1);
    assertEq(IERC20(SC).balanceOf(DEAD) - _sc, 8000 ether);
  }

  function test_every_base_and_ordering_trades_both_ways_with_every_fee_to_the_burner() public {
    address[3] memory _bases = [WETH, ZC, SC];
    for (uint256 _b; _b < 3; ++_b) {
      for (uint256 _o; _o < 2; ++_o) {
        address _base = _bases[_b];
        (address _token, PoolKey memory _key) = _launch(_creator(_base, _o == 0), _base, 20_000, 0);
        vm.warp(block.timestamp + 21);
        uint256 _before = _pending(_base);
        uint256 _amount = _base == WETH ? 1 ether : 100_000 ether;
        uint256 _got = _buy(_key, _base, _amount);
        assertEq(_pending(_base) - _before, _amount * 2 / 100);
        uint256 _mid = _pending(_base);
        uint256 _out = _sell(_key, _token, _base, _got);
        uint256 _sellFee = _pending(_base) - _mid;
        assertApproxEqRel(_sellFee, (_out + _sellFee) * 2 / 100, 1e12);
        assertEq(PM.balanceOf(address(hook), Currency.wrap(_base).toId()), 0);
        assertEq(IERC20(_base).balanceOf(address(hook)), 0);
      }
    }
  }

  function test_a_uniswap_protocol_fee_changes_nothing_for_the_burner() public {
    (address _token, PoolKey memory _key) = _launch(_creator(WETH, true), WETH, 10_000, 0);
    address _controller = IProtocolFees(address(PM)).protocolFeeController();
    vm.prank(_controller);
    IProtocolFees(address(PM)).setProtocolFee(_key, uint24(1000 | (1000 << 12)));
    vm.warp(block.timestamp + 21);
    uint256 _got = _buy(_key, WETH, 1 ether);
    assertEq(_pending(WETH), 0.01 ether);
    _sell(_key, _token, WETH, _got / 2);
    assertGt(_pending(WETH), 0.01 ether);
  }

  function test_the_creators_first_buy_pays_the_pool_rate_on_eth_and_sc_too() public {
    address[2] memory _bases = [SC, WETH];
    for (uint256 _b; _b < 2; ++_b) {
      for (uint256 _o; _o < 2; ++_o) {
        address _c = _creator(_bases[_b], _o == 0);
        uint256 _before = _pending(_bases[_b]);
        vm.recordLogs();
        (address _token,) = _launch(_c, _bases[_b], 10_000, 0.05 ether);
        assertGt(IERC20(_token).balanceOf(_c), 0);
        (uint256 _in, uint256 _fee) = _devTrade();
        assertEq(_fee, _in * 10_000 / 1_000_000);
        assertEq(_pending(_bases[_b]) - _before, _fee);
      }
    }
  }

  function test_anyone_else_in_the_launch_block_still_pays_99_percent() public {
    (, PoolKey memory _key) = _launch(_creator(ZC, true), ZC, 10_000, 0.05 ether);
    uint256 _before = _pending(ZC);
    _buy(_key, ZC, 100_000 ether);
    assertEq(_pending(ZC) - _before, 99_000 ether);
  }

  function test_fees_taken_in_zc_burn_20_percent_as_they_are() public {
    (, PoolKey memory _key) = _launch(_creator(ZC, false), ZC, 10_000, 0);
    vm.warp(block.timestamp + 21);
    _buy(_key, ZC, 1_000_000 ether);
    uint256 _fees = _pending(ZC);
    assertEq(_fees, 10_000 ether);
    uint256 _zc = IERC20(ZC).balanceOf(DEAD);
    burner.convert(ZC, _fees / 2, 1, 1);
    assertEq(_pending(ZC), _fees / 2);
    assertEq(IERC20(ZC).balanceOf(DEAD) - _zc, _fees / 2 * 20 / 100);
    assertEq(IERC20(ZC).balanceOf(address(burner)), 0);
    assertEq(IERC20(SC).balanceOf(address(burner)), 0);
    vm.expectRevert();
    burner.convert(ZC, _fees, 0, 0);
  }

  function test_an_opening_value_that_would_strand_the_supply_is_refused() public {
    address _c = _creator(WETH, false);
    vm.deal(_c, 1 ether);
    uint256 _value = factory.ethForBurn() + 0.01 ether;
    vm.prank(_c);
    vm.expectRevert();
    factory.launch{value: _value}(RealmFactory.LaunchParams("A", "A", "", WETH, 10_000, 1e52, 1, 0, 0));
  }

  function test_the_burners_owner_can_only_change_the_keeper() public {
    vm.expectRevert(RealmBurner.CannotRenounce.selector);
    burner.renounceOwnership();
    vm.prank(buyer);
    vm.expectRevert();
    burner.setKeeper(buyer);
    burner.setKeeper(buyer);
    assertEq(burner.keeper(), buyer);
  }

  function test_stocker_pairs_launch_trade_and_burn_their_fees() public {
    for (uint256 _o; _o < 2; ++_o) {
      address _c = _creator(STOCKER, _o == 0);
      uint256 _dead = IERC20(SC).balanceOf(DEAD);
      vm.recordLogs();
      (address _token, PoolKey memory _key) = _launch(_c, STOCKER, 10_000, 0.05 ether);
      assertGt(IERC20(SC).balanceOf(DEAD) - _dead, 1000 ether);
      // the creator's buy went ETH → STOCKER → token and paid the pool rate
      (uint256 _in, uint256 _fee) = _devTrade();
      assertEq(_fee, _in / 100);
      assertGt(IERC20(_token).balanceOf(_c), 0);

      vm.warp(block.timestamp + 21);
      uint256 _before = _pending(STOCKER);
      uint256 _got = _buy(_key, STOCKER, 100_000 ether);
      assertEq(_pending(STOCKER) - _before, 1000 ether);
      _sell(_key, _token, STOCKER, _got / 2);
      assertEq(PM.balanceOf(address(hook), Currency.wrap(STOCKER).toId()), 0);
    }
    uint256 _fees = _pending(STOCKER);
    uint256 _sc = IERC20(SC).balanceOf(DEAD);
    uint256 _zc = IERC20(ZC).balanceOf(DEAD);
    burner.convert(STOCKER, _fees, 1, 1);
    assertEq(_pending(STOCKER), 0);
    assertGt(IERC20(SC).balanceOf(DEAD), _sc);
    assertGt(IERC20(ZC).balanceOf(DEAD), _zc);
    assertEq(IERC20(STOCKER).balanceOf(address(burner)), 0);
  }

  function test_a_stale_eth_price_stops_launches() public {
    (, int256 _answer,,,) = IChainlink(factory.ETH_USD()).latestRoundData();
    vm.mockCall(
      factory.ETH_USD(),
      abi.encodeWithSelector(IChainlink.latestRoundData.selector),
      abi.encode(uint80(1), _answer, block.timestamp - 4 hours, block.timestamp - 4 hours, uint80(1))
    );
    vm.expectRevert(RealmFactory.StaleFeed.selector);
    factory.ethForBurn();
  }

  function test_only_the_factory_opens_pools_and_bases_and_fees_are_fixed() public {
    address _c = _creator(WETH, true);
    vm.deal(_c, 1 ether);
    vm.startPrank(_c);
    vm.expectRevert(RealmFactory.BadFee.selector);
    factory.launch{value: 0.1 ether}(RealmFactory.LaunchParams("A", "A", "", WETH, 15_000, 1 ether, 0, 0, 0));
    vm.expectRevert(RealmFactory.BadBase.selector);
    factory.launch{value: 0.1 ether}(RealmFactory.LaunchParams("A", "A", "", address(0xBEEF), 10_000, 1 ether, 0, 0, 0));
    vm.expectRevert(RealmFactory.NotEnoughEth.selector);
    factory.launch{value: 1}(RealmFactory.LaunchParams("A", "A", "", WETH, 10_000, 1 ether, 0, 0, 0));
    vm.stopPrank();
  }
}

interface IChainlink {
  function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
