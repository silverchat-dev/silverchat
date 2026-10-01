// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {SilverRiddle} from "./SilverRiddle.sol";

contract Coin is ERC20 {
  constructor() ERC20("Coin", "COIN") {}

  function mint(address _to, uint256 _amount) external {
    _mint(_to, _amount);
  }
}

contract SilverRiddleTest is Test {
  string constant ANSWER = "a made up answer for the tests only";
  bytes32 constant SALT = keccak256("salt");

  Coin sc;
  SilverRiddle riddle;
  address safe = makeAddr("safe");
  address solver = makeAddr("solver");
  address copier = makeAddr("copier");

  function setUp() public {
    sc = new Coin();
    riddle = new SilverRiddle(IERC20(address(sc)), keccak256(bytes(ANSWER)), safe);
    sc.mint(address(riddle), 2_000_000 ether);
  }

  function _commit(address _who, string memory _answer) internal {
    vm.prank(_who);
    riddle.commit(keccak256(abi.encode(_who, _answer, SALT)));
  }

  function _reveal(address _who, string memory _answer) internal {
    vm.prank(_who);
    riddle.reveal(_answer, SALT);
  }

  function test_the_first_right_reveal_takes_the_whole_prize_including_a_top_up() public {
    sc.mint(address(riddle), 5 ether);
    _commit(solver, ANSWER);
    vm.roll(vm.getBlockNumber() + 9);
    vm.expectRevert(SilverRiddle.TooSoon.selector);
    _reveal(solver, ANSWER);
    vm.roll(vm.getBlockNumber() + 1);
    _reveal(solver, ANSWER);
    assertEq(sc.balanceOf(solver), 2_000_005 ether);
    assertTrue(riddle.solved());
    assertEq(riddle.winner(), solver);

    // over: no new commit, no reveal
    vm.prank(copier);
    vm.expectRevert(SilverRiddle.Over.selector);
    riddle.commit(bytes32("late"));
    vm.expectRevert(SilverRiddle.Over.selector);
    _reveal(copier, ANSWER);
  }

  function test_a_wrong_answer_is_refused() public {
    _commit(solver, "not it");
    vm.roll(vm.getBlockNumber() + 10);
    vm.expectRevert(SilverRiddle.WrongAnswer.selector);
    _reveal(solver, "not it");
  }

  function test_a_copied_reveal_from_another_address_is_refused() public {
    _commit(solver, ANSWER);
    // the copier saw the answer and salt in the mempool and holds an old commit of its own
    _commit(copier, "a guess");
    vm.roll(vm.getBlockNumber() + 10);
    vm.expectRevert(SilverRiddle.BadReveal.selector);
    _reveal(copier, ANSWER);
    vm.prank(makeAddr("stranger"));
    vm.expectRevert(SilverRiddle.NoCommit.selector);
    riddle.reveal(ANSWER, SALT);
  }

  function test_reclaim_waits_seven_days_then_closes_the_riddle() public {
    vm.prank(safe);
    vm.expectRevert(SilverRiddle.TooEarly.selector);
    riddle.reclaim();
    vm.expectRevert(SilverRiddle.NotSafe.selector);
    riddle.reclaim();

    _commit(solver, ANSWER);
    vm.warp(riddle.DEADLINE());
    vm.roll(vm.getBlockNumber() + 10);
    vm.prank(safe);
    riddle.reclaim();
    assertEq(sc.balanceOf(safe), 2_000_000 ether);
    vm.expectRevert(SilverRiddle.Over.selector);
    _reveal(solver, ANSWER);
  }

  function test_a_right_reveal_still_wins_after_day_seven_until_the_safe_reclaims() public {
    _commit(solver, ANSWER);
    vm.warp(riddle.DEADLINE() + 1 days);
    vm.roll(vm.getBlockNumber() + 10);
    _reveal(solver, ANSWER);
    assertEq(sc.balanceOf(solver), 2_000_000 ether);
  }

  function test_the_safe_sweeps_other_tokens_but_never_the_prize() public {
    Coin _zc = new Coin();
    _zc.mint(address(riddle), 9 ether);
    vm.expectRevert(SilverRiddle.NotSafe.selector);
    riddle.sweep(IERC20(address(_zc)));
    vm.startPrank(safe);
    vm.expectRevert(SilverRiddle.NotOtherToken.selector);
    riddle.sweep(IERC20(address(sc)));
    riddle.sweep(IERC20(address(_zc)));
    vm.stopPrank();
    assertEq(_zc.balanceOf(safe), 9 ether);
    assertEq(sc.balanceOf(address(riddle)), 2_000_000 ether);
  }

  function test_reclaim_after_a_solve_sweeps_what_was_sent_later() public {
    _commit(solver, ANSWER);
    vm.roll(vm.getBlockNumber() + 10);
    _reveal(solver, ANSWER);
    sc.mint(address(riddle), 7 ether);
    vm.warp(riddle.DEADLINE());
    vm.prank(safe);
    riddle.reclaim();
    assertEq(sc.balanceOf(safe), 7 ether);
  }
}

/// @notice The real $SC and its launchpad hook, moving the full 2,000,000. `forge test --match-contract SilverRiddleFork`
contract SilverRiddleFork is Test {
  IERC20 constant SC = IERC20(0x3C3959052f60cbddC498b384958841b718112353);
  address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
  string constant ANSWER = "a made up answer for the tests only";

  function test_two_million_real_sc_in_and_out() public {
    vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://eth.drpc.org")), 26_099_600);
    address _safe = makeAddr("safe");
    address _solver = makeAddr("fresh solver");
    SilverRiddle _riddle = new SilverRiddle(SC, keccak256(bytes(ANSWER)), _safe);
    vm.prank(POOL_MANAGER);
    SC.transfer(address(_riddle), 2_000_000 ether);
    assertEq(SC.balanceOf(address(_riddle)), 2_000_000 ether);

    vm.prank(_solver);
    _riddle.commit(keccak256(abi.encode(_solver, ANSWER, bytes32("salt"))));
    vm.roll(vm.getBlockNumber() + 10);
    vm.prank(_solver);
    _riddle.reveal(ANSWER, bytes32("salt"));
    assertEq(SC.balanceOf(_solver), 2_000_000 ether);

    // the reclaim path moves 2,000,000 to the Safe through the same hook
    vm.prank(POOL_MANAGER);
    SC.transfer(address(_riddle), 2_000_000 ether);
    vm.warp(_riddle.DEADLINE());
    vm.prank(_safe);
    _riddle.reclaim();
    assertEq(SC.balanceOf(_safe), 2_000_000 ether);
  }
}
