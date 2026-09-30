// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console} from "forge-std/Script.sol";

import {SilverAlgorithm} from "./SilverAlgorithm.sol";
import {SilverAsk} from "./SilverAsk.sol";

/**
 * @notice Deploys the Silverchat contracts. The deployer keeps no role: every role goes to the addresses in the env.
 *   OWNER TREASURY POSTER PRICER         role addresses (OWNER should be a multisig on mainnet)
 *   RULES_HASH RULES_SOURCE              keccak256 of web/src/lib/algorithm.ts and where to read it
 *   OUT                                  deployment name, written to deployments/<OUT>.json
 *   ZC                                   optional; mainnet ZC by default
 * Run it once without --broadcast and read the addresses it prints: TREASURY can never change.
 * The JSON is written during simulation, so check every address has code before trusting it.
 */
contract Deploy is Script {
  address constant MAINNET_ZC = 0x4E67DB19044549fF420860834c91b45BaD298722;

  function run() external {
    IERC20 _zc = IERC20(vm.envOr("ZC", MAINNET_ZC));
    require(address(_zc).code.length != 0, "no ZC on this chain");
    address _owner = vm.envAddress("OWNER");
    console.log("zc      ", address(_zc));
    console.log("owner   ", _owner);
    console.log("treasury", vm.envAddress("TREASURY"));
    console.log("poster  ", vm.envAddress("POSTER"));
    console.log("pricer  ", vm.envAddress("PRICER"));

    vm.startBroadcast();
    SilverAlgorithm _algorithm = new SilverAlgorithm(_owner, vm.envBytes32("RULES_HASH"), vm.envString("RULES_SOURCE"));
    SilverAsk _ask =
      new SilverAsk(_zc, vm.envAddress("TREASURY"), _owner, vm.envAddress("POSTER"), vm.envAddress("PRICER"));
    vm.stopBroadcast();

    string memory _o = "deployment";
    vm.serializeUint(_o, "chainId", block.chainid);
    vm.serializeAddress(_o, "zc", address(_zc));
    vm.serializeAddress(_o, "ask", address(_ask));
    vm.serializeAddress(_o, "algorithm", address(_algorithm));
    string memory _json = vm.serializeUint(_o, "deployBlock", block.number);
    string memory _file = string.concat("./deployments/", vm.envString("OUT"), ".json");
    vm.writeJson(_json, _file);
    console.log("wrote", _file);
  }
}
