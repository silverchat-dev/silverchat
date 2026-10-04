// zkAPI's browser files (proof worker, wasm, proving keys, the pinned mainnet config) come from the pinned SDK and are
// checked against its own hashes; they are built into public/zkapi before every build, not kept in git
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { build } from "esbuild";
import { buildBrowserSdkAssets } from "@openanonymity/zkapi-browser-sdk/build";

const OUT = "public/zkapi";
await buildBrowserSdkAssets({ outDir: OUT, network: "mainnet", publicPath: "/zkapi/", build });

// the live mainnet deployment moved its key verifier after the SDK's last release; the SDK refuses any verifier the
// deployment does not name, so pin the one it names now (the same one zkAPI's own chat app pins)
const VERIFIER = "https://verifier-production-20260917.openanonymity.ai";
const file = `${OUT}/browser-config.json`;
const config = JSON.parse(await readFile(file, "utf8"));
config.trusted_deployment.verifier_url = VERIFIER;
const text = `${JSON.stringify(config, null, 2)}\n`;
await writeFile(file, text);
const assets = JSON.parse(await readFile(`${OUT}/sdk-assets.json`, "utf8"));
assets.files["browser-config.json"] = createHash("sha256").update(text).digest("hex");
await writeFile(`${OUT}/sdk-assets.json`, `${JSON.stringify(assets, null, 2)}\n`);
console.log("zkapi assets: public/zkapi");
