import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The 3D world changes three.js objects (uniforms, positions, materials) inside the frame loop, which is how
  // react-three-fiber is meant to be used. These rules are written for the React Compiler, which this app does not run.
  {
    files: ["src/world/**"],
    rules: { "react-hooks/immutability": "off", "react-hooks/refs": "off", "react-hooks/purity": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
