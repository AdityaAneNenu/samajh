import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/explain/route";
import { MAX_REQUEST_BYTES } from "@/lib/constants";
import { DEFAULT_LIMIT, resetRateLimits } from "@/lib/rateLimit";

/**
 * The route is the trust boundary: it validates who asked, how much they sent,
 * how often, and whether the body is usable. All of it was previously
 * unverified.
 */

const DOCUMENT = `NOTICE FROM STATE ELECTRICITY BOARD
Your electricity connection number is 1234567.
Amount payable: Rs. 4,250 within 15 days from the date of this letter.
A late payment surcharge of 2% applies after the due date.`;

const savedProvider = process.env.AI_PROVIDER;

const jsonRequest = (
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Request =>
  new Request("http://localhost/api/explain", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });

const headerOnly = (headers: Record<string, string>): Request =>
  ({ headers: new Headers(headers) }) as unknown as Request;

beforeEach(() => {
  process.env.AI_PROVIDER = "mock";
  resetRateLimits();
});

afterEach(() => {
  if (savedProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = savedProvider;
  resetRateLimits();
});

describe("POST /api/explain", () => {
  it("reads a document and returns a grounded result", async () => {
    const response = await POST(
      jsonRequest({ text: DOCUMENT, language: "en" }),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.documentType).toBeTruthy();
    expect(body.language).toBe("en");
    expect(body.unverifiedQuotes).toBe(0);
    expect(body.quotesChecked).toBeGreaterThan(0);
    expect(body).toHaveProperty("model");
  });

  it("rejects a browser request posted from another site", async () => {
    const response = await POST(
      jsonRequest(
        { text: DOCUMENT, language: "en" },
        { origin: "https://evil.test" },
      ),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("another website");
  });

  it("refuses an oversized body before reading it", async () => {
    const response = await POST(
      headerOnly({ "content-length": String(MAX_REQUEST_BYTES + 1) }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error).toContain("too big");
  });

  it("answers a malformed JSON body with a usable message", async () => {
    const response = await POST(
      new Request("http://localhost/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("could not read that request");
  });

  it("reports which field was wrong instead of a generic failure", async () => {
    const response = await POST(jsonRequest({ text: "hi", language: "en" }));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].field).toBe("text");
    expect(body.issues[0].message).toContain("enough text");
    // and it must read like a sentence, not like a validation code
    expect(body.issues[0].message).toMatch(/^[A-Z].*\.$/);
  });

  it("stops a caller who keeps going", async () => {
    for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt += 1) {
      const allowed = await POST(
        jsonRequest({ text: DOCUMENT, language: "en" }),
      );
      expect(allowed.status).toBe(200);
    }

    const blocked = await POST(jsonRequest({ text: DOCUMENT, language: "en" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await blocked.json()).error).toContain("a lot of documents");
  });

  it("tells a caller plainly when this deployment reads text only", async () => {
    const response = await POST(
      jsonRequest({
        language: "en",
        image: { mediaType: "image/png", dataBase64: "A".repeat(200) },
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("not photographs");
  });

  it("explains calmly when the provider is not configured", async () => {
    delete process.env.AI_PROVIDER;

    const response = await POST(jsonRequest({ text: DOCUMENT, language: "en" }));
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.kind).toBe("config");
    // the message is for the person; it must not name environment variables
    expect(body.error).not.toContain("AI_");
  });
});