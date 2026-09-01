import { describe, expect, it } from "vitest";
import { requestOrigin } from "./request-origin";

function requestHeaders(values: Record<string, string>) {
  return new Headers(values);
}

describe("requestOrigin", () => {
  it("uses the configured staging domain even when the page is opened through a Vercel alias", () => {
    expect(requestOrigin(requestHeaders({
      host: "hfy-os-git-staging-austyn-7123.vercel.app",
      "x-forwarded-host": "hfy-os-git-staging-austyn-7123.vercel.app",
      "x-forwarded-proto": "https",
    }), { NEXT_PUBLIC_APP_URL: "https://staging.hfy.app" })).toBe("https://staging.hfy.app");
  });

  it("uses the configured production domain without separate production link logic", () => {
    expect(requestOrigin(requestHeaders({
      host: "hfy-os.vercel.app",
      "x-forwarded-proto": "https",
    }), { NEXT_PUBLIC_APP_URL: "https://hfy.app" })).toBe("https://hfy.app");
  });

  it("falls back to a validated custom request domain when no public origin is configured", () => {
    expect(requestOrigin(requestHeaders({
      host: "staging.hfy.app",
      "x-forwarded-host": "staging.hfy.app",
      "x-forwarded-proto": "https",
    }), {})).toBe("https://staging.hfy.app");
  });

  it("supports local development when forwarded headers are absent", () => {
    expect(requestOrigin(requestHeaders({ host: "localhost:3000" }), {})).toBe("http://localhost:3000");
  });

  it("fails closed when no request domain is available", () => {
    expect(() => requestOrigin(requestHeaders({}), {})).toThrow("Unable to determine the application domain.");
  });
});
