import type { Address } from "viem";

export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "1");
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-rpc.publicnode.com";

export const ADDR = {
  zc: "0x4E67DB19044549fF420860834c91b45BaD298722" as Address,
  /** Zero until $SC launches. */
  sc: (process.env.NEXT_PUBLIC_SC ?? ZERO) as Address,
};

export const EXPLORER = "https://etherscan.io";
export const BOOK_URL = "https://vitalik.eth.limo/snowmoon/html/";
export const GITHUB_URL = "https://github.com/silverchat-dev/silverchat";
export const ZIPCOIN_URL = "https://www.zipcoin.cash";
