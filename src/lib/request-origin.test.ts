import { describe, expect, it } from "vitest";
import { requestOrigin } from "./request-origin";

function requestHeaders(values: Record<string, string>) {
  return new Headers(values);
}

describe("requestOrigin", () => {
  it("uses the configured staging domain from the request instead of a Vercel deployment URL", () => {
    expect(requestOrigin(requestHeaders({
      host: "staging.hfy.app",
      "x-forwarded-host": "staging.hfy.app",
      "x-forwarded-proto": "https",
      "x-vercel-deployment-url": "hfy-os-git-staging-austyn-7123.vercel.app",
    }))).toBe("https://staging.hfy.app");
  });

  it("uses the production domain from a production request without environment-specific logic", () => {
    expect(requestOrigin(requestHeaders({
      host: "hfy.app",
      "x-forwarded-proto": "https",
    }))).toBe("https://hfy.app");
  });

  it("supports local development when forwarded headers are absent", () => {
    expect(requestOrigin(requestHeaders({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("fails closed when no request domain is available", () => {
    expect(() => requestOrigin(requestHeaders({}))).toThrow("Unable to determine the application domain.");
  });
});
