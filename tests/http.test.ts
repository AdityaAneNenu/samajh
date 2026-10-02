import { describe, expect, it } from "vitest";
import {
  clientKey,
  contentLengthExceeds,
  isSameOrigin,
  MAX_REQUEST_BYTES,
} from "@/lib/http";

/**
 * These helpers only read `request.headers`, so they are exercised with a
 * header-only stand-in. Building a real `Request` would not work for the
 * cases that matter here: the Fetch spec forbids callers from setting `Host`
 * on a request, and undici recomputes `Content-Length` from the body, which
 * would silently defeat the oversize test.
 */
const withHeaders = (headers: Record<string, string>): Request =>
  ({ headers: new Headers(headers) }) as unknown as Request;

describe("isSameOrigin", () => {
  it("allows a browser request from the same host", () => {
    expect(
      isSameOrigin(
        withHeaders({ origin: "https://samajh.test", host: "samajh.test" }),
      ),
    ).toBe(true);
  });

  it("allows a same-origin request that includes a port", () => {
    expect(
      isSameOrigin(
        withHeaders({ origin: "http://localhost:3000", host: "localhost:3000" }),
      ),
    ).toBe(true);
  });

  it("blocks a request posted by another site", () => {
    expect(
      isSameOrigin(
        withHeaders({ origin: "https://evil.test", host: "samajh.test" }),
      ),
    ).toBe(false);
  });

  it("blocks a subdomain that is not the same host", () => {
    expect(
      isSameOrigin(
        withHeaders({ origin: "https://evil.samajh.test", host: "samajh.test" }),
      ),
    ).toBe(false);
  });

  it("allows non-browser callers, which send no Origin at all", () => {
    expect(isSameOrigin(withHeaders({ host: "samajh.test" }))).toBe(true);
  });

  it("refuses when the hosts cannot be compared", () => {
    expect(isSameOrigin(withHeaders({ origin: "https://samajh.test" }))).toBe(
      false,
    );
    expect(
      isSameOrigin(withHeaders({ origin: "not a url", host: "samajh.test" })),
    ).toBe(false);
  });
});

describe("contentLengthExceeds", () => {
  it("allows a request that declares no length", () => {
    expect(contentLengthExceeds(withHeaders({}))).toBe(false);
  });

  it("allows a body at the limit", () => {
    expect(
      contentLengthExceeds(
        withHeaders({ "content-length": String(MAX_REQUEST_BYTES) }),
      ),
    ).toBe(false);
  });

  it("rejects a body over the limit", () => {
    expect(
      contentLengthExceeds(
        withHeaders({ "content-length": String(MAX_REQUEST_BYTES + 1) }),
      ),
    ).toBe(true);
  });

  it("honours a custom limit", () => {
    expect(
      contentLengthExceeds(withHeaders({ "content-length": "200" }), 100),
    ).toBe(true);
  });

  it("ignores a content-length that is not a number", () => {
    expect(
      contentLengthExceeds(withHeaders({ "content-length": "not-a-number" })),
    ).toBe(false);
  });
});

describe("clientKey", () => {
  it("uses the first address in x-forwarded-for, not the whole chain", () => {
    expect(
      clientKey(withHeaders({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(withHeaders({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to a single bucket when where the request came from is unknown", () => {
    expect(clientKey(withHeaders({}))).toBe("unknown");
  });

  it("does not throw on a malformed x-forwarded-for", () => {
    expect(clientKey(withHeaders({ "x-forwarded-for": "," }))).toBe("unknown");
  });
});