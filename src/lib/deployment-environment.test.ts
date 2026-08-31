import { describe, expect, it } from "vitest";
import { isStagingEnvironment } from "./deployment-environment";

describe("isStagingEnvironment", () => {
  it("recognizes Vercel preview and named staging targets", () => {
    expect(isStagingEnvironment({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isStagingEnvironment({ VERCEL_TARGET_ENV: "staging" })).toBe(true);
  });

  it("recognizes the canonical staging domain", () => {
    expect(isStagingEnvironment({ NEXT_PUBLIC_APP_URL: "https://staging.hfy.app" })).toBe(true);
  });

  it("leaves production and local development unmarked", () => {
    expect(isStagingEnvironment({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://hfy.app" })).toBe(false);
    expect(isStagingEnvironment({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(false);
  });
});
