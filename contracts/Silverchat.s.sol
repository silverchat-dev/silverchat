// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console} from "forge-std/Script.sol";

import {SilverAlgorithm} from "./SilverAlgorithm.sol";
import {SilverAsk} from "./SilverAsk.sol";
import {SilverBuyback} from "./SilverBuyback.sol";

/**
 * @notice Deploys the Silverchat contracts. The deployer keeps no role: every role goes to the addresses in the env.
 *   OWNER TREASURY POSTER PRICER KEEPER  role addresses (OWNER should be a multisig on mainnet)
 *   RULES_HASH RULES_SOURCE              keccak256 of web/src/lib/algorithm.ts and where to read it
 *   OUT                                  deployment name, written to deployments/<OUT>.json
 *   ZC BUYBACK_MAX BUYBACK_GAP           optional; mainnet ZC, 1M ZC and 1 hour by default
 */
contract Deploy is Script {
  address constant MAINNET_ZC = 0x4E67DB19044549fF420860834c91b45BaD298722;

  function run() external {
    IERC20 _zc = IERC20(vm.envOr("ZC", MAINNET_ZC));
    address _owner = vm.envAddress("OWNER");

    vm.startBroadcast();
    SilverBuyback _buyback = new SilverBuyback(
      _zc,
      _owner,
      vm.envAddress("KEEPER"),
      vm.envOr("BUYBACK_MAX", uint256(1_000_000 ether)),
      vm.envOr("BUYBACK_GAP", uint256(1 hours))
    );
    SilverAlgorithm _algorithm = new SilverAlgorithm(_owner, vm.envBytes32("RULES_HASH"), vm.envString("RULES_SOURCE"));
    SilverAsk _ask = new SilverAsk(
      _zc, vm.envAddress("TREASURY"), address(_buyback), _owner, vm.envAddress("POSTER"), vm.envAddress("PRICER")
    );
    vm.stopBroadcast();

    string memory _o = "deployment";
    vm.serializeUint(_o, "chainId", block.chainid);
    vm.serializeAddress(_o, "zc", address(_zc));
    vm.serializeAddress(_o, "ask", address(_ask));
    vm.serializeAddress(_o, "algorithm", address(_algorithm));
    vm.serializeAddress(_o, "buyback", address(_buyback));
    string memory _json = vm.serializeUint(_o, "deployBlock", block.number);
    string memory _file = string.concat("./deployments/", vm.envString("OUT"), ".json");
    vm.writeJson(_json, _file);
    console.log("wrote", _file);
  }
}
