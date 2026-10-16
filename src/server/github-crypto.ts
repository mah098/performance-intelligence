import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type GitHubTokenBundle = { accessToken: string; refreshToken: string | null; accessExpiresAt: string; refreshExpiresAt: string | null };
export type EncryptedBundle = { ciphertext: string; iv: string; tag: string; keyVersion: "env-v1" };

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}

export function encryptTokenBundle(bundle: GitHubTokenBundle, keyBase64: string): EncryptedBundle {
  const key = decodeKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), keyVersion: "env-v1" };
}

export function decryptTokenBundle(encrypted: EncryptedBundle, keyBase64: string): GitHubTokenBundle {
  const key = decodeKey(keyBase64);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<GitHubTokenBundle>;
  if (typeof parsed.accessToken !== "string" || typeof parsed.accessExpiresAt !== "string") throw new Error("Stored GitHub token bundle is invalid.");
  return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken ?? null, accessExpiresAt: parsed.accessExpiresAt, refreshExpiresAt: parsed.refreshExpiresAt ?? null };
}
