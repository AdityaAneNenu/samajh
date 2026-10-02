import { NextResponse } from "next/server";
import { MAX_REQUEST_BYTES } from "@/lib/constants";
import { clientKey, contentLengthExceeds, isSameOrigin } from "@/lib/http";
import { extractPdfText } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Turn an uploaded PDF into text.
 *
 * Deliberately separate from `/api/explain`. Extraction costs CPU but no
 * inference, and — more importantly — it lets the reader *see* the text that
 * was read before anything is analysed. If a PDF turned out to be a scan, or the
 * text came out garbled, they find out here rather than being handed a
 * confident reading of nonsense.
 *
 * It also means every quote is verified against exactly the text on screen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cheaper than inference, so the budget is more generous. */
const EXTRACT_LIMIT = 20;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "That request came from another website." },
      { status: 403 },
    );
  }

  if (contentLengthExceeds(request, MAX_REQUEST_BYTES)) {
    return NextResponse.json(
      {
        error:
          "That PDF is too large to read. Try a smaller file, or one section at a time.",
      },
      { status: 413 },
    );
  }

  const limit = checkRateLimit(`pdf:${clientKey(request)}`, {
    limit: EXTRACT_LIMIT,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "That is a lot of files in a row. Please wait a minute and try again." },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "We could not read that upload. Please try again." },
      { status: 400 },
    );
  }

  const result = await extractPdfText(bytes);
  if (!result.ok) {
    // 422, not 500: the request was understood; the content could not be read.
    return NextResponse.json({ error: result.message }, { status: 422 });
  }

  return NextResponse.json(result.document, { status: 200 });
}