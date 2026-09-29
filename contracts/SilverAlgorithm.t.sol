// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {SilverAlgorithm} from "./SilverAlgorithm.sol";

contract SilverAlgorithmTest is Test {
  function test_new_rules_wait_20_days() public {
    address _owner = makeAddr("owner");
    SilverAlgorithm _algo = new SilverAlgorithm(_owner, keccak256("v1"), "v1");
    assertEq(_algo.current(), keccak256("v1"));

    vm.prank(_owner);
    _algo.propose(keccak256("v2"), "v2");
    vm.warp(vm.getBlockTimestamp() + 20 days - 1);
    assertEq(_algo.current(), keccak256("v1"));
    vm.warp(vm.getBlockTimestamp() + 1);
    assertEq(_algo.current(), keccak256("v2"));

    // once current, the owner cannot roll it back by cancelling
    vm.prank(_owner);
    vm.expectRevert(SilverAlgorithm.NothingPending.selector);
    _algo.cancel();

    // a later proposal keeps v2 as current until its own 20 days pass
    vm.prank(_owner);
    _algo.propose(keccak256("v3"), "v3");
    assertEq(_algo.current(), keccak256("v2"));
    vm.prank(_owner);
    _algo.cancel();
    vm.warp(vm.getBlockTimestamp() + 30 days);
    assertEq(_algo.current(), keccak256("v2"));
  }
}
