import { describe, expect, it } from "vitest";
import { extractPdfText, looksLikePdf, tidyPdfText } from "@/lib/pdf";
import { makePdf } from "./helpers/makePdf";

const encode = (text: string) => new TextEncoder().encode(text);

describe("looksLikePdf", () => {
  it("accepts the header of a real PDF", () => {
    expect(looksLikePdf(makePdf(["anything"]))).toBe(true);
  });

  it("accepts the bare magic bytes", () => {
    expect(looksLikePdf(encode("%PDF-"))).toBe(true);
  });

  it("rejects other formats and truncated headers", () => {
    expect(looksLikePdf(encode("GIF89a"))).toBe(false);
    expect(looksLikePdf(encode("%PD"))).toBe(false);
    expect(looksLikePdf(new Uint8Array([]))).toBe(false);
  });
});

describe("tidyPdfText", () => {
  it("normalises Windows line endings and tabs", () => {
    expect(tidyPdfText("a\r\n\tb\r\n")).toBe("a\nb");
  });

  it("collapses runs of blank lines but keeps paragraph breaks", () => {
    expect(tidyPdfText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("removes trailing spaces that a text layer leaves behind", () => {
    expect(tidyPdfText("a   \n   b")).toBe("a\nb");
  });
});

describe("extractPdfText", () => {
  it("reads the words out of a well-formed PDF", async () => {
    const result = await extractPdfText(
      makePdf([
        "NOTICE FROM STATE ELECTRICITY BOARD",
        "Amount payable Rs 4250 within 15 days",
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.pages).toBe(1);
    expect(result.document.text).toContain("NOTICE FROM STATE ELECTRICITY BOARD");
    expect(result.document.text).toContain("4250");
    expect(result.document.characters).toBe(result.document.text.length);
    expect(result.document.truncated).toBe(false);
  });

  it("refuses a file that is not a PDF at all", async () => {
    const result = await extractPdfText(encode("just some text, not a pdf"));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("not a PDF");
  });

  it("says so when a PDF has no text layer, instead of guessing", async () => {
    // A page with an empty content stream is what a scan looks like.
    const result = await extractPdfText(makePdf([]));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("no readable text");
    expect(result.ok === false && result.message).toContain("photo");
  });

  it("does not invent text from a damaged file", async () => {
    const result = await extractPdfText(
      encode("%PDF-1.4\nthis claims to be a pdf but is not one"),
    );
    expect(result.ok).toBe(false);
  });
});