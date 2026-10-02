/**
 * Cheap file-kind checks.
 *
 * Dependency-free on purpose: the browser imports this, and the browser must
 * not pull in the PDF parser, which belongs on the server only.
 */

/** Accepts a PDF by MIME type or by extension, because browsers disagree. */
export function isPdfFile(file: { name: string; type: string }): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Accepts anything a browser would call text, plus the extensions we document. */
export function isPlainTextFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(txt|md|csv|log|json)$/i.test(file.name);
}