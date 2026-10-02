import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  it("allows up to the limit, then refuses with a retry hint", () => {
    resetRateLimits();
    const options = { limit: 3, windowMs: 1000, now: 1_000_000 };

    expect(checkRateLimit("a", options).allowed).toBe(true);
    expect(checkRateLimit("a", options).allowed).toBe(true);
    const third = checkRateLimit("a", options);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = checkRateLimit("a", options);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBe(1);
  });

  it("counts each caller separately", () => {
    resetRateLimits();
    const options = { limit: 1, windowMs: 1000, now: 5_000 };

    expect(checkRateLimit("a", options).allowed).toBe(true);
    expect(checkRateLimit("a", options).allowed).toBe(false);
    expect(checkRateLimit("b", options).allowed).toBe(true);
  });

  it("lets a caller back in after the window passes", () => {
    resetRateLimits();
    const base = { limit: 1, windowMs: 1000 };

    expect(checkRateLimit("a", { ...base, now: 1_000 }).allowed).toBe(true);
    expect(checkRateLimit("a", { ...base, now: 1_500 }).allowed).toBe(false);
    expect(checkRateLimit("a", { ...base, now: 2_100 }).allowed).toBe(true);
  });

  it("reports remaining requests so the UI could warm the user", () => {
    resetRateLimits();
    const options = { limit: 5, windowMs: 1000, now: 42 };
    expect(checkRateLimit("z", options).remaining).toBe(4);
    expect(checkRateLimit("z", options).remaining).toBe(3);
  });
});