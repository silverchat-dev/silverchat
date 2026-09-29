// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {IVenue, SilverBuyback} from "./SilverBuyback.sol";
import {IStockereumRouter, StockereumVenue} from "./StockereumVenue.sol";

/**
 * @notice SC does not exist yet, so a live ZC-paired Stockereum launch stands in for it: the buyback spends ZC on that
 *         token through the real router and burns it, the same path SC will take. Pinned block; the RPC must serve
 *         history. `forge test --match-contract SilverBuyback`
 */
contract SilverBuybackFork is Test {
  IERC20 constant ZC = IERC20(0x4E67DB19044549fF420860834c91b45BaD298722);
  // a token launched on Stockereum paired with ZC, standing in for SC
  IERC20 constant SC = IERC20(0x28C3f001F1b7fB26CbF14f757444C4684d5fBFf5);
  address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
  IStockereumRouter constant ROUTER = IStockereumRouter(0xcdf832D2C11DA16055bb6C6145cF38EDD7233767);
  address constant HOOK = 0x322dcEc4958C14e021A9F1cD49DF11b9457968cC;
  address constant BURN = 0x000000000000000000000000000000000000dEaD;

  SilverBuyback buyback;
  StockereumVenue venue;
  address owner = makeAddr("owner");
  address keeper = makeAddr("keeper");

  function setUp() public {
    vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://eth.drpc.org")), 26_085_290);
    buyback = new SilverBuyback(ZC, owner, keeper, 1000 ether, 1 hours);
    venue = new StockereumVenue(ROUTER, ZC, SC, HOOK);
    vm.prank(POOL_MANAGER);
    ZC.transfer(address(buyback), 3000 ether);
  }

  function test_buys_through_the_router_and_burns() public {
    vm.prank(keeper);
    vm.expectRevert(SilverBuyback.NoSc.selector);
    buyback.buyback(100 ether, 1, block.timestamp);

    vm.prank(owner);
    buyback.setSc(SC, venue);
    vm.prank(owner);
    vm.expectRevert(SilverBuyback.AlreadySet.selector);
    buyback.setSc(SC, venue);

    uint256 _burned = SC.balanceOf(BURN);
    vm.prank(keeper);
    buyback.buyback(100 ether, 1, block.timestamp);

    assertGt(SC.balanceOf(BURN), _burned);
    assertEq(SC.balanceOf(address(buyback)), 0);
    assertEq(SC.balanceOf(address(venue)), 0);
    assertEq(ZC.balanceOf(address(buyback)), 2900 ether);
    assertEq(ZC.allowance(address(buyback), address(venue)), 0);
    assertEq(ZC.allowance(address(venue), address(ROUTER)), 0);
  }

  function test_limits() public {
    vm.prank(owner);
    buyback.setSc(SC, venue);

    vm.expectRevert(SilverBuyback.NotKeeper.selector);
    buyback.buyback(100 ether, 1, block.timestamp);

    vm.startPrank(keeper);
    vm.expectRevert(SilverBuyback.BadAmount.selector);
    buyback.buyback(100 ether, 0, block.timestamp);
    vm.expectRevert(SilverBuyback.BadAmount.selector);
    buyback.buyback(1000 ether + 1, 1, block.timestamp);
    vm.expectRevert(SilverBuyback.Expired.selector);
    buyback.buyback(100 ether, 1, block.timestamp - 1);
    vm.expectRevert(); // the router refuses when the output is short of minOut
    buyback.buyback(100 ether, type(uint128).max, block.timestamp);

    buyback.buyback(100 ether, 1, block.timestamp);
    vm.expectRevert(SilverBuyback.TooSoon.selector);
    buyback.buyback(100 ether, 1, block.timestamp);
    vm.warp(vm.getBlockTimestamp() + 1 hours);
    buyback.buyback(100 ether, 1, vm.getBlockTimestamp());
    vm.stopPrank();
  }
}
