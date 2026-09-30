import type { Address } from "viem";

export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "1");
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-rpc.publicnode.com";

export const ADDR = {
  zc: "0x4E67DB19044549fF420860834c91b45BaD298722" as Address,
  /** Zero until $SC launches. */
  sc: (process.env.NEXT_PUBLIC_SC ?? ZERO) as Address,
  ask: (process.env.NEXT_PUBLIC_ASK ?? ZERO) as Address,
  algorithm: (process.env.NEXT_PUBLIC_ALGORITHM ?? ZERO) as Address,
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90" as Address,
  stockereumHook: "0x322dcEc4958C14e021A9F1cD49DF11b9457968cC" as Address,
  ethUsdFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address,
};

export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export const EXPLORER = "https://etherscan.io";
export const BOOK_URL = "https://vitalik.eth.limo/snowmoon/html/";
export const chapter = (n: number) => `${BOOK_URL}chapter-${n}.html`;
export const GITHUB_URL = "https://github.com/silverchat-dev/silverchat";
export const ZIPCOIN_URL = "https://www.zipcoin.cash";
