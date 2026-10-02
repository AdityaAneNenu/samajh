import { z } from "zod";
import {
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BASE64_CHARS,
  MAX_TEXT_CHARS,
  MIN_TEXT_LENGTH,
} from "@/lib/constants";
import { LANGUAGE_CODES } from "@/lib/languages";

/**
 * The contract between this application and the model.
 *
 * Two schemas matter:
 *   `explainInputSchema`  — what the app will accept from a human.
 *   `explanationSchema`   — what the model must return, and what the UI is
 *                           allowed to render.
 *
 * Nothing the model produces reaches the screen without passing through
 * `explanationSchema` first. A response that fails validation is repaired once
 * and then rejected — we never render unvalidated model output.
 */

export const languageCodeSchema = z.enum(LANGUAGE_CODES);

export const imageSchema = z.object({
  mediaType: z.enum(IMAGE_MEDIA_TYPES),
  /** Base64 only — no data URL prefix. */
  dataBase64: z.string().min(100).max(MAX_IMAGE_BASE64_CHARS),
});

export type ExplainImage = z.infer<typeof imageSchema>;

export const explainInputSchema = z
  .object({
    /** The document's text — pasted, or extracted from an upload. */
    text: z.string().trim().max(MAX_TEXT_CHARS).optional(),
    /** A photograph of the document, for a vision-capable model. */
    image: imageSchema.optional(),
    /** The language the reader wants the explanation in. */
    language: languageCodeSchema,
    /**
     * Optional, short note about the reader, e.g. "my mother, 68, in Hyderabad".
     * Only ever used to pitch the explanation; never stored, never required.
     */
    readerContext: z.string().trim().max(300).optional(),
  })
  .superRefine((value, ctx) => {
    // A photo on its own is a complete request. Text on its own must be long
    // enough to actually read. Anything less gets a sentence, not a code.
    if (value.image) return;

    const length = (value.text ?? "").trim().length;
    if (length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "Add the text of the document, or a photo of it.",
      });
      return;
    }
    if (length < MIN_TEXT_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message:
          "There isn't enough text here to read. Paste or add more of the document.",
      });
    }
  });

export type ExplainInput = z.infer<typeof explainInputSchema>;

/**
 * A fact the model asserts. It is only trustworthy if `quote` appears in the
 * source document, which `lib/grounding.ts` checks after validation.
 */
export const groundedItemSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(400),
  quote: z.string().trim().min(1).max(800),
});

export const actionSchema = z.object({
  instruction: z.string().trim().min(1).max(400),
  /** Free text, because documents say "within 15 days", not ISO dates. */
  deadline: z.string().trim().max(120).nullable().default(null),
  quote: z.string().trim().min(1).max(800),
});

export const cautionSchema = z.object({
  note: z.string().trim().min(1).max(400),
  quote: z.string().trim().min(1).max(800),
});

export const explanationSchema = z.object({
  /** e.g. "Electricity bill", "Residential lease agreement", "Insurance policy". */
  documentType: z.string().trim().min(1).max(160),
  /** Plain-language explanation of what this kind of document is for. */
  whatThisIs: z.string().trim().min(1).max(1200),
  /** The gist, in the reader's language, in a few sentences. */
  summary: z.string().trim().min(1).max(2000),
  /** Who issued or sent it, if the document says. */
  sender: z.string().trim().max(200).nullable().default(null),
  /** The facts that matter — numbers, dates, references, names. */
  keyFacts: z.array(groundedItemSchema).max(12).default([]),
  /** What the document asks of the reader, and by when. */
  actions: z.array(actionSchema).max(8).default([]),
  /** Things a reader could miss: auto-renewals, penalties, conditions. */
  watchOutFor: z.array(cautionSchema).max(6).default([]),
  /** Things worth asking the sender. Questions only — never advice. */
  questionsToAsk: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  /** Where the model is unsure. Surfaced to the reader, not hidden. */
  uncertainAbout: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  confidence: z.enum(["high", "medium", "low"]),
});

export type Explanation = z.infer<typeof explanationSchema>;
export type GroundedItem = z.infer<typeof groundedItemSchema>;
export type ActionItem = z.infer<typeof actionSchema>;
export type CautionItem = z.infer<typeof cautionSchema>;

/** An item plus the result of checking its quote against the source. */
export type Annotated<T> = T & {
  verified: boolean;
  /**
   * Where the quote sits in the document the reader supplied, when it could be
   * pinpointed. `null` means the quote passed the (deliberately forgiving)
   * verification but its exact position could not be established — the reader
   * is shown no location rather than a wrong one.
   */
  location: QuoteLocation | null;
};

/** A quote found inside the source text, with a little readable context. */
export interface QuoteLocation {
  /** 1-based line number where the quote begins, as the reader would count. */
  line: number;
  /** Up to a sentence or so of text before the quote. */
  before: string;
  /** The quote exactly as it appears in the source. */
  match: string;
  /** Up to a sentence or so of text after the quote. */
  after: string;
  /** True when `before` or `after` was cut short, so the UI can show an ellipsis. */
  trimmed: boolean;
}

/**
 * What the API returns to the browser.
 *
 * `ExplainResult` is deliberately not just `Explanation`: every quote-bearing
 * item carries a `verified` flag, set by comparing the quote against the
 * document text the user supplied. A quote that cannot be found in the source
 * is shown as unverified rather than silently trusted or silently dropped.
 */
export interface ExplainResult
  extends Omit<Explanation, "keyFacts" | "actions" | "watchOutFor"> {
  keyFacts: Annotated<GroundedItem>[];
  actions: Annotated<ActionItem>[];
  watchOutFor: Annotated<CautionItem>[];
  language: string;
  /** True when the document was longer than the configured input ceiling. */
  truncated: boolean;
  /** Which model produced this, for the "how it works" panel. */
  model: string;
  /** Wall-clock milliseconds for the whole server-side operation. */
  elapsedMs: number;
  /** How many quotes were checked against the source document. */
  quotesChecked: number;
  /**
   * How many of those could not be found in the source. Should be 0.
   *
   * Always 0 when `groundingSkipped` is true — because nothing was checked.
   */
  unverifiedQuotes: number;
  /**
   * True when the reading came from a photograph and no text was supplied, so
   * quotes could not be checked against anything. The interface must say so
   * rather than imply the usual verification happened.
   */
  groundingSkipped: boolean;
}