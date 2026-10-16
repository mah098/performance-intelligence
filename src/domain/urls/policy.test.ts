import { describe, expect, it } from "vitest";
import { canonicalizePublicHttpsUrl, UnsafeUrlError } from "./policy";

describe("canonicalizePublicHttpsUrl", () => {
  it("canonicalizes a valid public HTTPS URL", () => {
    expect(canonicalizePublicHttpsUrl(" HTTPS://Example.com/page#section ")).toBe("https://example.com/page");
  });

  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://localhost",
    "https://app.localhost",
    "https://127.0.0.1",
    "https://10.1.2.3",
    "https://169.254.169.254",
    "https://[::1]/",
    "https://[fc00::1]/",
    "https://example.test",
  ])("rejects unsafe URL %s", (value) => {
    expect(() => canonicalizePublicHttpsUrl(value)).toThrow(UnsafeUrlError);
  });

  it("sorts query parameters while preserving their values", () => {
    expect(canonicalizePublicHttpsUrl("https://example.com/p?z=2&a=1")).toBe("https://example.com/p?a=1&z=2");
  });
});
