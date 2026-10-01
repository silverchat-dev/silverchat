import { parseAbi } from "viem";

export const askAbi = parseAbi([
  "function pricePerPerson() view returns (uint256)",
  "function costOf(uint256 breadth, uint8 priority) view returns (uint256)",
  "function polls(uint256 id) view returns (address asker, uint32 closesAt, uint32 finalizedAt, uint8 status, uint256 cost, uint256 remaining, bytes32 rewardRoot)",
  "function claimed(uint256 id, address account) view returns (bool)",
  "function ask(bytes32 contentHash, uint32 breadth, uint8 priority, uint32 duration, uint256 maxCost) returns (uint256)",
  "function finalize(uint256 id, bytes32 resultRoot, bytes32 rewardRoot, uint256 rewardTotal)",
  "function claimMany(address account, uint256[] ids, uint256[] amounts, bytes32[][] proofs)",
  "function refund(uint256 id)",
  "function setPrice(uint256 pricePerPerson)",
  "event Asked(uint256 indexed id, address indexed asker, bytes32 indexed contentHash, uint256 breadth, uint8 priority, uint32 closesAt, uint256 cost)",
  "event Finalized(uint256 indexed id, bytes32 resultRoot, bytes32 rewardRoot, uint256 rewardTotal, uint256 returned)",
  "event Claimed(uint256 indexed id, address indexed account, uint256 amount)",
  "event Swept(uint256 indexed id, uint256 amount)",
  "event Refunded(uint256 indexed id, uint256 amount)",
]);

export const algorithmAbi = parseAbi([
  "function current() view returns (bytes32)",
  "function pending() view returns (bytes32 hash, uint64 activeAt)",
]);

// Stockereum's router: buys a launch token with ETH through its WETH pool, and quotes the same path without ETH
export const routerAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function buyWethPairWithEth(PoolKey key, uint256 minOut, bytes hookData) payable returns (uint256 amountOut)",
  "function buyWithEth(PoolKey key, address quote, uint256 minQuoteOut, uint256 minOut, bytes hookData) payable returns (uint256 amountOut)",
  "function quoteBuyWithEth(PoolKey key, address quote, uint256 ethIn) view returns (uint256 quoteIn, uint256 tokensOut)",
]);

export const poolManagerAbi = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);

export const priceFeedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 roundId) view returns (uint80, int256 answer, uint256 startedAt, uint256 updatedAt, uint80)",
  "function phaseId() view returns (uint16)",
]);

export const predictAbi = parseAbi([
  "struct Market { address opener; uint32 closesAt; uint32 resolvesAt; uint8 kind; uint8 status; bool refund; bool invalid; bool lockClaimed; address feed; uint32 maxStale; int256 threshold; bytes32 questionId; uint256 lock; uint256 pool; uint256 yes; uint256 no; uint256 payout; }",
  "function market(uint256 id) view returns (Market)",
  "function stakes(uint256 id, address staker) view returns (uint256 amount, bytes32 commitment, uint8 side, bool claimed)",
  "function lockAmount() view returns (uint256)",
  "function minStake() view returns (uint256)",
  "function openPrice(bytes32 contentHash, address feed, int256 threshold, uint32 closesAt, uint32 resolvesAt) returns (uint256)",
  "function openEvent(string question, uint32 closesAt, uint32 resolvesAt) payable returns (uint256)",
  "function stake(uint256 id, uint256 amount, bytes32 commitment)",
  "function reveal(uint256 id, address[] stakers, uint8[] sides, bytes32[] salts)",
  "function settlePrice(uint256 id, uint80 roundId)",
  "function settleEvent(uint256 id)",
  "function voidMarket(uint256 id)",
  "function claim(uint256 id)",
  "function claimLock(uint256 id)",
  "event Opened(uint256 indexed id, address indexed opener, uint8 kind, bytes32 indexed contentHash, uint32 closesAt, uint32 resolvesAt, uint256 lock)",
  "event PriceMarket(uint256 indexed id, address feed, int256 threshold)",
  "event EventMarket(uint256 indexed id, bytes32 questionId, string question, address arbitrator, uint256 minBond)",
  "event Staked(uint256 indexed id, address indexed staker, uint256 amount, bytes32 commitment)",
  "event Revealed(uint256 indexed id, address indexed staker, uint8 side)",
  "event Settled(uint256 indexed id, uint8 status, bool refund, uint256 payout, uint256 fee)",
  "event Claimed(uint256 indexed id, address indexed staker, uint256 amount)",
  "event LockClaimed(uint256 indexed id, address indexed to, uint256 amount)",
]);

// Reality.eth v3.0, ETH bonds: what the keeper needs to reopen a question answered too soon
export const realityAbi = parseAbi([
  "function isFinalized(bytes32 questionId) view returns (bool)",
  "function isSettledTooSoon(bytes32 questionId) view returns (bool)",
  "function reopened_questions(bytes32 questionId) view returns (bytes32)",
  "function reopenQuestion(uint256 templateId, string question, address arbitrator, uint32 timeout, uint32 openingTs, uint256 nonce, uint256 minBond, bytes32 reopensQuestionId) payable returns (bytes32)",
]);

export const riddleAbi = parseAbi([
  "function ANSWER_HASH() view returns (bytes32)",
  "function DEADLINE() view returns (uint256)",
  "function solved() view returns (bool)",
  "function closed() view returns (bool)",
  "function winner() view returns (address)",
  "function commits(address solver) view returns (bytes32 hash, uint256 blockNumber)",
  "function commit(bytes32 hash)",
  "function reveal(string answer, bytes32 salt)",
]);
