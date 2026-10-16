import { describe, expect, it } from "vitest";
import { readBoundedResponseText, ResponseTooLargeError } from "./bounded-response";

describe("readBoundedResponseText", () => {
  it("reads a response under its byte limit", async () => {
    await expect(readBoundedResponseText(new Response("safe"), 8)).resolves.toBe("safe");
  });

  it("rejects a response that exceeds its byte limit", async () => {
    await expect(readBoundedResponseText(new Response("too large"), 3)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("rejects an oversized content-length before reading", async () => {
    const response = new Response("ignored", { headers: { "content-length": "200" } });
    await expect(readBoundedResponseText(response, 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});
