// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice The parts of a Chainlink feed proxy this contract reads
interface IFeed {
  function phaseId() external view returns (uint16);
  function getRoundData(uint80 _roundId) external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice The parts of Reality.eth v3.0 (ETH bonds) this contract uses
interface IReality {
  function askQuestionWithMinBond(
    uint256 _templateId,
    string calldata _question,
    address _arbitrator,
    uint32 _timeout,
    uint32 _openingTs,
    uint256 _nonce,
    uint256 _minBond
  ) external payable returns (bytes32);
  function resultForOnceSettled(bytes32 _questionId) external view returns (bytes32);
  function getBond(bytes32 _questionId) external view returns (uint256);
}

/**
 * @title SilverPredict
 * @notice Silverchat Predict: people, or bots, put $ZC on future events (Snowmoon, ch. 27).
 * @dev A market is opened by locking $SC. Stakes are sealed: the amount is public, the side is a commitment that is
 *      revealed in the 72 hours after close, so nobody can follow the crowd. A stake still sealed after that counts
 *      as lost. Price markets settle on a Chainlink feed, event markets on Reality.eth with a Kleros arbitrator.
 *      Winners share the whole pool less 2% (1% burned, 1% to the treasury). With no revealed winner, no loser, or a
 *      void market, every stake comes back in full and nothing is charged.
 *      ZC is a plain ERC20. SC transfers run a third-party hook, so SC only moves when a market is opened and in
 *      `claimLock`, never on the path that pays out ZC.
 */
contract SilverPredict is Ownable2Step, ReentrancyGuard {
  using SafeERC20 for IERC20;

  enum Kind {
    Price,
    Event
  }

  enum Status {
    None,
    Open,
    Yes,
    No,
    Void
  }

  struct Market {
    address opener;
    uint32 closesAt;
    uint32 resolvesAt;
    Kind kind;
    Status status;
    // every stake comes back: no revealed winner, no loser, or void
    bool refund;
    // the oracle called the question invalid: the SC lock goes to the treasury
    bool invalid;
    bool lockClaimed;
    address feed;
    // how old the price may be at resolve time, fixed when the market opens
    uint32 maxStale;
    int256 threshold;
    bytes32 questionId;
    uint256 lock;
    uint256 pool;
    uint256 yes;
    uint256 no;
    uint256 payout;
  }

  struct Stake {
    uint256 amount;
    bytes32 commitment;
    // 0 sealed, 1 yes, 2 no
    uint8 side;
    bool claimed;
  }

  address public constant BURN = 0x000000000000000000000000000000000000dEaD;
  uint8 public constant YES = 1;
  uint8 public constant NO = 2;
  uint256 public constant REVEAL_WINDOW = 72 hours;
  uint32 public constant ANSWER_TIMEOUT = 2 days;
  uint256 public constant NO_ANSWER_VOID = 30 days;
  uint256 public constant HARD_STOP = 180 days;
  uint256 public constant MIN_LEAD = 1 hours;
  uint256 public constant MAX_HORIZON = 365 days;

  IERC20 public immutable ZC;
  IERC20 public immutable SC;
  IReality public immutable REALITY;
  address public immutable TREASURY;

  uint256 public lockAmount;
  uint256 public minStake;
  uint256 public minBond;
  address public arbitrator;
  /// @notice Allowed Chainlink feeds and how old their price may be at the time a market resolves; zero means not allowed
  mapping(address => uint256) public maxStale;

  uint256 public count;
  mapping(uint256 => Market) internal markets;
  mapping(uint256 => mapping(address => Stake)) public stakes;

  event Opened(
    uint256 indexed id,
    address indexed opener,
    Kind kind,
    bytes32 indexed contentHash,
    uint32 closesAt,
    uint32 resolvesAt,
    uint256 lock
  );
  event PriceMarket(uint256 indexed id, address feed, int256 threshold);
  event EventMarket(uint256 indexed id, bytes32 questionId, string question, address arbitrator, uint256 minBond);
  event Staked(uint256 indexed id, address indexed staker, uint256 amount, bytes32 commitment);
  event Revealed(uint256 indexed id, address indexed staker, uint8 side);
  event Settled(uint256 indexed id, Status status, bool refund, uint256 payout, uint256 fee);
  event Claimed(uint256 indexed id, address indexed staker, uint256 amount);
  event LockClaimed(uint256 indexed id, address indexed to, uint256 amount);
  event LockAmountSet(uint256 lockAmount);
  event MinStakeSet(uint256 minStake);
  event MinBondSet(uint256 minBond);
  event ArbitratorSet(address arbitrator);
  event FeedSet(address indexed feed, uint256 maxStale);

  error ZeroAddress();
  error BadTimes();
  error FeedNotAllowed();
  error BadThreshold();
  error NothingLocked();
  error NotOpen();
  error WrongKind();
  error StakingClosed();
  error StakeTooSmall();
  error AlreadyStaked();
  error EmptyCommitment();
  error NotRevealing();
  error BadSide();
  error BadReveal();
  error LengthMismatch();
  error TooEarly();
  error BadRound();
  error Settleable();
  error NotSettled();
  error NothingToClaim();
  error AlreadyClaimed();

  constructor(
    IERC20 _zc,
    IERC20 _sc,
    IReality _reality,
    address _treasury,
    address _owner,
    uint256 _lockAmount,
    uint256 _minStake,
    uint256 _minBond,
    address _arbitrator,
    address[] memory _feeds,
    uint256[] memory _maxStale
  ) Ownable(_owner) {
    if (address(_zc) == address(0) || address(_sc) == address(0) || address(_reality) == address(0)) revert ZeroAddress();
    if (_treasury == address(0)) revert ZeroAddress();
    if (_feeds.length != _maxStale.length) revert LengthMismatch();
    ZC = _zc;
    SC = _sc;
    REALITY = _reality;
    TREASURY = _treasury;
    _setLockAmount(_lockAmount);
    _setMinStake(_minStake);
    _setMinBond(_minBond);
    _setArbitrator(_arbitrator);
    for (uint256 _i; _i < _feeds.length; ++_i) {
      _setFeed(_feeds[_i], _maxStale[_i]);
    }
  }

  /**
   * @notice Open a market on a price: YES when the feed's price at `_resolvesAt` is at least `_threshold`
   * @param _contentHash keccak256 of the market text published off-chain, so it can never change
   */
  function openPrice(bytes32 _contentHash, address _feed, int256 _threshold, uint32 _closesAt, uint32 _resolvesAt)
    external
    nonReentrant
    returns (uint256 _id)
  {
    if (maxStale[_feed] == 0) revert FeedNotAllowed();
    if (_threshold <= 0) revert BadThreshold();
    _id = _open(Kind.Price, _contentHash, _closesAt, _resolvesAt);
    Market storage _m = markets[_id];
    _m.feed = _feed;
    _m.maxStale = uint32(maxStale[_feed]);
    _m.threshold = _threshold;
    emit PriceMarket(_id, _feed, _threshold);
  }

  /**
   * @notice Open a market on an event, asked on Reality.eth as a yes/no question that opens at `_resolvesAt`.
   *         ETH sent along is the bounty for whoever answers it.
   * @param _question The Reality.eth question string (title, category and language joined by U+241F)
   */
  function openEvent(string calldata _question, uint32 _closesAt, uint32 _resolvesAt)
    external
    payable
    nonReentrant
    returns (uint256 _id)
  {
    _id = _open(Kind.Event, keccak256(bytes(_question)), _closesAt, _resolvesAt);
    // the market id is the nonce, so two markets with the same question and time are still two questions
    bytes32 _qid = REALITY.askQuestionWithMinBond{value: msg.value}(
      0, _question, arbitrator, ANSWER_TIMEOUT, _resolvesAt, _id, minBond
    );
    markets[_id].questionId = _qid;
    emit EventMarket(_id, _qid, _question, arbitrator, minBond);
  }

  /// @notice Stake ZC with a sealed side: `_commitment` = keccak256(abi.encode(id, staker, side, salt))
  function stake(uint256 _id, uint256 _amount, bytes32 _commitment) external nonReentrant {
    Market storage _m = markets[_id];
    if (_m.status != Status.Open) revert NotOpen();
    if (block.timestamp >= _m.closesAt) revert StakingClosed();
    if (_amount < minStake || _amount == 0) revert StakeTooSmall();
    if (_commitment == bytes32(0)) revert EmptyCommitment();
    Stake storage _s = stakes[_id][msg.sender];
    if (_s.amount != 0) revert AlreadyStaked();

    _s.amount = _amount;
    _s.commitment = _commitment;
    _m.pool += _amount;
    ZC.safeTransferFrom(msg.sender, address(this), _amount);
    emit Staked(_id, msg.sender, _amount, _commitment);
  }

  /**
   * @notice Reveal sealed sides, in the 72 hours after close. Anyone who holds the salt can reveal; stakes revealed
   *         already are skipped, so a batch is not stopped by a reveal that landed first.
   */
  function reveal(uint256 _id, address[] calldata _stakers, uint8[] calldata _sides, bytes32[] calldata _salts)
    external
  {
    if (_stakers.length != _sides.length || _stakers.length != _salts.length) revert LengthMismatch();
    Market storage _m = markets[_id];
    if (_m.status != Status.Open) revert NotOpen();
    if (block.timestamp < _m.closesAt || block.timestamp >= _m.closesAt + REVEAL_WINDOW) revert NotRevealing();

    for (uint256 _i; _i < _stakers.length; ++_i) {
      Stake storage _s = stakes[_id][_stakers[_i]];
      if (_s.side != 0) continue;
      uint8 _side = _sides[_i];
      if (_side != YES && _side != NO) revert BadSide();
      if (_s.amount == 0 || keccak256(abi.encode(_id, _stakers[_i], _side, _salts[_i])) != _s.commitment) {
        revert BadReveal();
      }
      _s.side = _side;
      if (_side == YES) _m.yes += _s.amount;
      else _m.no += _s.amount;
      emit Revealed(_id, _stakers[_i], _side);
    }
  }

  /**
   * @notice Settle a price market with the Chainlink round that was the latest at the time the market resolves:
   *         round `_roundId` was updated at or before that time and the next round after it.
   *         If the feed had not updated for longer than its allowed age, the market is void.
   */
  function settlePrice(uint256 _id, uint80 _roundId) external nonReentrant {
    Market storage _m = _settling(_id, Kind.Price);
    IFeed _feed = IFeed(_m.feed);
    uint256 _t = _m.resolvesAt;

    (, int256 _answer,, uint256 _at,) = _feed.getRoundData(_roundId);
    if (_at == 0 || _at > _t) revert BadRound();
    uint256 _nextAt = _updatedAt(_feed, _roundId + 1);
    uint16 _phase = uint16(_roundId >> 64);
    if (_phase < _feed.phaseId()) {
      // a newer aggregator took over: its first round must come after the time, or it holds the price instead
      uint256 _firstNext = _updatedAt(_feed, uint80((uint256(_phase) + 1) << 64 | 1));
      if (_firstNext <= _t) revert BadRound();
      if (_nextAt == 0) _nextAt = _firstNext;
    }
    if (_nextAt <= _t) revert BadRound();

    if (_t - _at > _m.maxStale || _answer <= 0) _finish(_id, Status.Void);
    else _finish(_id, _answer >= _m.threshold ? Status.Yes : Status.No);
  }

  /// @notice Settle an event market once its Reality.eth answer is final. An invalid answer voids the market.
  function settleEvent(uint256 _id) external nonReentrant {
    Market storage _m = _settling(_id, Kind.Event);
    bytes32 _answer = REALITY.resultForOnceSettled(_m.questionId);
    if (_answer == bytes32(uint256(1))) {
      _finish(_id, Status.Yes);
    } else if (_answer == bytes32(0)) {
      _finish(_id, Status.No);
    } else {
      _m.invalid = true;
      _finish(_id, Status.Void);
    }
  }

  /**
   * @notice Void a market that cannot be settled: an event nobody answered 30 days after it resolved, or any market
   *         180 days after it resolved. An event whose answer is final can never be voided, only settled.
   */
  function voidMarket(uint256 _id) external nonReentrant {
    Market storage _m = markets[_id];
    if (_m.status != Status.Open) revert NotOpen();
    if (_m.kind == Kind.Event) {
      try REALITY.resultForOnceSettled(_m.questionId) returns (bytes32) {
        revert Settleable();
      } catch {}
      // no bond means nobody ever answered, and arbitration can only be asked for once someone has
      bool _unanswered = REALITY.getBond(_m.questionId) == 0;
      if (block.timestamp < _m.resolvesAt + (_unanswered ? NO_ANSWER_VOID : HARD_STOP)) revert TooEarly();
    } else if (block.timestamp < _m.resolvesAt + HARD_STOP) {
      revert TooEarly();
    }
    _finish(_id, Status.Void);
  }

  /// @notice Take your ZC out of a settled market: the stake back on a refund, your share of the pool if you won
  function claim(uint256 _id) external nonReentrant {
    Market storage _m = markets[_id];
    if (_m.status == Status.None || _m.status == Status.Open) revert NotSettled();
    Stake storage _s = stakes[_id][msg.sender];
    if (_s.amount == 0) revert NothingToClaim();
    if (_s.claimed) revert AlreadyClaimed();

    uint256 _amount;
    if (_m.refund) {
      _amount = _s.amount;
    } else {
      uint8 _won = _m.status == Status.Yes ? YES : NO;
      if (_s.side != _won) revert NothingToClaim();
      _amount = (_s.amount * _m.payout) / (_won == YES ? _m.yes : _m.no);
    }
    _s.claimed = true;
    ZC.safeTransfer(msg.sender, _amount);
    emit Claimed(_id, msg.sender, _amount);
  }

  /// @notice Return the SC lock of a settled market: to the opener, or to the treasury if the question was invalid
  function claimLock(uint256 _id) external nonReentrant {
    Market storage _m = markets[_id];
    if (_m.status == Status.None || _m.status == Status.Open) revert NotSettled();
    if (_m.lockClaimed) revert AlreadyClaimed();
    _m.lockClaimed = true;
    address _to = _m.invalid ? TREASURY : _m.opener;
    SC.safeTransfer(_to, _m.lock);
    emit LockClaimed(_id, _to, _m.lock);
  }

  function market(uint256 _id) external view returns (Market memory) {
    return markets[_id];
  }

  function setLockAmount(uint256 _lockAmount) external onlyOwner {
    _setLockAmount(_lockAmount);
  }

  function setMinStake(uint256 _minStake) external onlyOwner {
    _setMinStake(_minStake);
  }

  function setMinBond(uint256 _minBond) external onlyOwner {
    _setMinBond(_minBond);
  }

  function setArbitrator(address _arbitrator) external onlyOwner {
    _setArbitrator(_arbitrator);
  }

  /// @notice Allow a Chainlink feed, with how old its price may be at resolve time; zero takes it off the list
  function setFeed(address _feed, uint256 _maxStale) external onlyOwner {
    _setFeed(_feed, _maxStale);
  }

  function _open(Kind _kind, bytes32 _contentHash, uint32 _closesAt, uint32 _resolvesAt)
    internal
    returns (uint256 _id)
  {
    if (
      _closesAt < block.timestamp + MIN_LEAD || _resolvesAt < _closesAt || _resolvesAt >= block.timestamp + MAX_HORIZON
    ) revert BadTimes();
    _id = ++count;
    Market storage _m = markets[_id];
    _m.opener = msg.sender;
    _m.closesAt = _closesAt;
    _m.resolvesAt = _resolvesAt;
    _m.kind = _kind;
    _m.status = Status.Open;

    // what arrived, not what was asked: a token hook could keep a part, and the lock returned must exist
    uint256 _before = SC.balanceOf(address(this));
    SC.safeTransferFrom(msg.sender, address(this), lockAmount);
    uint256 _received = SC.balanceOf(address(this)) - _before;
    if (_received == 0) revert NothingLocked();
    _m.lock = _received;
    emit Opened(_id, msg.sender, _kind, _contentHash, _closesAt, _resolvesAt, _received);
  }

  /// @dev A market that can be settled now: open, of this kind, resolved, and its reveal window over
  function _settling(uint256 _id, Kind _kind) internal view returns (Market storage _m) {
    _m = markets[_id];
    if (_m.status != Status.Open) revert NotOpen();
    if (_m.kind != _kind) revert WrongKind();
    if (block.timestamp < _m.resolvesAt || block.timestamp < _m.closesAt + REVEAL_WINDOW) revert TooEarly();
  }

  function _updatedAt(IFeed _feed, uint80 _roundId) internal view returns (uint256 _at) {
    // a round that does not exist reads as zeros on the live aggregator and reverts on an old one
    try _feed.getRoundData(_roundId) returns (uint80, int256, uint256, uint256 _updated, uint80) {
      _at = _updated;
    } catch {}
  }

  function _finish(uint256 _id, Status _status) internal {
    Market storage _m = markets[_id];
    _m.status = _status;
    uint256 _won = _status == Status.Yes ? _m.yes : _status == Status.No ? _m.no : 0;
    if (_status == Status.Void || _won == 0 || _won == _m.pool) {
      _m.refund = true;
      emit Settled(_id, _status, true, 0, 0);
      return;
    }
    uint256 _cut = _m.pool / 100;
    _m.payout = _m.pool - 2 * _cut;
    ZC.safeTransfer(BURN, _cut);
    ZC.safeTransfer(TREASURY, _cut);
    emit Settled(_id, _status, false, _m.payout, 2 * _cut);
  }

  function _setLockAmount(uint256 _lockAmount) internal {
    if (_lockAmount == 0) revert NothingLocked();
    lockAmount = _lockAmount;
    emit LockAmountSet(_lockAmount);
  }

  function _setMinStake(uint256 _minStake) internal {
    minStake = _minStake;
    emit MinStakeSet(_minStake);
  }

  function _setMinBond(uint256 _minBond) internal {
    minBond = _minBond;
    emit MinBondSet(_minBond);
  }

  function _setArbitrator(address _arbitrator) internal {
    if (_arbitrator == address(0)) revert ZeroAddress();
    arbitrator = _arbitrator;
    emit ArbitratorSet(_arbitrator);
  }

  function _setFeed(address _feed, uint256 _maxStale) internal {
    if (_feed == address(0)) revert ZeroAddress();
    if (_maxStale > type(uint32).max) revert BadTimes();
    maxStale[_feed] = _maxStale;
    emit FeedSet(_feed, _maxStale);
  }
}
