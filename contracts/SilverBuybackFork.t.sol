// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {IVenue, SilverBuyback} from "./SilverBuyback.sol";
import {IStockereumRouter, StockereumVenue} from "./StockereumVenue.sol";

/**
 * @notice SC does not exist yet, so this runs the same path on the live ZC/WETH Stockereum pool: the buyback spends
 *         WETH (standing in for ZC) on ZC (standing in for SC) through the real router, then burns it.
 *         `ETH_RPC_URL=<rpc> forge test --match-contract SilverBuyback`
 */
contract SilverBuybackFork is Test {
  IERC20 constant ZC = IERC20(0x4E67DB19044549fF420860834c91b45BaD298722);
  IERC20 constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  IStockereumRouter constant ROUTER = IStockereumRouter(0xcdf832D2C11DA16055bb6C6145cF38EDD7233767);
  address constant HOOK = 0x322dcEc4958C14e021A9F1cD49DF11b9457968cC;
  address constant BURN = 0x000000000000000000000000000000000000dEaD;

  SilverBuyback buyback;
  StockereumVenue venue;
  address owner = makeAddr("owner");
  address keeper = makeAddr("keeper");

  function setUp() public {
    vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://ethereum-rpc.publicnode.com")));
    buyback = new SilverBuyback(WETH, owner, keeper, 1 ether, 1 hours);
    venue = new StockereumVenue(ROUTER, WETH, ZC, HOOK);
    deal(address(WETH), address(buyback), 3 ether);
  }

  function test_buys_through_the_router_and_burns() public {
    vm.prank(keeper);
    vm.expectRevert(SilverBuyback.NoSc.selector);
    buyback.buyback(0.1 ether, 1, block.timestamp);

    vm.prank(owner);
    buyback.setSc(ZC, venue);
    vm.prank(owner);
    vm.expectRevert(SilverBuyback.AlreadySet.selector);
    buyback.setSc(ZC, venue);

    uint256 _burned = ZC.balanceOf(BURN);
    vm.prank(keeper);
    buyback.buyback(0.1 ether, 1, block.timestamp);

    assertGt(ZC.balanceOf(BURN), _burned);
    assertEq(ZC.balanceOf(address(buyback)), 0);
    assertEq(ZC.balanceOf(address(venue)), 0);
    assertEq(WETH.balanceOf(address(buyback)), 2.9 ether);
    assertEq(WETH.allowance(address(buyback), address(venue)), 0);
    assertEq(WETH.allowance(address(venue), address(ROUTER)), 0);
  }

  function test_limits() public {
    vm.prank(owner);
    buyback.setSc(ZC, venue);

    vm.expectRevert(SilverBuyback.NotKeeper.selector);
    buyback.buyback(0.1 ether, 1, block.timestamp);

    vm.startPrank(keeper);
    vm.expectRevert(SilverBuyback.BadAmount.selector);
    buyback.buyback(0.1 ether, 0, block.timestamp);
    vm.expectRevert(SilverBuyback.BadAmount.selector);
    buyback.buyback(1 ether + 1, 1, block.timestamp);
    vm.expectRevert(SilverBuyback.Expired.selector);
    buyback.buyback(0.1 ether, 1, block.timestamp - 1);
    vm.expectRevert(); // the router refuses when the output is short of minOut
    buyback.buyback(0.1 ether, type(uint128).max, block.timestamp);

    buyback.buyback(0.1 ether, 1, block.timestamp);
    vm.expectRevert(SilverBuyback.TooSoon.selector);
    buyback.buyback(0.1 ether, 1, block.timestamp);
    vm.warp(vm.getBlockTimestamp() + 1 hours);
    buyback.buyback(0.1 ether, 1, vm.getBlockTimestamp());
    vm.stopPrank();
  }
}
