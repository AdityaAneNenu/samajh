import { describe, expect, it } from "vitest";
import { AiError, redactSecret } from "@/lib/errors";

describe("AiError", () => {
  it("maps provider statuses to the right kinds", () => {
    expect(AiError.fromHttpStatus(401, "bad key").kind).toBe("config");
    expect(AiError.fromHttpStatus(403, "forbidden").kind).toBe("config");
    expect(AiError.fromHttpStatus(429, "slow down").kind).toBe("rate_limit");
    expect(AiError.fromHttpStatus(413, "too big").kind).toBe("too_large");
    expect(AiError.fromHttpStatus(500, "boom").kind).toBe("unavailable");
    expect(AiError.fromHttpStatus(503, "boom").kind).toBe("unavailable");
    expect(AiError.fromHttpStatus(400, "bad request").kind).toBe("unknown");
  });

  it("only offers to retry the failures that could succeed", () => {
    expect(new AiError("rate_limit", "x").isRetryable).toBe(true);
    expect(new AiError("timeout", "x").isRetryable).toBe(true);
    expect(new AiError("unavailable", "x").isRetryable).toBe(true);
    expect(new AiError("network", "x").isRetryable).toBe(true);
    expect(new AiError("invalid_response", "x").isRetryable).toBe(false);
    expect(new AiError("config", "x").isRetryable).toBe(false);
    expect(new AiError("too_large", "x").isRetryable).toBe(false);
  });

  it("turns an abort into a timeout", () => {
    const error = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(AiError.fromUnknown(error).kind).toBe("timeout");
  });

  it("turns a fetch TypeError into a network error", () => {
    expect(AiError.fromUnknown(new TypeError("fetch failed")).kind).toBe(
      "network",
    );
  });

  it("passes an AiError through unchanged", () => {
    const original = new AiError("config", "nope");
    expect(AiError.fromUnknown(original)).toBe(original);
  });

  it("keeps technical detail out of the message shown to a person", () => {
    const error = AiError.fromHttpStatus(401, "bad credentials");
    expect(error.userFacing.message).not.toContain("401");
    expect(error.userFacing.message.toLowerCase()).not.toContain("credential");
    expect(error.detail).toContain("401");
  });

  it("gives every kind a status and a message a person can act on", () => {
    for (const kind of [
      "config",
      "timeout",
      "rate_limit",
      "unavailable",
      "network",
      "invalid_response",
      "too_large",
      "unknown",
    ] as const) {
      const facing = new AiError(kind, "x").userFacing;
      expect(facing.status).toBeGreaterThanOrEqual(400);
      expect(facing.message.length).toBeGreaterThan(20);
      expect(facing.message).not.toMatch(/undefined|null|\{\}/);
    }
  });
});

describe("redactSecret", () => {
  it("removes the exact credential from a provider error body", () => {
    const key = "gsk_live_abcdefghijklmnop123456";
    const body = `{"error":"invalid api key: ${key}"}`;
    const scrubbed = redactSecret(body, key);
    expect(scrubbed).not.toContain(key);
    expect(scrubbed).toContain("[redacted]");
  });

  it("removes bearer tokens it was not told about", () => {
    const scrubbed = redactSecret("Authorization: Bearer abc123def456ghi789", null);
    expect(scrubbed).not.toContain("abc123def456ghi789");
  });

  it("removes key-shaped strings it was not told about", () => {
    const scrubbed = redactSecret("token=gsk_0123456789abcdefghij", null);
    expect(scrubbed).not.toContain("0123456789abcdefghij");
  });

  it("leaves ordinary text alone", () => {
    const text = "HTTP 429: rate limit exceeded for model qwen3-8b";
    expect(redactSecret(text, "gsk_live_abcdefgh")).toBe(text);
  });
});