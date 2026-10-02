/**
 * Build a real, minimal, single-page PDF with a correct cross-reference table.
 *
 * Written by hand rather than pulling in a PDF-writing library: the point of
 * these tests is to prove the extractor works on a *well-formed* file, so the
 * fixture must be genuine and the assertion must be honest.
 *
 * ASCII only, which is why JavaScript string length equals byte length and the
 * offsets recorded below are correct.
 */

function escapePdfString(text: string): string {
  return text.replace(/([\\()])/g, "\\$1");
}

export function makePdf(lines: string[]): Uint8Array {
  const runs = lines.map((line) => `(${escapePdfString(line)}) Tj T*`).join(" ");
  const content = `BT /F1 12 Tf 20 260 Td 16 TL ${runs} ET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 320] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  // Each xref entry is exactly 20 bytes, as the format requires.
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}