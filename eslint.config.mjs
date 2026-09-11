import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/outbound-email.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "resend",
          message: "Use the central outbound-email service so staging recipient routing cannot be bypassed.",
        }],
      }],
    },
  },
  {
    files: ["src/services/platform-billing-*.ts", "src/services/platform-stripe*.ts"],
    ignores: ["src/services/platform-billing-email.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "resend",
            message: "Use the central outbound-email service so staging recipient routing cannot be bypassed.",
          },
          {
            name: "@/services/outbound-email",
            message: "Platform billing email must use the per-Residency platform-billing-email safety service.",
          },
        ],
      }],
    },
  },
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
