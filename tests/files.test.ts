import { describe, expect, it } from "vitest";
import { isPdfFile, isPlainTextFile } from "@/lib/files";

describe("isPdfFile", () => {
  it("accepts a PDF by MIME type or by extension", () => {
    expect(isPdfFile({ name: "letter.pdf", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "letter.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "scan", type: "application/pdf" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPdfFile({ name: "photo.jpg", type: "image/jpeg" })).toBe(false);
    expect(isPdfFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
    // a name that merely contains "pdf" is not a PDF
    expect(isPdfFile({ name: "pdf-notes", type: "" })).toBe(false);
  });
});

describe("isPlainTextFile", () => {
  it("accepts text MIME types and the documented extensions", () => {
    for (const name of ["a.txt", "a.md", "a.csv", "a.log", "a.json"]) {
      expect(isPlainTextFile({ name, type: "" })).toBe(true);
    }
    expect(isPlainTextFile({ name: "whatever", type: "text/plain" })).toBe(true);
  });

  it("rejects binaries", () => {
    expect(isPlainTextFile({ name: "a.pdf", type: "application/pdf" })).toBe(false);
    expect(isPlainTextFile({ name: "a.jpg", type: "image/jpeg" })).toBe(false);
    expect(isPlainTextFile({ name: "a.docx", type: "" })).toBe(false);
  });
});