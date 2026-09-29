// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title SilverAlgorithm
 * @notice The hash of the rules Silverchat runs by. A new hash only counts 20 days after it is published, so nobody
 *         can change the rules quietly (Snowmoon, ch. 27).
 * @dev `current()` is derived from timestamps: a pending hash counts as current once its time has come, with no call
 *      needed. The hash proves which rules were published and when; it does not prove the server runs them.
 */
contract SilverAlgorithm is Ownable2Step {
  uint256 public constant DELAY = 20 days;

  bytes32 private active;
  bytes32 private next;
  uint64 private nextAt;

  event Proposed(bytes32 indexed hash, uint64 activeAt, string source);
  event Cancelled(bytes32 indexed hash);

  error NothingPending();

  constructor(address _owner, bytes32 _initial, string memory _source) Ownable(_owner) {
    active = _initial;
    emit Proposed(_initial, uint64(block.timestamp), _source);
  }

  function current() public view returns (bytes32) {
    return nextAt != 0 && block.timestamp >= nextAt ? next : active;
  }

  /// @return _hash The hash waiting for its turn, zero if none
  /// @return _activeAt When it starts to count
  function pending() external view returns (bytes32 _hash, uint64 _activeAt) {
    if (nextAt != 0 && block.timestamp < nextAt) return (next, nextAt);
  }

  /**
   * @notice Publish new rules. They count from `now + DELAY`. A proposal still waiting is replaced and its clock
   *         starts again; one whose time has come is kept as the current rules first.
   * @param _source Where to read the rules, e.g. the file at a fixed commit
   */
  function propose(bytes32 _hash, string calldata _source) external onlyOwner {
    active = current();
    next = _hash;
    nextAt = uint64(block.timestamp + DELAY);
    emit Proposed(_hash, nextAt, _source);
  }

  /// @notice Withdraw a proposal before its time comes. Once current, rules can only change through a new proposal.
  function cancel() external onlyOwner {
    if (nextAt == 0 || block.timestamp >= nextAt) revert NothingPending();
    emit Cancelled(next);
    next = bytes32(0);
    nextAt = 0;
  }
}
