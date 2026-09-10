import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "coverage/**",
    "output/**",
    "tmp/**",
    "drizzle/meta/**",
    "HFY_OS_Database_Crash_Fix_Package_2026-08-31/**",
    "HFY_OS_LAST_SESSION_REVIEW_PACKAGE_2026-08-26/**",
    "**/* 2.ts",
    "**/* 2.tsx",
    "next-env.d.ts",
  ]),
]);
