// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title SilverAsk
 * @notice Pay zipcoins to ask the network a question. The more you pay, the more people it polls (Snowmoon, ch. 27).
 * @dev The payment is held until the poster fixes the result. Then 25% goes to the treasury, 20% to the SC buyback,
 *      20% is burned and 35% pays the answerers. The part of that 35% nobody earned goes back to the asker.
 *      If the result is never fixed, the asker takes the whole payment back 7 days after the poll closes.
 *      Trust: the poster decides who is paid from the answerers' share of a poll, and nothing else.
 *      ZC is a plain ERC20 (its trade tax lives in the pool hook), so transfers move exact amounts.
 */
contract SilverAsk is Ownable2Step {
  using SafeERC20 for IERC20;

  enum Status {
    None,
    Open,
    Finalized,
    Refunded
  }

  struct Poll {
    address asker;
    uint32 closesAt;
    uint32 finalizedAt;
    Status status;
    uint256 cost;
    uint256 remaining;
    bytes32 rewardRoot;
  }

  address public constant BURN = 0x000000000000000000000000000000000000dEaD;
  uint256 public constant ANSWERERS_BPS = 3500;
  uint256 public constant TREASURY_BPS = 2500;
  uint256 public constant BUYBACK_BPS = 2000;
  uint256 public constant MIN_DURATION = 1 hours;
  uint256 public constant MAX_DURATION = 30 days;
  uint256 public constant REFUND_AFTER = 7 days;
  uint256 public constant CLAIM_WINDOW = 90 days;

  IERC20 public immutable ZC;
  address public immutable TREASURY;
  address public immutable BUYBACK;

  address public poster;
  address public pricer;
  /// @notice ZC (wei) per person asked, before the priority multiplier
  uint256 public pricePerPerson;
  uint256 public count;

  mapping(uint256 => Poll) public polls;
  mapping(uint256 => mapping(address => bool)) public claimed;

  event Asked(
    uint256 indexed id,
    address indexed asker,
    bytes32 indexed contentHash,
    uint256 breadth,
    uint8 priority,
    uint32 closesAt,
    uint256 cost
  );
  event Finalized(uint256 indexed id, bytes32 resultRoot, bytes32 rewardRoot, uint256 rewardTotal, uint256 returned);
  event Claimed(uint256 indexed id, address indexed account, uint256 amount);
  event Swept(uint256 indexed id, uint256 amount);
  event Refunded(uint256 indexed id, uint256 amount);
  event PriceSet(uint256 pricePerPerson);
  event PosterSet(address poster);
  event PricerSet(address pricer);

  error ZeroAddress();
  error BadBreadth();
  error BadPriority();
  error BadDuration();
  error PriceUnset();
  error PriceMoved(uint256 cost);
  error NotPoster();
  error NotPricer();
  error NotAsker();
  error NotOpen();
  error NotFinalized();
  error StillOpen();
  error TooEarly();
  error RewardTooLarge();
  error ClaimWindowClosed();
  error AlreadyClaimed();
  error BadProof();
  error LengthMismatch();
  error NothingToSweep();

  constructor(IERC20 _zc, address _treasury, address _buyback, address _owner, address _poster, address _pricer)
    Ownable(_owner)
  {
    if (address(_zc) == address(0) || _treasury == address(0) || _buyback == address(0)) revert ZeroAddress();
    ZC = _zc;
    TREASURY = _treasury;
    BUYBACK = _buyback;
    poster = _poster;
    pricer = _pricer;
    emit PosterSet(_poster);
    emit PricerSet(_pricer);
  }

  /// @notice What a poll costs right now. Breadth is 100, 1k, 10k, 100k or 1M people; priority 0, 1 or 2.
  function costOf(uint256 _breadth, uint8 _priority) public view returns (uint256) {
    if (_breadth != 100 && _breadth != 1000 && _breadth != 10_000 && _breadth != 100_000 && _breadth != 1_000_000) {
      revert BadBreadth();
    }
    if (_priority > 2) revert BadPriority();
    if (pricePerPerson == 0) revert PriceUnset();
    uint256 _mult = _priority == 0 ? 10_000 : _priority == 1 ? 12_000 : 15_000;
    return (pricePerPerson * _breadth * _mult) / 10_000;
  }

  /**
   * @notice Ask the network. The question itself lives off-chain; `_contentHash` pins it so it can never change.
   * @param _maxCost The most the asker agrees to pay, in case the price moves before the transaction lands
   */
  function ask(bytes32 _contentHash, uint32 _breadth, uint8 _priority, uint32 _duration, uint256 _maxCost)
    external
    returns (uint256 _id)
  {
    if (_duration < MIN_DURATION || _duration > MAX_DURATION) revert BadDuration();
    uint256 _cost = costOf(_breadth, _priority);
    if (_cost > _maxCost) revert PriceMoved(_cost);

    _id = ++count;
    uint32 _closesAt = uint32(block.timestamp + _duration);
    Poll storage _poll = polls[_id];
    _poll.asker = msg.sender;
    _poll.closesAt = _closesAt;
    _poll.status = Status.Open;
    _poll.cost = _cost;

    ZC.safeTransferFrom(msg.sender, address(this), _cost);
    emit Asked(_id, msg.sender, _contentHash, _breadth, _priority, _closesAt, _cost);
  }

  /**
   * @notice Fix the result and pay out the split
   * @param _resultRoot Merkle root of every counted answer, published so anyone can recount
   * @param _rewardRoot Merkle root of (account, amount) for the paid answers, zero when nobody is paid
   * @param _rewardTotal Sum of the reward leaves, at most 35% of the cost
   */
  function finalize(uint256 _id, bytes32 _resultRoot, bytes32 _rewardRoot, uint256 _rewardTotal) external {
    if (msg.sender != poster) revert NotPoster();
    Poll storage _poll = polls[_id];
    if (_poll.status != Status.Open) revert NotOpen();
    if (block.timestamp <= _poll.closesAt) revert StillOpen();

    uint256 _cost = _poll.cost;
    uint256 _pool = (_cost * ANSWERERS_BPS) / 10_000;
    if (_rewardTotal > _pool || (_rewardRoot == bytes32(0) && _rewardTotal != 0)) revert RewardTooLarge();
    uint256 _treasury = (_cost * TREASURY_BPS) / 10_000;
    uint256 _buyback = (_cost * BUYBACK_BPS) / 10_000;
    uint256 _returned = _pool - _rewardTotal;

    _poll.status = Status.Finalized;
    _poll.finalizedAt = uint32(block.timestamp);
    _poll.remaining = _rewardTotal;
    _poll.rewardRoot = _rewardRoot;

    ZC.safeTransfer(TREASURY, _treasury);
    ZC.safeTransfer(BUYBACK, _buyback);
    // the burn takes whatever rounding leaves over
    ZC.safeTransfer(BURN, _cost - _pool - _treasury - _buyback);
    if (_returned != 0) ZC.safeTransfer(_poll.asker, _returned);
    emit Finalized(_id, _resultRoot, _rewardRoot, _rewardTotal, _returned);
  }

  /// @notice Claim an answer reward. Anyone can submit it; the ZC always goes to `_account`.
  function claim(uint256 _id, address _account, uint256 _amount, bytes32[] calldata _proof) external {
    _claim(_id, _account, _amount, _proof);
    ZC.safeTransfer(_account, _amount);
  }

  /// @notice Claim rewards from several polls in one transaction
  function claimMany(
    address _account,
    uint256[] calldata _ids,
    uint256[] calldata _amounts,
    bytes32[][] calldata _proofs
  ) external {
    if (_ids.length != _amounts.length || _ids.length != _proofs.length) {
      revert LengthMismatch();
    }
    uint256 _total;
    for (uint256 _i; _i < _ids.length; ++_i) {
      _claim(_ids[_i], _account, _amounts[_i], _proofs[_i]);
      _total += _amounts[_i];
    }
    ZC.safeTransfer(_account, _total);
  }

  /// @notice Burn what nobody claimed within 90 days of the result
  function sweep(uint256 _id) external {
    Poll storage _poll = polls[_id];
    if (_poll.status != Status.Finalized) revert NotFinalized();
    if (block.timestamp <= _poll.finalizedAt + CLAIM_WINDOW) revert TooEarly();
    uint256 _amount = _poll.remaining;
    if (_amount == 0) revert NothingToSweep();
    _poll.remaining = 0;
    ZC.safeTransfer(BURN, _amount);
    emit Swept(_id, _amount);
  }

  /// @notice The asker takes the whole payment back if the result is still not fixed 7 days after close
  function refund(uint256 _id) external {
    Poll storage _poll = polls[_id];
    if (msg.sender != _poll.asker) revert NotAsker();
    if (_poll.status != Status.Open) revert NotOpen();
    if (block.timestamp <= _poll.closesAt + REFUND_AFTER) revert TooEarly();
    _poll.status = Status.Refunded;
    ZC.safeTransfer(msg.sender, _poll.cost);
    emit Refunded(_id, _poll.cost);
  }

  function setPrice(uint256 _pricePerPerson) external {
    if (msg.sender != pricer) revert NotPricer();
    pricePerPerson = _pricePerPerson;
    emit PriceSet(_pricePerPerson);
  }

  function setPoster(address _poster) external onlyOwner {
    poster = _poster;
    emit PosterSet(_poster);
  }

  function setPricer(address _pricer) external onlyOwner {
    pricer = _pricer;
    emit PricerSet(_pricer);
  }

  function _claim(uint256 _id, address _account, uint256 _amount, bytes32[] calldata _proof) internal {
    Poll storage _poll = polls[_id];
    if (_poll.status != Status.Finalized) revert NotFinalized();
    if (block.timestamp > _poll.finalizedAt + CLAIM_WINDOW) revert ClaimWindowClosed();
    if (claimed[_id][_account]) revert AlreadyClaimed();
    if (_amount > _poll.remaining) revert RewardTooLarge();
    bytes32 _leaf = keccak256(bytes.concat(keccak256(abi.encode(_account, _amount))));
    if (!MerkleProof.verifyCalldata(_proof, _poll.rewardRoot, _leaf)) revert BadProof();

    claimed[_id][_account] = true;
    _poll.remaining -= _amount;
    emit Claimed(_id, _account, _amount);
  }
}
