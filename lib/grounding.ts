import type {
  ActionItem,
  Annotated,
  CautionItem,
  Explanation,
  GroundedItem,
} from "@/services/ai/schemas";

/**
 * Quote verification.
 *
 * The prompt tells the model that every claim must carry a quote copied
 * character-for-character from the document. Prompts are requests, not
 * guarantees, so we check.
 *
 * This is the part of the project that makes it trustworthy: a model can be
 * fluent and confidently wrong at the same time, and a reader who is not
 * fluent in official English has no way to catch it. Verifying each quote
 * against the text the reader supplied gives them a way.
 *
 * The checking is deliberately forgiving about cosmetics (OCR turns “ into ",
 * copy-paste turns a non-breaking space into a space, line breaks land
 * anywhere) and strict about substance (a quote that is not in the document is
 * not in the document).
 */

/** Folds the cosmetic differences that OCR and copy-paste introduce. */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-, punctuation- and space-insensitive form, for the last-resort check. */
function squeeze(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

const MIN_QUOTE_LENGTH = 6;

export function isQuoteGrounded(quote: string, source: string): boolean {
  const needle = normalizeForMatching(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return false;

  const haystack = normalizeForMatching(source);
  if (haystack.includes(needle)) return true;

  // A quote may elide a middle section with an ellipsis. Each side of the
  // ellipsis is then checked on its own.
  const fragments = needle
    .split(/\.{3}|…/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= MIN_QUOTE_LENGTH);
  if (fragments.length > 1 && fragments.every((f) => haystack.includes(f))) {
    return true;
  }

  // Last resort: compare with all punctuation and spacing removed. Catches
  // "Rs. 4,250" against "Rs 4250" and similar OCR noise.
  const squashed = squeeze(needle);
  return squashed.length >= 10 && squeeze(haystack).includes(squashed);
}

export interface GroundingOutcome {
  keyFacts: Annotated<GroundedItem>[];
  actions: Annotated<ActionItem>[];
  watchOutFor: Annotated<CautionItem>[];
  checked: number;
  unverified: number;
  /** Human-readable list of what failed, for the server log. */
  failures: string[];
}

/**
 * Mark every quote-bearing item as verified or not.
 *
 * Unverified items are kept, not deleted: the reader is told that this one
 * quote could not be found, which is more useful than a silently shorter
 * answer. This function never throws — verification is a reporting step, not
 * a gate. The gate is the schema.
 */
export function annotateGrounding(
  explanation: Explanation,
  source: string,
): GroundingOutcome {
  const failures: string[] = [];

  const keyFacts = explanation.keyFacts.map((item) => {
    const verified = isQuoteGrounded(item.quote, source);
    if (!verified) failures.push(`keyFacts → ${item.label}`);
    return { ...item, verified };
  });

  const actions = explanation.actions.map((item) => {
    const verified = isQuoteGrounded(item.quote, source);
    if (!verified) failures.push(`actions → ${item.instruction.slice(0, 60)}`);
    return { ...item, verified };
  });

  const watchOutFor = explanation.watchOutFor.map((item) => {
    const verified = isQuoteGrounded(item.quote, source);
    if (!verified) failures.push(`watchOutFor → ${item.note.slice(0, 60)}`);
    return { ...item, verified };
  });

  const checked = keyFacts.length + actions.length + watchOutFor.length;
  return {
    keyFacts,
    actions,
    watchOutFor,
    checked,
    unverified: failures.length,
    failures,
  };
}