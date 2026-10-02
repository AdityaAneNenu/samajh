import type {
  ActionItem,
  Annotated,
  CautionItem,
  Explanation,
  GroundedItem,
  QuoteLocation,
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

/** How much surrounding text to include on each side of a located quote. */
const CONTEXT_CHARS = 160;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How many lines precede this offset, counted the way a reader would. */
function lineNumberOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

function buildLocation(
  source: string,
  start: number,
  end: number,
): QuoteLocation {
  const from = Math.max(0, start - CONTEXT_CHARS);
  const to = Math.min(source.length, end + CONTEXT_CHARS);
  const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

  return {
    line: lineNumberOf(source, start),
    before: tidy(source.slice(from, start)),
    match: tidy(source.slice(start, end)),
    after: tidy(source.slice(end, to)),
    trimmed: from > 0 || to < source.length,
  };
}

type Range = [start: number, end: number];

function exactRange(needle: string, source: string): Range | null {
  const index = source.indexOf(needle);
  return index === -1 ? null : [index, index + needle.length];
}

function caseInsensitiveRange(needle: string, source: string): Range | null {
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  return index === -1 ? null : [index, index + needle.length];
}

/**
 * Matches a quote whose only difference from the source is how whitespace fell.
 * Line breaks in a pasted document land in arbitrary places, so this is the
 * strategy that fires most often after the exact one.
 */
function whitespaceTolerantRange(needle: string, source: string): Range | null {
  const tokens = needle.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  const pattern = tokens.map(escapeRegExp).join("\\s+");
  try {
    const match = new RegExp(pattern, "i").exec(source);
    return match ? [match.index, match.index + match[0].length] : null;
  } catch {
    return null;
  }
}

/**
 * A quote may elide a middle section with an ellipsis. Locating the span from
 * the start of the first fragment to the end of the last gives a range that
 * covers the whole quoted idea.
 */
function fragmentRange(needle: string, source: string): Range | null {
  const fragments = needle
    .split(/\.{3}|…/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= MIN_QUOTE_LENGTH);
  if (fragments.length < 2) return null;

  const first = fragments[0];
  const last = fragments[fragments.length - 1];

  const head =
    exactRange(first, source) ??
    caseInsensitiveRange(first, source) ??
    whitespaceTolerantRange(first, source);
  if (!head) return null;

  const tailAt = source.toLowerCase().indexOf(last.toLowerCase(), head[1]);
  if (tailAt === -1) return null;

  return [head[0], tailAt + last.length];
}

/**
 * Find where a quote actually sits in the document.
 *
 * Returns `null` rather than a guess: verification is deliberately forgiving
 * about punctuation, and a forgiving match cannot be pinned to an offset. A
 * wrong line number would be worse than no line number, so the caller is told
 * there is no location and the interface stays quiet about it.
 */
export function locateQuote(quote: string, source: string): QuoteLocation | null {
  const needle = quote.trim();
  if (needle.length < MIN_QUOTE_LENGTH || source.length === 0) return null;

  const range =
    exactRange(needle, source) ??
    caseInsensitiveRange(needle, source) ??
    whitespaceTolerantRange(needle, source) ??
    fragmentRange(needle, source);

  return range ? buildLocation(source, range[0], range[1]) : null;
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

  /** Verify one quote-bearing item, and try to pin it to a place in the document. */
  const annotate = <T extends { quote: string }>(
    item: T,
    describe: (item: T) => string,
  ): Annotated<T> => {
    const verified = isQuoteGrounded(item.quote, source);
    if (!verified) failures.push(describe(item));
    return { ...item, verified, location: locateQuote(item.quote, source) };
  };

  const keyFacts = explanation.keyFacts.map((item) =>
    annotate(item, (fact) => `keyFacts → ${fact.label}`),
  );

  const actions = explanation.actions.map((item) =>
    annotate(item, (action) => `actions → ${action.instruction.slice(0, 60)}`),
  );

  const watchOutFor = explanation.watchOutFor.map((item) =>
    annotate(item, (caution) => `watchOutFor → ${caution.note.slice(0, 60)}`),
  );

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