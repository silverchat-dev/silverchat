// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {IFeed, IReality, SilverPredict} from "./SilverPredict.sol";

/// @dev Moves a market's times into the past, so a real feed's history can settle it
contract PredictHarness is SilverPredict {
  constructor(
    IERC20 _zc,
    IERC20 _sc,
    IReality _reality,
    address _treasury,
    address[] memory _feeds,
    uint256[] memory _stale
  ) SilverPredict(_zc, _sc, _reality, _treasury, msg.sender, 1000 ether, 5 ether, 0.01 ether, KLEROS, _feeds, _stale) {}

  address constant KLEROS = 0xFf32eff53459485074b4Db14633252C9dcA3791A;

  function backdate(uint256 _id, uint32 _closesAt, uint32 _resolvesAt) external {
    markets[_id].closesAt = _closesAt;
    markets[_id].resolvesAt = _resolvesAt;
  }
}

interface IRealityAnswer {
  function submitAnswer(bytes32 _questionId, bytes32 _answer, uint256 _maxPrevious) external payable;
}

/// @notice Real ZC, SC, Chainlink ETH/USD and Reality.eth v3.0 at a pinned block. `forge test --match-contract SilverPredictFork`
contract SilverPredictFork is Test {
  IERC20 constant ZC = IERC20(0x4E67DB19044549fF420860834c91b45BaD298722);
  IERC20 constant SC = IERC20(0x3C3959052f60cbddC498b384958841b718112353);
  IFeed constant ETH_USD = IFeed(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
  address constant REALITY = 0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c;
  address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;

  PredictHarness predict;
  address treasury = makeAddr("treasury");
  address opener = makeAddr("opener");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");

  function setUp() public {
    vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://eth.drpc.org")), 26_099_600);
    address[] memory _feeds = new address[](1);
    _feeds[0] = address(ETH_USD);
    uint256[] memory _stale = new uint256[](1);
    _stale[0] = 2 hours;
    predict = new PredictHarness(ZC, SC, IReality(REALITY), treasury, _feeds, _stale);

    vm.startPrank(POOL_MANAGER);
    SC.transfer(opener, 10_000 ether);
    ZC.transfer(alice, 1000 ether);
    ZC.transfer(bob, 1000 ether);
    vm.stopPrank();
    vm.prank(opener);
    SC.approve(address(predict), type(uint256).max);
    vm.prank(alice);
    ZC.approve(address(predict), type(uint256).max);
    vm.prank(bob);
    ZC.approve(address(predict), type(uint256).max);
  }

  function _seal(uint256 _id, address _who, uint8 _side) internal {
    vm.prank(_who);
    predict.stake(_id, 100 ether, keccak256(abi.encode(_id, _who, _side, bytes32("salt"))));
  }

  function _open(address[] memory _who, uint8[] memory _sides, uint256 _id) internal {
    bytes32[] memory _salts = new bytes32[](_who.length);
    for (uint256 _i; _i < _who.length; ++_i) {
      _salts[_i] = bytes32("salt");
    }
    predict.reveal(_id, _who, _sides, _salts);
  }

  function test_settles_on_the_real_eth_usd_round_at_a_past_time() public {
    uint256 _now = vm.getBlockTimestamp();
    vm.prank(opener);
    uint256 _id =
      predict.openPrice(keccak256("eth"), address(ETH_USD), 1e8, uint32(_now + 1 hours), uint32(_now + 2 hours));
    // the lock arrived in full through SC's transfer hook
    assertEq(predict.market(_id).lock, 1000 ether);
    _seal(_id, alice, 1);
    _seal(_id, bob, 2);

    // stakes are in; open the reveal window now, then pretend the market resolved a day ago
    uint32 _t = uint32(_now - 1 days);
    predict.backdate(_id, uint32(_now), _t);
    address[] memory _who = new address[](2);
    (_who[0], _who[1]) = (alice, bob);
    uint8[] memory _sides = new uint8[](2);
    (_sides[0], _sides[1]) = (1, 2);
    _open(_who, _sides, _id);
    predict.backdate(_id, _t - 4 days, _t);

    // walk back from the latest round to the one that was current at T
    (uint80 _r,,,,) = _latestRound();
    uint256 _at;
    do {
      (,,, _at,) = ETH_USD.getRoundData(_r);
      if (_at > _t) --_r;
    } while (_at > _t);

    vm.expectRevert(SilverPredict.BadRound.selector);
    predict.settlePrice(_id, _r - 1);
    vm.expectRevert(SilverPredict.BadRound.selector);
    predict.settlePrice(_id, _r + 1);
    predict.settlePrice(_id, _r);
    // ETH was above $1 a day ago: YES wins
    assertEq(uint8(predict.market(_id).status), uint8(SilverPredict.Status.Yes));
    vm.prank(alice);
    predict.claim(_id);
    assertEq(ZC.balanceOf(alice), 900 ether + 196 ether);
    predict.claimLock(_id);
    assertEq(SC.balanceOf(opener), 10_000 ether);
  }

  function _latestRound() internal view returns (uint80, int256, uint256, uint256, uint80) {
    (bool _ok, bytes memory _data) = address(ETH_USD).staticcall(abi.encodeWithSignature("latestRoundData()"));
    require(_ok);
    return abi.decode(_data, (uint80, int256, uint256, uint256, uint80));
  }

  function test_event_market_through_real_reality_eth() public {
    uint256 _now = vm.getBlockTimestamp();
    vm.prank(opener);
    uint256 _id = predict.openEvent(
      unicode"Will the Silverchat fork test pass?␟test␟en", uint32(_now + 1 hours), uint32(_now + 2 hours)
    );
    bytes32 _qid = predict.market(_id).questionId;
    assertTrue(_qid != bytes32(0));
    _seal(_id, alice, 1);
    _seal(_id, bob, 2);
    vm.warp(_now + 1 hours);
    address[] memory _who = new address[](2);
    (_who[0], _who[1]) = (alice, bob);
    uint8[] memory _sides = new uint8[](2);
    (_sides[0], _sides[1]) = (1, 2);
    _open(_who, _sides, _id);

    // the question opens at resolve time; then someone answers YES with the minimum bond
    vm.warp(_now + 2 hours);
    address _answerer = makeAddr("answerer");
    vm.deal(_answerer, 1 ether);
    vm.prank(_answerer);
    IRealityAnswer(REALITY).submitAnswer{value: 0.01 ether}(_qid, bytes32(uint256(1)), 0);

    // not final until the 2-day timeout passes
    vm.warp(_now + 2 hours + 2 days - 1);
    vm.expectRevert();
    predict.settleEvent(_id);
    vm.expectRevert(SilverPredict.TooEarly.selector);
    predict.voidMarket(_id);
    vm.warp(_now + 1 hours + 72 hours + 1);
    predict.settleEvent(_id);
    assertEq(uint8(predict.market(_id).status), uint8(SilverPredict.Status.Yes));
    vm.prank(alice);
    predict.claim(_id);
    assertEq(ZC.balanceOf(alice), 900 ether + 196 ether);
  }

  function test_invalid_real_answer_voids_the_market() public {
    uint256 _now = vm.getBlockTimestamp();
    vm.prank(opener);
    uint256 _id =
      predict.openEvent(unicode"Is this question vague?␟test␟en", uint32(_now + 1 hours), uint32(_now + 2 hours));
    bytes32 _qid = predict.market(_id).questionId;
    _seal(_id, alice, 1);
    vm.warp(_now + 2 hours);
    vm.deal(address(this), 1 ether);
    IRealityAnswer(REALITY).submitAnswer{value: 0.01 ether}(_qid, bytes32(type(uint256).max), 0);
    vm.warp(_now + 1 hours + 72 hours + 1);
    predict.settleEvent(_id);
    SilverPredict.Market memory _m = predict.market(_id);
    assertEq(uint8(_m.status), uint8(SilverPredict.Status.Void));
    assertTrue(_m.invalid);
    vm.prank(alice);
    predict.claim(_id);
    assertEq(ZC.balanceOf(alice), 1000 ether);
    predict.claimLock(_id);
    assertEq(SC.balanceOf(treasury), 1000 ether);
  }
}
