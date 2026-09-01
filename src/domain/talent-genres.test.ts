import { describe, expect, it } from "vitest";
import { resolveClientArtistGenre } from "@/domain/talent-genres";

describe("client-owned artist genres", () => {
  it("accepts every preset and a trimmed custom value", () => {
    expect(resolveClientArtistGenre("Vinyl", "")).toBe("Vinyl");
    expect(resolveClientArtistGenre("custom", "  Afro House  ")).toBe("Afro House");
  });

  it("rejects an empty custom value and unknown preset", () => {
    expect(() => resolveClientArtistGenre("custom", "   ")).toThrow();
    expect(() => resolveClientArtistGenre("Unknown", "")).toThrow();
  });
});
