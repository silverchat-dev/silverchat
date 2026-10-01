// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SilverRiddle
 * @notice One riddle, a prize in $SC. The answer is fixed at deploy as a hash, so it can never change. To win, first
 *         commit a sealed guess, then reveal it ten blocks later: the first correct reveal takes the whole prize.
 * @dev A commitment binds the solver's address, so nobody can copy a reveal from the mempool and win with it; the ten
 *      blocks mean one block builder cannot hold a reveal back and slip in a commit of its own.
 *      Seven days after deploy the Safe may take the SC back with `reclaim`. Until it does, a correct reveal still wins.
 *      SC transfers run a third-party launchpad hook. It also pays ZC rewards to every SC holder, this contract
 *      included; `sweep` lets the Safe take any token but SC out, so those rewards are not stuck here.
 */
contract SilverRiddle is ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct Commit {
    bytes32 hash;
    uint256 blockNumber;
  }

  uint256 public constant REVEAL_DELAY = 10;
  uint256 public constant RECLAIM_AFTER = 7 days;

  IERC20 public immutable SC;
  /// @notice keccak256 of the normalized answer: lowercase a to z and 0 to 9, words joined by single spaces
  bytes32 public immutable ANSWER_HASH;
  address public immutable SAFE;
  uint256 public immutable DEADLINE;

  bool public solved;
  bool public closed;
  address public winner;

  mapping(address => Commit) public commits;

  event Solved(address indexed winner, string answer, uint256 amount);
  event Reclaimed(uint256 amount);

  error ZeroAddress();
  error BadHash();
  error NotOtherToken();
  error Over();
  error NoCommit();
  error TooSoon();
  error BadReveal();
  error WrongAnswer();
  error NotSafe();
  error TooEarly();

  constructor(IERC20 _sc, bytes32 _answerHash, address _safe) {
    if (address(_sc) == address(0) || _safe == address(0)) revert ZeroAddress();
    if (_answerHash == bytes32(0)) revert BadHash();
    SC = _sc;
    ANSWER_HASH = _answerHash;
    SAFE = _safe;
    DEADLINE = block.timestamp + RECLAIM_AFTER;
  }

  /// @notice Seal a guess: `_hash` = keccak256(abi.encode(you, answer, salt)). A new commit replaces your last one.
  function commit(bytes32 _hash) external {
    if (solved || closed) revert Over();
    commits[msg.sender] = Commit(_hash, block.number);
  }

  /// @notice Open your sealed guess, at least ten blocks after you committed it. Right and first: the prize is yours.
  function reveal(string calldata _answer, bytes32 _salt) external nonReentrant {
    if (solved || closed) revert Over();
    Commit memory _c = commits[msg.sender];
    if (_c.hash == bytes32(0)) revert NoCommit();
    if (block.number < _c.blockNumber + REVEAL_DELAY) revert TooSoon();
    if (keccak256(abi.encode(msg.sender, _answer, _salt)) != _c.hash) revert BadReveal();
    if (keccak256(bytes(_answer)) != ANSWER_HASH) revert WrongAnswer();

    solved = true;
    winner = msg.sender;
    uint256 _prize = SC.balanceOf(address(this));
    SC.safeTransfer(msg.sender, _prize);
    emit Solved(msg.sender, _answer, _prize);
  }

  /// @notice Any token other than SC sent here, such as the ZC rewards SC holders receive, goes to the Safe
  function sweep(IERC20 _token) external nonReentrant {
    if (msg.sender != SAFE) revert NotSafe();
    if (_token == SC) revert NotOtherToken();
    _token.safeTransfer(SAFE, _token.balanceOf(address(this)));
  }

  /// @notice After seven days the Safe may take the SC back: an unsolved prize, or SC sent here after a solve
  function reclaim() external nonReentrant {
    if (msg.sender != SAFE) revert NotSafe();
    if (block.timestamp < DEADLINE) revert TooEarly();
    closed = true;
    uint256 _amount = SC.balanceOf(address(this));
    SC.safeTransfer(SAFE, _amount);
    emit Reclaimed(_amount);
  }
}
