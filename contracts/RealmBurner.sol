// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";

import {RealmPools} from "./RealmPools.sol";

/**
 * @title RealmBurner
 * @notice Every SilverRealm trading fee ends here, as PoolManager claims in ETH (WETH), $ZC, $SC or $STOCKER. A conversion turns
 *         them into $ZC (fees in $STOCKER through WETH first), burns 20% of it and buys $SC with the rest to burn it too; fees taken in $SC burn 80% as they
 *         are and buy $ZC with 20% to burn. Nothing here can be withdrawn or sent anywhere but 0xdEaD.
 * @dev Only the keeper converts, with minimums it reads from recent prices, so nobody can time a conversion against a
 *      moved pool. The routes are fixed in RealmPools. The owner (the Safe) can only change the keeper.
 */
contract RealmBurner is IUnlockCallback, Ownable2Step, ReentrancyGuard {
  using CurrencyLibrary for Currency;

  IPoolManager public immutable POOL_MANAGER;
  address public keeper;

  event Burned(address indexed base, uint256 amount, uint256 scBurned, uint256 zcBurned);
  event KeeperSet(address keeper);

  error NotKeeper();
  error NotPoolManager();
  error BadBase();
  error TooLittle();
  error CannotRenounce();

  constructor(IPoolManager _poolManager, address _owner, address _keeper) Ownable(_owner) {
    POOL_MANAGER = _poolManager;
    keeper = _keeper;
  }

  /// @notice Fees waiting here in `_base`
  function pending(address _base) external view returns (uint256) {
    return POOL_MANAGER.balanceOf(address(this), Currency.wrap(_base).toId());
  }

  /// @notice Burn `_amount` of the fees held in `_base`, refusing if it would burn less than the minimums
  function convert(address _base, uint256 _amount, uint256 _minSc, uint256 _minZc) external nonReentrant {
    if (msg.sender != keeper) revert NotKeeper();
    if (!RealmPools.isBase(_base)) revert BadBase();
    POOL_MANAGER.unlock(abi.encode(_base, _amount, _minSc, _minZc));
  }

  function unlockCallback(bytes calldata _data) external returns (bytes memory) {
    if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
    (address _base, uint256 _amount, uint256 _minSc, uint256 _minZc) =
      abi.decode(_data, (address, uint256, uint256, uint256));
    IPoolManager _pm = POOL_MANAGER;
    // spending our claims is what pays for the swaps below
    _pm.burn(address(this), Currency.wrap(_base).toId(), _amount);

    uint256 _sc;
    uint256 _zc;
    if (_base == RealmPools.SC) {
      _sc = _amount * 80 / 100;
      _zc = RealmPools.swapIn(_pm, RealmPools.scZc(), true, _amount - _sc);
    } else {
      // STOCKER is sold for WETH first, then it all goes the WETH way
      uint256 _in =
        _base == RealmPools.STOCKER ? RealmPools.swapIn(_pm, RealmPools.stockerWeth(), true, _amount) : _amount;
      uint256 _allZc = _base == RealmPools.ZC ? _in : RealmPools.swapIn(_pm, RealmPools.zcWeth(), false, _in);
      _zc = _allZc * 20 / 100;
      _sc = RealmPools.swapIn(_pm, RealmPools.scZc(), false, _allZc - _zc);
    }
    if (_sc < _minSc || _zc < _minZc) revert TooLittle();
    _pm.take(Currency.wrap(RealmPools.SC), RealmPools.DEAD, _sc);
    _pm.take(Currency.wrap(RealmPools.ZC), RealmPools.DEAD, _zc);
    emit Burned(_base, _amount, _sc, _zc);
    return "";
  }

  /// @notice Disabled: without an owner the keeper could never be replaced, and the fees would wait here forever
  function renounceOwnership() public view override onlyOwner {
    revert CannotRenounce();
  }

  function setKeeper(address _keeper) external onlyOwner {
    keeper = _keeper;
    emit KeeperSet(_keeper);
  }
}
