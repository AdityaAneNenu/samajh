import { AiError } from "@/lib/errors";

/**
 * Pull a JSON value out of a model response.
 *
 * Even with structured-output mode enabled, models occasionally wrap the
 * object in a ```json fence, prefix it with a sentence, or leave a trailing
 * comma. Rather than fail the whole request on cosmetics, we recover what we
 * can and hand the result to schema validation, which is the real gate.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new AiError("invalid_response", "Model returned an empty response", {
      detail: "empty completion",
    });
  }

  const candidates = [trimmed, unwrapFences(trimmed), sliceBraces(trimmed)];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(removeTrailingCommas(candidate));
      } catch {
        // try the next candidate
      }
    }
  }

  throw new AiError("invalid_response", "Model response was not JSON", {
    detail: `first 200 chars: ${trimmed.slice(0, 200)}`,
  });
}

function unwrapFences(text: string): string | null {
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return match?.[1]?.trim() ?? null;
}

/** Returns everything between the first `{` and the last `}`. */
function sliceBraces(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}