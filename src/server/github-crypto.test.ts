import { describe, expect, it } from "vitest";
import { decryptTokenBundle, encryptTokenBundle, type GitHubTokenBundle } from "./github-crypto";

describe("GitHub token encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const bundle: GitHubTokenBundle = { accessToken: "access-secret", refreshToken: "refresh-secret", accessExpiresAt: "2026-10-15T00:00:00.000Z", refreshExpiresAt: "2026-11-15T00:00:00.000Z" };

  it("round trips with authenticated encryption", () => {
    const encrypted = encryptTokenBundle(bundle, key);
    expect(encrypted.ciphertext).not.toContain("access-secret");
    expect(decryptTokenBundle(encrypted, key)).toEqual(bundle);
  });

  it("rejects a wrong key and invalid key length", () => {
    const encrypted = encryptTokenBundle(bundle, key);
    expect(() => decryptTokenBundle(encrypted, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    expect(() => encryptTokenBundle(bundle, "bad-key")).toThrow(/32 bytes/);
  });
});
