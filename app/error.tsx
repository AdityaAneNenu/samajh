"use client";

import { useEffect } from "react";

/**
 * The last resort for an unexpected failure while rendering.
 *
 * Next.js would otherwise show its own unstyled error page. This keeps the
 * visitor inside the product's voice and, importantly, keeps the technical
 * detail out of their view — `error.message` in production can contain
 * internals, so only the opaque `digest` is ever shown, and only as a code
 * they can quote if they report it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[samajh] unexpected error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="space-y-4 rounded-lg border border-warn/30 bg-warn-soft p-5">
      <h1 className="font-serif text-xl text-ink">
        Something went wrong on our side
      </h1>
      <p className="text-sm leading-relaxed text-warn">
        This isn&rsquo;t anything you did, and nothing you typed was saved
        anywhere. Press the button below to try again.
      </p>

      {error.digest && (
        <p className="text-xs text-muted">
          If you need to report this, mention code{" "}
          <code className="rounded bg-surface px-1 py-0.5">
            {error.digest}
          </code>
          .
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper"
      >
        Try again
      </button>
    </div>
  );
}