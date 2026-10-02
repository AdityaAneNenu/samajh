import { NextResponse } from "next/server";
import { getAiStatus } from "@/services/ai";

/**
 * A health check for containers and uptime monitors.
 *
 * Deliberately terse. It reports whether the app can serve and whether a
 * provider has been configured — never the credential, never a document.
 *
 * It answers 200 even when `aiReady` is false: the app is working correctly,
 * it is simply unconfigured, and it says so on screen. A 5xx here would make an
 * orchestrator restart a container that has nothing wrong with it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getAiStatus();

  return NextResponse.json(
    {
      status: "ok",
      aiReady: status.ready,
      provider: status.provider,
      supportsImages: status.supportsImages,
      promptVersion: status.promptVersion,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}