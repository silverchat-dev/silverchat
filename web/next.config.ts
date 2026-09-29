import { readFileSync } from "node:fs";

import type { NextConfig } from "next";
import { keccak256 } from "viem";

// The rules the app runs by, hashed at build time. SilverAlgorithm holds the published hash; /algorithm shows both.
const RULES_HASH = keccak256(readFileSync("src/lib/algorithm.ts"));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_RULES_HASH: RULES_HASH,
    NEXT_PUBLIC_COMMIT: process.env.RAILWAY_GIT_COMMIT_SHA ?? "main",
  },
  // the data is public on purpose: other clients may read it (Snowmoon, ch. 3)
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "access-control-allow-origin", value: "*" }] }];
  },
};

export default nextConfig;
