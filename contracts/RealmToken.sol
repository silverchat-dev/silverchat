// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A token launched on SilverRealm: a fixed billion, all of it locked in its pool at launch. No owner, no mint.
contract RealmToken is ERC20 {
  uint256 public constant SUPPLY = 1_000_000_000 ether;

  constructor(string memory _name, string memory _symbol, address _hook) ERC20(_name, _symbol) {
    _mint(_hook, SUPPLY);
  }
}
