import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/extract-text/route";
import { MAX_REQUEST_BYTES } from "@/lib/constants";
import { resetRateLimits } from "@/lib/rateLimit";
import { makePdf } from "./helpers/makePdf";

const DOCUMENT_PDF = makePdf([
  "NOTICE FROM STATE ELECTRICITY BOARD",
  "Your electricity connection number is 1234567",
  "Amount payable Rs 4250 within 15 days",
]);

/**
 * `Request` will not take a `Uint8Array` directly under these type definitions,
 * so the exact byte range is sliced out of its backing buffer.
 */
const toBody = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const post = (
  body: Uint8Array | string,
  headers: Record<string, string> = {},
) =>
  new Request("http://localhost/api/extract-text", {
    method: "POST",
    headers: { "content-type": "application/pdf", ...headers },
    body: typeof body === "string" ? body : toBody(body),
  });

const headerOnly = (headers: Record<string, string>): Request =>
  ({ headers: new Headers(headers) }) as unknown as Request;

beforeEach(() => resetRateLimits());
afterEach(() => resetRateLimits());

describe("POST /api/extract-text", () => {
  it("returns the document's text so the reader can see what was read", async () => {
    const response = await POST(post(DOCUMENT_PDF));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.text).toContain("STATE ELECTRICITY BOARD");
    expect(body.pages).toBe(1);
    expect(body.truncated).toBe(false);
  });

  it("rejects a request posted by another site", async () => {
    const response = await POST(post(DOCUMENT_PDF, { origin: "https://evil.test" }));
    expect(response.status).toBe(403);
  });

  it("refuses an oversized upload before reading it", async () => {
    const response = await POST(
      headerOnly({ "content-length": String(MAX_REQUEST_BYTES + 1) }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error).toContain("too large");
  });

  it("answers 422, not 500, when the file is not a PDF", async () => {
    const response = await POST(post("this is not a pdf"));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("not a PDF");
  });

  it("points at the photograph path when a PDF has no text layer", async () => {
    const response = await POST(post(makePdf([])));
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error).toContain("no readable text");
    expect(body.error).toContain("photo");
  });

  it("stops a caller who keeps uploading, without parsing anything", async () => {
    // Cheap non-PDF bodies consume the budget without invoking the parser,
    // so this stays fast while still exercising the limiter.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const allowed = await POST(post("not a pdf"));
      expect(allowed.status).toBe(422);
    }

    const blocked = await POST(post("not a pdf"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});