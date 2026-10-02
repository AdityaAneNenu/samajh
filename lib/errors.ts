/**
 * One error type for everything that can go wrong between the app and the
 * model. Each kind carries both a technical detail (for the server log) and a
 * calm, actionable message (for the person holding the phone).
 *
 * The rule: technical detail never reaches the browser; the person never sees
 * a stack trace or a status code.
 */

export type AiErrorKind =
  | "config"
  | "timeout"
  | "rate_limit"
  | "unavailable"
  | "network"
  | "invalid_response"
  | "too_large"
  | "unknown";

export interface UserFacingError {
  /** HTTP status this failure should be reported as. */
  status: number;
  /** Plain-language message safe to show to a non-technical reader. */
  message: string;
}

const USER_FACING: Record<AiErrorKind, UserFacingError> = {
  config: {
    status: 503,
    message:
      "The document reader isn't set up yet, so it can't read anything. Whoever runs this app needs to add the AI settings.",
  },
  timeout: {
    status: 504,
    message:
      "Reading this took too long, so we stopped rather than leave you waiting. Try again, or try a shorter part of the document.",
  },
  rate_limit: {
    status: 429,
    message:
      "The reader is busy right now. Wait a few seconds and try again — nothing was lost.",
  },
  unavailable: {
    status: 502,
    message:
      "We couldn't read this document just now. Please try again in a moment.",
  },
  network: {
    status: 502,
    message:
      "We couldn't reach the reader. Check your internet connection and try again.",
  },
  invalid_response: {
    status: 422,
    message:
      "We couldn't read this document reliably, so we'd rather say so than guess. Try a sharper photo, or paste the text instead.",
  },
  too_large: {
    status: 413,
    message:
      "This document is too long to read in one go. Try one page or one section at a time.",
  },
  unknown: {
    status: 500,
    message: "Something went wrong on our side. Please try again.",
  },
};

/**
 * Strip a known secret out of text that is about to be logged.
 *
 * Providers sometimes echo request metadata — including the Authorization
 * header — back in an error body. Logging that verbatim would write the API
 * key into the server log, so anything that looks like our key is removed
 * before the detail string is kept.
 */
export function redactSecret(
  text: string,
  secret: string | null | undefined,
): string {
  let scrubbed = text;

  if (secret && secret.length >= 8) {
    scrubbed = scrubbed.split(secret).join("[redacted]");
  }

  // Backstop for any credential shape we did not anticipate.
  return scrubbed
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(?:sk|gsk|hf|api|key|token)[-_][A-Za-z0-9._~+/=-]{12,}/gi,
      "[redacted]",
    );
}

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** Non-secret technical detail, for server logs only. */
  readonly detail: string;

  constructor(
    kind: AiErrorKind,
    message: string,
    options?: { detail?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AiError";
    this.kind = kind;
    this.detail = options?.detail ?? message;
  }

  get userFacing(): UserFacingError {
    return USER_FACING[this.kind];
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.kind === "timeout" ||
      this.kind === "rate_limit" ||
      this.kind === "unavailable" ||
      this.kind === "network"
    );
  }

  static fromHttpStatus(status: number, detail: string): AiError {
    if (status === 401 || status === 403) {
      return new AiError("config", "AI provider rejected our credentials", {
        detail: `HTTP ${status}: ${detail}`,
      });
    }
    if (status === 429) {
      return new AiError("rate_limit", "AI provider rate limited us", {
        detail: `HTTP ${status}: ${detail}`,
      });
    }
    if (status === 413) {
      return new AiError("too_large", "AI provider rejected the payload size", {
        detail: `HTTP ${status}: ${detail}`,
      });
    }
    if (status >= 500) {
      return new AiError("unavailable", "AI provider failed", {
        detail: `HTTP ${status}: ${detail}`,
      });
    }
    return new AiError("unknown", "AI provider refused the request", {
      detail: `HTTP ${status}: ${detail}`,
    });
  }

  static fromUnknown(error: unknown): AiError {
    if (error instanceof AiError) return error;

    if (error instanceof Error && error.name === "AbortError") {
      return new AiError("timeout", "AI request aborted", {
        detail: "Request exceeded AI_TIMEOUT_MS",
        cause: error,
      });
    }

    if (error instanceof TypeError) {
      return new AiError("network", "Could not reach the AI provider", {
        detail: error.message,
        cause: error,
      });
    }

    return new AiError("unknown", "Unexpected failure", {
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
}