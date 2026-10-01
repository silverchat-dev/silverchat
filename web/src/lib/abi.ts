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
]);
