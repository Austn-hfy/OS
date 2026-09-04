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
  globalIgnores([".next/**", "coverage/**", "drizzle/meta/**", "next-env.d.ts"]),
]);
