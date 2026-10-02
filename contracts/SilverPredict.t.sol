// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {IReality, SilverPredict} from "./SilverPredict.sol";

contract Token is ERC20 {
  constructor() ERC20("Token", "TKN") {}

  function mint(address _to, uint256 _amount) external {
    _mint(_to, _amount);
  }
}

contract MockFeed {
  uint16 public phaseId = 2;
  mapping(uint80 => int256) public answers;
  mapping(uint80 => uint256) public times;
  // rounds of a retired aggregator revert past their end, like the real ones
  mapping(uint16 => uint64) public lastOfPhase;

  function setRound(uint80 _id, int256 _answer, uint256 _at) external {
    answers[_id] = _answer;
    times[_id] = _at;
  }

  function retire(uint16 _phase, uint64 _last) external {
    lastOfPhase[_phase] = _last;
  }

  function getRoundData(uint80 _id) external view returns (uint80, int256, uint256, uint256, uint80) {
    uint16 _phase = uint16(_id >> 64);
    if (lastOfPhase[_phase] != 0 && uint64(_id) > lastOfPhase[_phase]) revert("No data present");
    return (_id, answers[_id], times[_id], times[_id], _id);
  }
}

contract MockReality {
  mapping(bytes32 => bytes32) public results;
  mapping(bytes32 => bool) public settled;
  mapping(bytes32 => uint256) public getBond;

  function askQuestionWithMinBond(
    uint256,
    string calldata _q,
    address,
    uint32,
    uint32 _opening,
    uint256 _nonce,
    uint256
  ) external payable returns (bytes32) {
    return keccak256(abi.encode(_q, _opening, _nonce, msg.sender));
  }

  function answer(bytes32 _qid, bytes32 _result) external {
    getBond[_qid] = 0.01 ether;
    results[_qid] = _result;
    settled[_qid] = true;
  }

  function setBond(bytes32 _qid, uint256 _bond) external {
    getBond[_qid] = _bond;
  }

  function resultForOnceSettled(bytes32 _qid) external view returns (bytes32) {
    require(settled[_qid], "question must be finalized");
    return results[_qid];
  }
}

contract SilverPredictTest is Test {
  Token zc;
  Token sc;
  MockFeed feed;
  MockReality reality;
  SilverPredict predict;

  address owner = makeAddr("owner");
  address treasury = makeAddr("treasury");
  address opener = makeAddr("opener");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");
  address carol = makeAddr("carol");
  address constant BURN = 0x000000000000000000000000000000000000dEaD;

  uint32 closesAt;
  uint32 resolvesAt;
  // phase 2, round 10 and 11
  uint80 constant R = (uint80(2) << 64) | 10;

  function setUp() public {
    vm.warp(1_800_000_000);
    zc = new Token();
    sc = new Token();
    feed = new MockFeed();
    reality = new MockReality();
    address[] memory _feeds = new address[](1);
    _feeds[0] = address(feed);
    uint256[] memory _stale = new uint256[](1);
    _stale[0] = 2 hours;
    predict = new SilverPredict(
      IERC20(address(zc)),
      IERC20(address(sc)),
      IReality(address(reality)),
      treasury,
      owner,
      1000 ether,
      5 ether,
      0.01 ether,
      makeAddr("kleros"),
      _feeds,
      _stale
    );
    closesAt = uint32(block.timestamp + 1 days);
    resolvesAt = uint32(block.timestamp + 2 days);

    sc.mint(opener, 10_000 ether);
    vm.prank(opener);
    sc.approve(address(predict), type(uint256).max);
    address[3] memory _people = [alice, bob, carol];
    for (uint256 _i; _i < 3; ++_i) {
      zc.mint(_people[_i], 1000 ether);
      vm.prank(_people[_i]);
      zc.approve(address(predict), type(uint256).max);
    }
  }

  function _commit(uint256 _id, address _who, uint8 _side) internal pure returns (bytes32) {
    return keccak256(abi.encode(_id, _who, _side, _salt(_who)));
  }

  function _salt(address _who) internal pure returns (bytes32) {
    return keccak256(abi.encode("salt", _who));
  }

  function _openPrice(int256 _threshold) internal returns (uint256 _id) {
    vm.prank(opener);
    _id = predict.openPrice(keccak256("eth 4000"), address(feed), _threshold, closesAt, resolvesAt);
  }

  function _openEvent() internal returns (uint256 _id) {
    vm.prank(opener);
    _id = predict.openEvent(unicode"Will it rain?␟weather␟en", closesAt, resolvesAt);
  }

  function _stake(uint256 _id, address _who, uint256 _amount, uint8 _side) internal {
    vm.prank(_who);
    predict.stake(_id, _amount, _commit(_id, _who, _side));
  }

  function _reveal(uint256 _id, address _who, uint8 _side) internal {
    address[] memory _a = new address[](1);
    _a[0] = _who;
    uint8[] memory _s = new uint8[](1);
    _s[0] = _side;
    bytes32[] memory _x = new bytes32[](1);
    _x[0] = _salt(_who);
    predict.reveal(_id, _a, _s, _x);
  }

  /// @dev rounds 10 and 11 bracket the resolve time
  function _bracket(int256 _price) internal {
    feed.setRound(R, _price, resolvesAt - 30 minutes);
    feed.setRound(R + 1, _price + 1, resolvesAt + 30 minutes);
  }

  function _toSettle() internal {
    vm.warp(uint256(closesAt) + predict.REVEAL_WINDOW());
  }

  function test_price_market_pays_the_winners_and_takes_the_fee_once() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 300 ether, 1);
    _stake(_id, carol, 200 ether, 2);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    _reveal(_id, bob, 1);
    _reveal(_id, carol, 2);
    _bracket(4100e8);
    _toSettle();
    predict.settlePrice(_id, R);

    SilverPredict.Market memory _m = predict.market(_id);
    assertEq(uint8(_m.status), uint8(SilverPredict.Status.Yes));
    assertEq(zc.balanceOf(BURN), 6 ether);
    assertEq(zc.balanceOf(treasury), 6 ether);
    assertEq(_m.payout, 588 ether);

    vm.prank(alice);
    predict.claim(_id);
    vm.prank(bob);
    predict.claim(_id);
    assertEq(zc.balanceOf(alice), 900 ether + 147 ether);
    assertEq(zc.balanceOf(bob), 700 ether + 441 ether);
    vm.prank(carol);
    vm.expectRevert(SilverPredict.NothingToClaim.selector);
    predict.claim(_id);
    vm.prank(alice);
    vm.expectRevert(SilverPredict.AlreadyClaimed.selector);
    predict.claim(_id);
    assertEq(zc.balanceOf(address(predict)), 0);
    vm.expectRevert(SilverPredict.NotOpen.selector);
    predict.settlePrice(_id, R);
    vm.warp(uint256(resolvesAt) + 180 days);
    vm.expectRevert(SilverPredict.NotOpen.selector);
    predict.voidMarket(_id);
  }

  function test_rounding_never_pays_more_than_the_pool() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 7 ether + 1, 2);
    _stake(_id, bob, 11 ether + 3, 2);
    _stake(_id, carol, 13 ether + 7, 1);
    vm.warp(closesAt);
    _reveal(_id, alice, 2);
    _reveal(_id, bob, 2);
    _reveal(_id, carol, 1);
    _bracket(3999e8);
    _toSettle();
    predict.settlePrice(_id, R);
    vm.prank(alice);
    predict.claim(_id);
    vm.prank(bob);
    predict.claim(_id);
    // what is left is the rounding dust, never a deficit
    assertLt(zc.balanceOf(address(predict)), 3);
  }

  function test_no_revealed_winner_refunds_everyone_and_late_reveals_fail() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 100 ether, 2);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    _toSettle();
    // bob would have won, but too late
    vm.expectRevert(SilverPredict.NotRevealing.selector);
    _reveal(_id, bob, 2);
    _bracket(3000e8);
    predict.settlePrice(_id, R);

    // NO won, but nobody revealed NO: everyone gets the stake back, unrevealed too, no fee
    SilverPredict.Market memory _m = predict.market(_id);
    assertTrue(_m.refund);
    vm.prank(bob);
    predict.claim(_id);
    assertEq(zc.balanceOf(bob), 1000 ether);
    assertEq(zc.balanceOf(treasury), 0);
  }

  function test_unrevealed_stakes_go_to_the_winners() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 100 ether, 2);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    _bracket(5000e8);
    _toSettle();
    predict.settlePrice(_id, R);
    vm.prank(alice);
    predict.claim(_id);
    assertEq(zc.balanceOf(alice), 900 ether + 196 ether);
    vm.prank(bob);
    vm.expectRevert(SilverPredict.NothingToClaim.selector);
    predict.claim(_id);
  }

  function test_one_sided_pool_is_refunded_without_a_fee() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 50 ether, 1);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    _reveal(_id, bob, 1);
    _bracket(5000e8);
    _toSettle();
    predict.settlePrice(_id, R);
    assertTrue(predict.market(_id).refund);
    vm.prank(bob);
    predict.claim(_id);
    assertEq(zc.balanceOf(bob), 1000 ether);
    assertEq(zc.balanceOf(BURN), 0);
  }

  function test_the_round_must_bracket_the_resolve_time() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _bracket(4100e8);
    feed.setRound(R - 1, 3900e8, resolvesAt - 90 minutes);
    _toSettle();
    // R-1 is not the latest round at resolve time
    vm.expectRevert(SilverPredict.BadRound.selector);
    predict.settlePrice(_id, R - 1);
    // R+1 is after it
    vm.expectRevert(SilverPredict.BadRound.selector);
    predict.settlePrice(_id, R + 1);
    // the next round does not exist yet
    feed.setRound(R + 1, 0, 0);
    vm.expectRevert(SilverPredict.BadRound.selector);
    predict.settlePrice(_id, R);
  }

  function test_a_dead_feed_voids_the_market() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    feed.setRound(R, 4100e8, resolvesAt - 3 hours);
    feed.setRound(R + 1, 4100e8, resolvesAt + 1);
    _toSettle();
    predict.settlePrice(_id, R);
    SilverPredict.Market memory _m = predict.market(_id);
    assertEq(uint8(_m.status), uint8(SilverPredict.Status.Void));
    assertTrue(_m.refund);
    assertFalse(_m.invalid);
    vm.prank(alice);
    predict.claim(_id);
    assertEq(zc.balanceOf(alice), 1000 ether);
  }

  function test_a_zero_or_negative_price_voids_the_market() public {
    uint256 _id = _openPrice(4000e8);
    _bracket(0);
    _toSettle();
    predict.settlePrice(_id, R);
    assertEq(uint8(predict.market(_id).status), uint8(SilverPredict.Status.Void));
  }

  function test_the_owner_cannot_change_the_staleness_of_an_open_market() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 100 ether, 2);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    _reveal(_id, bob, 2);
    vm.prank(owner);
    predict.setFeed(address(feed), 0);
    _bracket(4100e8);
    _toSettle();
    predict.settlePrice(_id, R);
    assertEq(uint8(predict.market(_id).status), uint8(SilverPredict.Status.Yes));
    // and new markets cannot use the feed any more
    vm.prank(opener);
    vm.expectRevert(SilverPredict.FeedNotAllowed.selector);
    predict.openPrice(bytes32(0), address(feed), 1, uint32(block.timestamp + 1 days), uint32(block.timestamp + 2 days));
  }

  function test_a_reveal_batch_skips_revealed_stakes_and_fails_whole_on_a_bad_salt() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 100 ether, 2);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    address[] memory _who = new address[](2);
    (_who[0], _who[1]) = (alice, bob);
    uint8[] memory _sides = new uint8[](2);
    (_sides[0], _sides[1]) = (1, 2);
    bytes32[] memory _salts = new bytes32[](2);
    (_salts[0], _salts[1]) = (_salt(alice), bytes32("wrong"));
    vm.expectRevert(SilverPredict.BadReveal.selector);
    predict.reveal(_id, _who, _sides, _salts);
    assertEq(predict.market(_id).no, 0);
    _salts[1] = _salt(bob);
    predict.reveal(_id, _who, _sides, _salts);
    // alice counted once
    assertEq(predict.market(_id).yes, 100 ether);
    assertEq(predict.market(_id).no, 100 ether);
  }

  function test_proof_across_an_aggregator_change() public {
    uint256 _id = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    // phase 2 ends with round 10 before the time; phase 3 starts after it
    feed.setRound(R, 4100e8, resolvesAt - 30 minutes);
    feed.retire(2, 10);
    uint80 _first3 = (uint80(3) << 64) | 1;
    feed.setRound(_first3, 4200e8, resolvesAt + 10 minutes);
    vm.store(address(feed), bytes32(0), bytes32(uint256(3)));
    assertEq(feed.phaseId(), 3);
    _toSettle();
    predict.settlePrice(_id, R);
    assertEq(uint8(predict.market(_id).status), uint8(SilverPredict.Status.Yes));
  }

  function test_an_old_phase_round_is_refused_when_the_new_phase_covers_the_time() public {
    uint256 _id = _openPrice(4000e8);
    _bracket(4100e8);
    uint80 _first3 = (uint80(3) << 64) | 1;
    feed.setRound(_first3, 3000e8, resolvesAt - 10 minutes);
    vm.store(address(feed), bytes32(0), bytes32(uint256(3)));
    _toSettle();
    vm.expectRevert(SilverPredict.BadRound.selector);
    predict.settlePrice(_id, R);
  }

  function test_event_market_settles_on_the_reality_answer() public {
    uint256 _id = _openEvent();
    _stake(_id, alice, 100 ether, 2);
    _stake(_id, bob, 100 ether, 1);
    vm.warp(closesAt);
    _reveal(_id, alice, 2);
    _reveal(_id, bob, 1);
    _toSettle();
    bytes32 _qid = predict.market(_id).questionId;
    vm.expectRevert("question must be finalized");
    predict.settleEvent(_id);
    reality.answer(_qid, bytes32(0));
    predict.settleEvent(_id);
    assertEq(uint8(predict.market(_id).status), uint8(SilverPredict.Status.No));
    vm.prank(alice);
    predict.claim(_id);
    assertEq(zc.balanceOf(alice), 900 ether + 196 ether);
  }

  function test_invalid_answer_voids_and_sends_the_lock_to_the_treasury() public {
    uint256 _id = _openEvent();
    _stake(_id, alice, 100 ether, 1);
    _toSettle();
    reality.answer(predict.market(_id).questionId, bytes32(type(uint256).max));
    predict.settleEvent(_id);
    SilverPredict.Market memory _m = predict.market(_id);
    assertEq(uint8(_m.status), uint8(SilverPredict.Status.Void));
    assertTrue(_m.invalid);
    vm.prank(alice);
    predict.claim(_id);
    assertEq(zc.balanceOf(alice), 1000 ether);
    predict.claimLock(_id);
    assertEq(sc.balanceOf(treasury), 1000 ether);
    vm.expectRevert(SilverPredict.AlreadyClaimed.selector);
    predict.claimLock(_id);
  }

  function test_lock_goes_back_to_the_opener_after_a_result() public {
    uint256 _id = _openEvent();
    vm.expectRevert(SilverPredict.NotSettled.selector);
    predict.claimLock(_id);
    _toSettle();
    reality.answer(predict.market(_id).questionId, bytes32(uint256(1)));
    predict.settleEvent(_id);
    predict.claimLock(_id);
    assertEq(sc.balanceOf(opener), 10_000 ether);
  }

  function test_the_owner_sweeps_only_what_is_not_owed() public {
    uint256 _id = _openPrice(4000e8);
    uint256 _refunded = _openPrice(4000e8);
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 300 ether, 1);
    _stake(_id, carol, 200 ether, 2);
    _stake(_refunded, alice, 10 ether, 1);
    // rewards SC's hook pays to the locks, and tokens sent by mistake
    Token _other = new Token();
    zc.mint(address(predict), 50 ether);
    sc.mint(address(predict), 7 ether);
    _other.mint(address(predict), 9 ether);

    vm.expectRevert();
    predict.sweep(IERC20(address(zc)));
    vm.startPrank(owner);
    predict.sweep(IERC20(address(zc)));
    predict.sweep(IERC20(address(sc)));
    predict.sweep(IERC20(address(_other)));
    vm.expectRevert(SilverPredict.NothingToSweep.selector);
    predict.sweep(IERC20(address(zc)));
    vm.stopPrank();
    assertEq(zc.balanceOf(treasury), 50 ether);
    assertEq(sc.balanceOf(treasury), 7 ether);
    assertEq(_other.balanceOf(treasury), 9 ether);

    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    _reveal(_id, bob, 1);
    _reveal(_id, carol, 2);
    _bracket(4100e8);
    _toSettle();
    predict.settlePrice(_id, R);
    predict.settlePrice(_refunded, R);
    // after the fee, before any claim
    zc.mint(address(predict), 5 ether);
    vm.prank(owner);
    predict.sweep(IERC20(address(zc)));
    assertEq(zc.balanceOf(treasury), 50 ether + 6 ether + 5 ether);

    vm.startPrank(alice);
    predict.claim(_id);
    predict.claim(_refunded);
    vm.stopPrank();
    vm.prank(bob);
    predict.claim(_id);
    predict.claimLock(_id);
    predict.claimLock(_refunded);
    assertEq(zc.balanceOf(alice), 1000 ether - 100 ether + 147 ether);
    assertEq(zc.balanceOf(bob), 700 ether + 441 ether);
    assertEq(sc.balanceOf(opener), 10_000 ether);
    assertEq(predict.zcOwed(), 0);
    assertEq(predict.scLocked(), 0);
    assertEq(zc.balanceOf(address(predict)), 0);
    assertEq(sc.balanceOf(address(predict)), 0);
  }

  function test_unanswered_event_voids_after_30_days_and_refunds_everyone() public {
    uint256 _id = _openEvent();
    _stake(_id, alice, 100 ether, 1);
    _stake(_id, bob, 100 ether, 2);
    vm.warp(closesAt);
    _reveal(_id, alice, 1);
    vm.warp(uint256(resolvesAt) + 30 days - 1);
    vm.expectRevert(SilverPredict.TooEarly.selector);
    predict.voidMarket(_id);
    vm.warp(uint256(resolvesAt) + 30 days);
    predict.voidMarket(_id);
    // unrevealed bob gets his stake back on a void
    vm.prank(bob);
    predict.claim(_id);
    assertEq(zc.balanceOf(bob), 1000 ether);
    predict.claimLock(_id);
    assertEq(sc.balanceOf(opener), 10_000 ether);
  }

  function test_an_answered_event_cannot_be_voided_early() public {
    uint256 _id = _openEvent();
    bytes32 _qid = predict.market(_id).questionId;
    vm.warp(uint256(resolvesAt) + 30 days);
    reality.setBond(_qid, 0.02 ether);
    vm.expectRevert(SilverPredict.TooEarly.selector);
    predict.voidMarket(_id);
    // the hard stop ends it
    vm.warp(uint256(resolvesAt) + 180 days);
    predict.voidMarket(_id);
  }

  function test_a_settleable_event_is_never_voided() public {
    uint256 _id = _openEvent();
    reality.answer(predict.market(_id).questionId, bytes32(uint256(1)));
    vm.warp(uint256(resolvesAt) + 180 days);
    vm.expectRevert(SilverPredict.Settleable.selector);
    predict.voidMarket(_id);
    predict.settleEvent(_id);
  }

  function test_price_market_voids_only_at_the_hard_stop() public {
    uint256 _id = _openPrice(4000e8);
    vm.warp(uint256(resolvesAt) + 180 days - 1);
    vm.expectRevert(SilverPredict.TooEarly.selector);
    predict.voidMarket(_id);
    vm.warp(uint256(resolvesAt) + 180 days);
    predict.voidMarket(_id);
  }

  function test_guards() public {
    vm.startPrank(opener);
    vm.expectRevert(SilverPredict.BadTimes.selector);
    predict.openPrice(bytes32(0), address(feed), 1, uint32(block.timestamp + 10 minutes), resolvesAt);
    vm.expectRevert(SilverPredict.BadTimes.selector);
    predict.openPrice(bytes32(0), address(feed), 1, resolvesAt, closesAt);
    vm.expectRevert(SilverPredict.BadTimes.selector);
    predict.openPrice(bytes32(0), address(feed), 1, closesAt, uint32(block.timestamp + 365 days));
    vm.expectRevert(SilverPredict.FeedNotAllowed.selector);
    predict.openPrice(bytes32(0), makeAddr("fake feed"), 1, closesAt, resolvesAt);
    vm.stopPrank();

    uint256 _id = _openPrice(4000e8);
    vm.prank(alice);
    vm.expectRevert(SilverPredict.StakeTooSmall.selector);
    predict.stake(_id, 5 ether - 1, bytes32(uint256(1)));
    _stake(_id, alice, 10 ether, 1);
    vm.prank(alice);
    vm.expectRevert(SilverPredict.AlreadyStaked.selector);
    predict.stake(_id, 10 ether, bytes32(uint256(1)));

    // too early to reveal, and too early to settle
    vm.expectRevert(SilverPredict.NotRevealing.selector);
    _reveal(_id, alice, 1);
    _bracket(4100e8);
    vm.expectRevert(SilverPredict.TooEarly.selector);
    predict.settlePrice(_id, R);

    vm.warp(closesAt);
    vm.prank(bob);
    vm.expectRevert(SilverPredict.StakingClosed.selector);
    predict.stake(_id, 10 ether, bytes32(uint256(1)));
    // the other side does not open the seal
    vm.expectRevert(SilverPredict.BadReveal.selector);
    _reveal(_id, alice, 2);
    vm.expectRevert(SilverPredict.BadSide.selector);
    _reveal(_id, alice, 3);
    vm.expectRevert(SilverPredict.WrongKind.selector);
    predict.settleEvent(_id);

    vm.prank(alice);
    vm.expectRevert();
    predict.setMinStake(0);
  }
}
