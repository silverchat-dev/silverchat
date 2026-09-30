import { readFileSync } from "node:fs";

import type { NextConfig } from "next";
import { keccak256 } from "viem";

// The rules the app runs by, hashed at build time. SilverAlgorithm holds the published hash; /algorithm shows both.
const RULES_HASH = keccak256(readFileSync(new URL("src/lib/algorithm.ts", import.meta.url)));

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_RULES_HASH: RULES_HASH,
    NEXT_PUBLIC_COMMIT: process.env.NEXT_PUBLIC_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "main",
  },
  // the data is public on purpose: other clients may read it (Snowmoon, ch. 3)
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "access-control-allow-origin", value: "*" },
          { key: "access-control-allow-methods", value: "GET, POST, OPTIONS" },
          { key: "access-control-allow-headers", value: "content-type, x-rewards-signature" },
          { key: "access-control-max-age", value: "86400" },
        ],
      },
      {
        // people sign and approve ZC here: HTTPS only, never inside someone else's frame
        source: "/:path*",
        headers: [
          { key: "strict-transport-security", value: "max-age=31536000; includeSubDomains" },
          { key: "x-frame-options", value: "DENY" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "permissions-policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // one origin for the site and for wallet sessions
  async redirects() {
    return [{ source: "/:path*", has: [{ type: "host", value: "www.silverchat.cash" }], destination: "https://silverchat.cash/:path*", permanent: true }];
  },
};

export default nextConfig;
