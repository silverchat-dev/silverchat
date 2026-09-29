// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {SilverAsk} from "./SilverAsk.sol";

/// @notice Runs against mainnet $ZC at a pinned block; the RPC must serve history. `forge test --match-contract SilverAsk`
contract SilverAskFork is Test {
  IERC20 constant ZC = IERC20(0x4E67DB19044549fF420860834c91b45BaD298722);
  // the Uniswap v4 PoolManager holds the ZC of every v4 pool, a handy faucet on a fork
  address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
  address constant BURN = 0x000000000000000000000000000000000000dEaD;

  SilverAsk ask;
  address treasury = makeAddr("treasury");
  address buyback = makeAddr("buyback");
  address owner = makeAddr("owner");
  address poster = makeAddr("poster");
  address pricer = makeAddr("pricer");
  address asker = makeAddr("asker");
  address alice = makeAddr("alice");
  address bob = makeAddr("bob");

  bytes32 constant CONTENT = keccak256(
    "{\"v\":1,\"questions\":[{\"q\":\"Will ETH be above $5,000 before January?\",\"options\":[\"Yes\",\"No\"]}]}"
  );

  function setUp() public {
    vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://eth.drpc.org")), 26_085_290);
    ask = new SilverAsk(ZC, treasury, buyback, owner, poster, pricer);
    vm.prank(pricer);
    ask.setPrice(3 ether + 7);
    vm.prank(POOL_MANAGER);
    ZC.transfer(asker, 1_000_000 ether);
    vm.prank(asker);
    ZC.approve(address(ask), type(uint256).max);
  }

  function _ask(uint32 _breadth) internal returns (uint256 _id) {
    vm.prank(asker);
    _id = ask.ask(CONTENT, _breadth, 2, 1 days, type(uint256).max);
  }

  function _leaf(address _account, uint256 _amount) internal pure returns (bytes32) {
    return keccak256(bytes.concat(keccak256(abi.encode(_account, _amount))));
  }

  function _pair(bytes32 _a, bytes32 _b) internal pure returns (bytes32) {
    return _a < _b ? keccak256(abi.encode(_a, _b)) : keccak256(abi.encode(_b, _a));
  }

  function _proof(bytes32 _sibling) internal pure returns (bytes32[] memory _p) {
    _p = new bytes32[](1);
    _p[0] = _sibling;
  }

  function test_payment_is_held_then_split_at_finalize() public {
    uint256 _before = ZC.balanceOf(asker);
    uint256 _id = _ask(100);
    uint256 _cost = ask.costOf(100, 2);
    assertEq(_cost, (3 ether + 7) * 150); // not a multiple of 20, so the burn takes the rounding
    assertEq(_before - ZC.balanceOf(asker), _cost);
    assertEq(ZC.balanceOf(address(ask)), _cost);

    uint256 _pool = (_cost * 3500) / 10_000;
    uint256 _paid = (_pool / 100) * 2; // two answerers out of a breadth of 100
    bytes32 _root = _pair(_leaf(alice, _paid / 2), _leaf(bob, _paid / 2));
    uint256 _burnBefore = ZC.balanceOf(BURN);

    vm.warp(vm.getBlockTimestamp() + 1 days + 1);
    vm.prank(poster);
    ask.finalize(_id, keccak256("results"), _root, _paid);

    assertEq(ZC.balanceOf(treasury), (_cost * 2500) / 10_000);
    assertEq(ZC.balanceOf(buyback), (_cost * 2000) / 10_000);
    assertEq(ZC.balanceOf(BURN) - _burnBefore, _cost - _pool - (_cost * 2500) / 10_000 - (_cost * 2000) / 10_000);
    assertEq(ZC.balanceOf(asker), _before - _cost + _pool - _paid);
    assertEq(ZC.balanceOf(address(ask)), _paid);

    ask.claim(_id, alice, _paid / 2, _proof(_leaf(bob, _paid / 2)));
    assertEq(ZC.balanceOf(alice), _paid / 2);
    vm.expectRevert(SilverAsk.AlreadyClaimed.selector);
    ask.claim(_id, alice, _paid / 2, _proof(_leaf(bob, _paid / 2)));
  }

  function test_claims_cannot_exceed_reward_total() public {
    uint256 _id = _ask(100);
    uint256 _other = _ask(100); // its money sits in the same contract
    uint256 _big = 100 ether;
    bytes32 _root = _pair(_leaf(alice, _big), _leaf(bob, _big));

    vm.warp(vm.getBlockTimestamp() + 1 days + 1);
    vm.prank(poster);
    ask.finalize(_id, bytes32(0), _root, _big); // tree sums to twice what was declared

    ask.claim(_id, alice, _big, _proof(_leaf(bob, _big)));
    vm.expectRevert(SilverAsk.RewardTooLarge.selector);
    ask.claim(_id, bob, _big, _proof(_leaf(alice, _big)));

    (,,,, uint256 _otherCost,,) = ask.polls(_other);
    assertEq(ZC.balanceOf(address(ask)), _otherCost);
  }

  function test_claim_many() public {
    uint256 _a = _ask(100);
    uint256 _b = _ask(1000);
    vm.warp(vm.getBlockTimestamp() + 1 days + 1);
    vm.startPrank(poster);
    ask.finalize(_a, bytes32(0), _pair(_leaf(alice, 1 ether), _leaf(bob, 1 ether)), 2 ether);
    ask.finalize(_b, bytes32(0), _pair(_leaf(alice, 2 ether), _leaf(bob, 2 ether)), 4 ether);
    vm.stopPrank();

    uint256[] memory _ids = new uint256[](2);
    uint256[] memory _amounts = new uint256[](2);
    bytes32[][] memory _proofs = new bytes32[][](2);
    (_ids[0], _amounts[0], _proofs[0]) = (_a, 1 ether, _proof(_leaf(bob, 1 ether)));
    (_ids[1], _amounts[1], _proofs[1]) = (_b, 2 ether, _proof(_leaf(bob, 2 ether)));
    ask.claimMany(alice, _ids, _amounts, _proofs);
    assertEq(ZC.balanceOf(alice), 3 ether);
  }

  function test_refund_then_finalize_reverts() public {
    uint256 _before = ZC.balanceOf(asker);
    uint256 _id = _ask(100);

    vm.warp(vm.getBlockTimestamp() + 1 days + 7 days);
    vm.prank(asker);
    vm.expectRevert(SilverAsk.TooEarly.selector);
    ask.refund(_id);

    vm.warp(vm.getBlockTimestamp() + 1);
    vm.prank(asker);
    ask.refund(_id);
    assertEq(ZC.balanceOf(asker), _before);

    vm.prank(poster);
    vm.expectRevert(SilverAsk.NotOpen.selector);
    ask.finalize(_id, bytes32(0), bytes32(0), 0);
  }

  function test_sweep_burns_unclaimed_after_90_days() public {
    uint256 _id = _ask(100);
    vm.warp(vm.getBlockTimestamp() + 1 days + 1);
    vm.prank(poster);
    ask.finalize(_id, bytes32(0), _pair(_leaf(alice, 1 ether), _leaf(bob, 1 ether)), 2 ether);

    vm.expectRevert(SilverAsk.TooEarly.selector);
    ask.sweep(_id);

    vm.warp(vm.getBlockTimestamp() + 90 days + 1);
    uint256 _burnBefore = ZC.balanceOf(BURN);
    ask.sweep(_id);
    assertEq(ZC.balanceOf(BURN) - _burnBefore, 2 ether);
    vm.expectRevert(SilverAsk.ClaimWindowClosed.selector);
    ask.claim(_id, alice, 1 ether, _proof(_leaf(bob, 1 ether)));
  }

  function test_limits() public {
    vm.startPrank(asker);
    vm.expectRevert(SilverAsk.BadBreadth.selector);
    ask.ask(CONTENT, 500, 0, 1 days, type(uint256).max);
    vm.expectRevert(SilverAsk.BadPriority.selector);
    ask.ask(CONTENT, 100, 3, 1 days, type(uint256).max);
    vm.expectRevert(SilverAsk.BadDuration.selector);
    ask.ask(CONTENT, 100, 0, 30 minutes, type(uint256).max);
    vm.expectRevert(SilverAsk.BadDuration.selector);
    ask.ask(CONTENT, 100, 0, 31 days, type(uint256).max);
    uint256 _cost = ask.costOf(100, 0);
    vm.expectRevert(abi.encodeWithSelector(SilverAsk.PriceMoved.selector, _cost));
    ask.ask(CONTENT, 100, 0, 1 days, _cost - 1);
    uint256 _id = ask.ask(CONTENT, 100, 0, 1 days, _cost);

    vm.expectRevert(SilverAsk.NotPoster.selector);
    ask.finalize(_id, bytes32(0), bytes32(0), 0);
    vm.expectRevert(SilverAsk.NotPricer.selector);
    ask.setPrice(1);
    vm.stopPrank();

    vm.prank(poster);
    vm.expectRevert(SilverAsk.StillOpen.selector);
    ask.finalize(_id, bytes32(0), bytes32(0), 0);

    vm.warp(vm.getBlockTimestamp() + 1 days + 1);
    vm.startPrank(poster);
    vm.expectRevert(SilverAsk.RewardTooLarge.selector);
    ask.finalize(_id, bytes32(0), bytes32(0), 1);
    vm.expectRevert(SilverAsk.RewardTooLarge.selector);
    ask.finalize(_id, bytes32(0), keccak256("root"), _cost);
    vm.stopPrank();

    vm.prank(pricer);
    ask.setPrice(0);
    vm.expectRevert(SilverAsk.PriceUnset.selector);
    ask.costOf(100, 0);
  }
}
