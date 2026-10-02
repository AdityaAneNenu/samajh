/**
 * Small request-hygiene helpers. Kept dependency-free and pure so they are
 * trivial to test.
 */

/** Largest request body we will even look at, before validation runs. */
export const MAX_REQUEST_BYTES = 512 * 1024;

export function contentLengthExceeds(
  request: Request,
  limit: number = MAX_REQUEST_BYTES,
): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const size = Number(raw);
  return Number.isFinite(size) && size > limit;
}

/**
 * Blocks cross-site browser POSTs.
 *
 * A browser always sends `Origin` on a cross-origin POST. Non-browser callers
 * (curl, the test suite) send none, so a missing header is allowed — this
 * guards against a hostile page spending our API budget, which is the real
 * risk for an endpoint with no accounts and no cookies.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host = request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Best-effort client identity, for rate limiting only. Never stored. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}