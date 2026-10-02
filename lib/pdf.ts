import { extractText } from "unpdf";
import { MAX_TEXT_CHARS, MIN_TEXT_LENGTH } from "@/lib/constants";

/**
 * PDF text extraction — **server only**.
 *
 * Imported by the route handler and by tests. It must never be imported by a
 * component: it drags a full PDF engine into the bundle.
 *
 * Why the server rather than the browser: a purpose-built, well-tested parser is
 * the difference between "reads most PDFs" and "reads the PDFs I happened to
 * try". The cost of that choice is stated plainly in the README — the PDF bytes
 * reach this server before the text goes on to the model. Pasting the text, or
 * photographing the page, keeps the bytes on the device.
 *
 * Scanned PDFs have no text layer, and this deliberately does not guess: it says
 * so and points at the photograph path, which exists.
 */

export interface ExtractedDocument {
  text: string;
  pages: number;
  characters: number;
  /** True when the document was longer than the app will hold. */
  truncated: boolean;
}

export type ExtractPdfResult =
  | { ok: true; document: ExtractedDocument }
  | { ok: false; message: string };

/** Every PDF begins with the same five bytes: `%PDF-`. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/**
 * Tidy the ragged whitespace a PDF text layer produces.
 *
 * Paragraph breaks survive; runs of spaces and triple newlines do not. This
 * matters beyond cosmetics: the text shown to the reader is the same text the
 * quotes are verified against, so both must be stable.
 */
export function tidyPdfText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<ExtractPdfResult> {
  if (!looksLikePdf(bytes)) {
    return { ok: false, message: "That file is not a PDF we can read." };
  }

  let raw: string;
  let pages: number;

  try {
    const result = await extractText(bytes, { mergePages: true });
    raw = result.text;
    pages = result.totalPages;
  } catch {
    return {
      ok: false,
      message:
        "We could not read that PDF. Try another file, or paste the text instead.",
    };
  }

  const text = tidyPdfText(raw);

  if (text.length < MIN_TEXT_LENGTH) {
    return {
      ok: false,
      message:
        "There is no readable text in that PDF — it is probably a scan or photographs of pages. Take a photo of the pages instead, or type out the important part.",
    };
  }

  const truncated = text.length > MAX_TEXT_CHARS;
  const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

  return {
    ok: true,
    document: {
      text: finalText,
      pages,
      characters: finalText.length,
      truncated,
    },
  };
}