// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {SilverAlgorithm} from "./SilverAlgorithm.sol";
import {SilverAsk} from "./SilverAsk.sol";
import {SilverRiddle} from "./SilverRiddle.sol";
import {IReality, SilverPredict} from "./SilverPredict.sol";
import {RealmBurner} from "./RealmBurner.sol";
import {RealmFactory} from "./RealmFactory.sol";
import {RealmHook} from "./RealmHook.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

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

/**
 * @notice Deploys SilverRiddle and adds its address to an existing deployments/<OUT>.json. The seven days before the
 *         Safe may reclaim start now, so deploy when the site and the repository are public, and fund it right after.
 *   SAFE          the Safe that may reclaim the prize after seven days
 *   ANSWER_HASH   from web/scripts/riddle-hash.mts, which normalizes like the page; the answer itself never goes into
 *                 the repository or the env
 *   OUT           deployment name; deployments/<OUT>.json must exist
 *   SC            optional; mainnet $SC by default
 */
contract DeployRiddle is Script {
  address constant MAINNET_SC = 0x3C3959052f60cbddC498b384958841b718112353;

  function run() external {
    IERC20 _sc = IERC20(vm.envOr("SC", MAINNET_SC));
    require(address(_sc).code.length != 0, "no SC on this chain");
    string memory _file = string.concat("./deployments/", vm.envString("OUT"), ".json");
    require(vm.exists(_file), "deploy SilverAsk first");
    require(vm.parseJsonUint(vm.readFile(_file), ".chainId") == block.chainid, "OUT is for another chain");
    bytes32 _hash = vm.envBytes32("ANSWER_HASH");
    address _safe = vm.envAddress("SAFE");
    // the Safe is the only key to the prize and can never change
    if (block.chainid == 1) require(_safe.code.length != 0, "SAFE is not a contract");
    console.log("safe       ", _safe);
    console.logBytes32(_hash);

    vm.startBroadcast();
    SilverRiddle _riddle = new SilverRiddle(_sc, _hash, _safe);
    vm.stopBroadcast();

    // only on a real broadcast, so a simulation never records an address that was not deployed
    if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
      vm.writeJson(vm.toString(address(_riddle)), _file, ".riddle");
      console.log("riddle", address(_riddle), "added to", _file);
    } else {
      console.log("simulated, nothing written");
    }
  }
}

/**
 * @notice Deploys SilverPredict alone and adds its address to an existing deployments/<OUT>.json. Every setting is a
 *         constructor argument, so the owner needs no transaction before the first market.
 *   OWNER TREASURY                       role addresses (the same Safe and treasury as SilverAsk on mainnet)
 *   LOCK_AMOUNT MIN_STAKE                SC to open a market and the smallest ZC stake, in wei (set from live prices)
 *   OUT                                  deployment name; deployments/<OUT>.json must exist
 *   MIN_BOND ARBITRATOR ZC SC REALITY    optional; 0.01 ETH, Kleros General Court and the mainnet addresses by default
 * Price markets may use Chainlink ETH/USD and BTC/USD, each allowed to be up to 2 hours old at resolve time.
 */
contract DeployPredict is Script {
  address constant MAINNET_ZC = 0x4E67DB19044549fF420860834c91b45BaD298722;
  address constant MAINNET_SC = 0x3C3959052f60cbddC498b384958841b718112353;
  address constant REALITY_V3 = 0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c;
  address constant KLEROS_GENERAL = 0xFf32eff53459485074b4Db14633252C9dcA3791A;
  address constant ETH_USD = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
  address constant BTC_USD = 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c;

  function run() external {
    IERC20 _zc = IERC20(vm.envOr("ZC", MAINNET_ZC));
    IERC20 _sc = IERC20(vm.envOr("SC", MAINNET_SC));
    address _reality = vm.envOr("REALITY", REALITY_V3);
    require(address(_zc).code.length != 0 && address(_sc).code.length != 0, "no ZC or SC on this chain");
    require(_reality.code.length != 0 && ETH_USD.code.length != 0, "no Reality.eth or Chainlink on this chain");
    string memory _file = string.concat("./deployments/", vm.envString("OUT"), ".json");
    require(vm.exists(_file), "deploy SilverAsk first");
    require(vm.parseJsonUint(vm.readFile(_file), ".chainId") == block.chainid, "OUT is for another chain");

    address[] memory _feeds = new address[](2);
    (_feeds[0], _feeds[1]) = (ETH_USD, BTC_USD);
    uint256[] memory _stale = new uint256[](2);
    (_stale[0], _stale[1]) = (2 hours, 2 hours);
    console.log("owner      ", vm.envAddress("OWNER"));
    console.log("treasury   ", vm.envAddress("TREASURY"));
    console.log("lock (SC)  ", vm.envUint("LOCK_AMOUNT"));
    console.log("min stake  ", vm.envUint("MIN_STAKE"));

    vm.startBroadcast();
    SilverPredict _predict = new SilverPredict(
      _zc,
      _sc,
      IReality(_reality),
      vm.envAddress("TREASURY"),
      vm.envAddress("OWNER"),
      vm.envUint("LOCK_AMOUNT"),
      vm.envUint("MIN_STAKE"),
      vm.envOr("MIN_BOND", uint256(0.01 ether)),
      vm.envOr("ARBITRATOR", KLEROS_GENERAL),
      _feeds,
      _stale
    );
    vm.stopBroadcast();

    // only on a real broadcast, so a simulation never records an address that was not deployed; only the new keys,
    // SilverAsk and SilverAlgorithm keep theirs
    if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
      vm.writeJson(vm.toString(address(_predict)), _file, ".predict");
      vm.writeJson(vm.toString(block.number), _file, ".predictBlock");
      console.log("predict", address(_predict), "added to", _file);
    } else {
      console.log("simulated, nothing written");
    }
  }
}

/**
 * @notice Deploys SilverRealm (burner, then the factory, which creates the hook) and adds the addresses to an existing
 *         deployments/<OUT>.json.
 *   OWNER    the Safe: it can only change the burner's keeper
 *   KEEPER   the keeper address that converts fees into burned SC and ZC
 *   OUT      deployment name; deployments/<OUT>.json must exist
 * The hook's address must end in its permission bits (0x28CC). The factory is the deployer's next-but-one contract, so
 * its address is known before it exists, and the hook's salt is mined for it here. Send nothing else from the deployer
 * between the two.
 */
contract DeployRealm is Script {
  IPoolManager constant POOL_MANAGER = IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90);

  function run() external {
    require(address(POOL_MANAGER).code.length != 0, "no Uniswap v4 on this chain");
    string memory _file = string.concat("./deployments/", vm.envString("OUT"), ".json");
    require(vm.exists(_file), "deploy SilverAsk first");
    require(vm.parseJsonUint(vm.readFile(_file), ".chainId") == block.chainid, "OUT is for another chain");
    address _owner = vm.envAddress("OWNER");
    address _keeper = vm.envAddress("KEEPER");
    if (block.chainid == 1) require(_owner.code.length != 0, "OWNER is not a contract");

    vm.startBroadcast();
    (, address _deployer,) = vm.readCallers();
    uint256 _nonce = vm.getNonce(_deployer);
    address _burnerAt = vm.computeCreateAddress(_deployer, _nonce);
    address _factoryAt = vm.computeCreateAddress(_deployer, _nonce + 1);
    bytes32 _init = keccak256(abi.encodePacked(type(RealmHook).creationCode, abi.encode(POOL_MANAGER, _burnerAt)));
    bytes32 _salt;
    for (uint256 _i;; ++_i) {
      _salt = bytes32(_i);
      if (uint160(vm.computeCreate2Address(_salt, _init, _factoryAt)) & 0x3FFF == 0x28CC) break;
    }
    RealmBurner _burner = new RealmBurner(POOL_MANAGER, _owner, _keeper);
    RealmFactory _factory = new RealmFactory(POOL_MANAGER, address(_burner), _salt);
    vm.stopBroadcast();
    require(address(_burner) == _burnerAt && address(_factory) == _factoryAt, "addresses moved");
    console.log("burner ", address(_burner));
    console.log("factory", address(_factory));
    console.log("hook   ", address(_factory.HOOK()));

    if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return console.log("simulated, nothing written");
    vm.writeJson(vm.toString(address(_factory)), _file, ".realmFactory");
    vm.writeJson(vm.toString(address(_factory.HOOK())), _file, ".realmHook");
    vm.writeJson(vm.toString(address(_burner)), _file, ".realmBurner");
    vm.writeJson(vm.toString(block.number), _file, ".realmBlock");
  }
}
