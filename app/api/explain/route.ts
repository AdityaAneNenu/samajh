import { NextResponse } from "next/server";
import { AiError } from "@/lib/errors";
import { clientKey, contentLengthExceeds, isSameOrigin } from "@/lib/http";
import { checkRateLimit } from "@/lib/rateLimit";
import { explainDocument, parseExplainInput } from "@/services/ai";

/**
 * The only endpoint that touches a model, and therefore the only place the
 * provider credential exists. Nothing here is ever sent to the browser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "That request came from another website." },
      { status: 403 },
    );
  }

  if (contentLengthExceeds(request)) {
    return NextResponse.json(
      { error: "That document is far too big to read. Try one page at a time." },
      { status: 413 },
    );
  }

  const limit = checkRateLimit(clientKey(request));
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return NextResponse.json(
      {
        error: `That is a lot of documents in a row. Please wait about ${minutes} minute${
          minutes === 1 ? "" : "s"
        } and try again.`,
      },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "We could not read that request. Please try again." },
      { status: 400 },
    );
  }

  const parsed = parseExplainInput(body);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: "Something in the form needs fixing before we can read the document.",
        issues: parsed.issues,
      },
      { status: 400 },
    );
  }

  try {
    const result = await explainDocument(parsed.input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const aiError = AiError.fromUnknown(error);

    // Technical detail stays in the server log. It never contains the
    // document, the quotes, or the API key.
    console.error(
      `[samajh] explain failed [${aiError.kind}]: ${aiError.detail}`,
    );

    return NextResponse.json(
      { error: aiError.userFacing.message, kind: aiError.kind },
      { status: aiError.userFacing.status },
    );
  }
}