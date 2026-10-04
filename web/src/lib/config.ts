import { getAddress, isAddress, type Address } from "viem";

export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "1");
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-rpc.publicnode.com";

const SC = process.env.NEXT_PUBLIC_SC?.trim();
if (SC && !isAddress(SC)) throw new Error("NEXT_PUBLIC_SC is not an address");

export const ADDR = {
  zc: "0x4E67DB19044549fF420860834c91b45BaD298722" as Address,
  /** Zero until $SC launches. */
  sc: SC ? getAddress(SC) : ZERO,
  ask: (process.env.NEXT_PUBLIC_ASK ?? ZERO) as Address,
  algorithm: (process.env.NEXT_PUBLIC_ALGORITHM ?? ZERO) as Address,
  /** Zero until SilverRiddle is deployed: until then /riddle is a 404 and nothing links to it. */
  riddle: (process.env.NEXT_PUBLIC_RIDDLE || ZERO) as Address,
  /** Zero until SilverPredict is deployed: the Predict tab and its keeper stay off. */
  predict: (process.env.NEXT_PUBLIC_PREDICT || ZERO) as Address,
  /** Zero until SilverRealm is deployed: the Realm pages, its indexer and keeper stay off. */
  realmFactory: (process.env.NEXT_PUBLIC_REALM_FACTORY || ZERO) as Address,
  realmHook: (process.env.NEXT_PUBLIC_REALM_HOOK || ZERO) as Address,
  realmBurner: (process.env.NEXT_PUBLIC_REALM_BURNER || ZERO) as Address,
  reality: "0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c" as Address,
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90" as Address,
  stockereumHook: "0x322dcEc4958C14e021A9F1cD49DF11b9457968cC" as Address,
  /** Stockereum's first hook, where $STOCKER trades against WETH */
  stockereumOldHook: "0xAFeD2c6e0d906520ca17143a8918Ce6d54b128Cc" as Address,
  stocker: "0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2" as Address,
  stockereumRouter: "0xcdf832D2C11DA16055bb6C6145cF38EDD7233767" as Address,
  ethUsdFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address,
};

export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");
export const PREDICT_BLOCK = BigInt(process.env.NEXT_PUBLIC_PREDICT_BLOCK ?? "0");
export const REALM_BLOCK = BigInt(process.env.NEXT_PUBLIC_REALM_BLOCK ?? "0");

/** SilverCash shows on the site only once this is "1": the code can ship before the page goes live. */
export const CASH_LIVE = process.env.NEXT_PUBLIC_CASH === "1";
/** Zinc, the same way: the page and every link to it wait for NEXT_PUBLIC_ZINC=1. */
export const ZINC_LIVE = process.env.NEXT_PUBLIC_ZINC === "1";

export const EXPLORER = "https://etherscan.io";
export const BOOK_URL = "https://vitalik.eth.limo/snowmoon/html/";
export const chapter = (n: number) => `${BOOK_URL}chapter-${n}.html`;
export const GITHUB_URL = "https://github.com/silverchat-dev/silverchat";
export const ZIPCOIN_URL = "https://www.zipcoin.cash";
