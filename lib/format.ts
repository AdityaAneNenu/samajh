import type { ExplainResult } from "@/services/ai/schemas";
import { languageLabel } from "@/lib/languages";

/**
 * A plain-text rendering of a result, for the copy button and for printing.
 *
 * Kept pure and separate from the React view so it can be tested directly and
 * so what the reader copies is exactly what they saw.
 */
export function toPlainText(result: ExplainResult): string {
  const lines: string[] = [];
  const heading = (text: string) => lines.push("", text.toUpperCase());

  lines.push(result.documentType);
  if (result.sender) lines.push(`From: ${result.sender}`);
  lines.push(`Explained in ${languageLabel(result.language)}`);

  heading("The gist");
  lines.push(result.summary);

  heading("What this is");
  lines.push(result.whatThisIs);

  if (result.keyFacts.length > 0) {
    heading("Numbers and dates that matter");
    for (const fact of result.keyFacts) {
      lines.push(`- ${fact.label}: ${fact.value}`);
      lines.push(`  "${fact.quote}"`);
    }
  }

  if (result.actions.length > 0) {
    heading("What it asks you to do");
    for (const action of result.actions) {
      const deadline = action.deadline ? ` (by ${action.deadline})` : "";
      lines.push(`- ${action.instruction}${deadline}`);
      lines.push(`  "${action.quote}"`);
    }
  }

  if (result.watchOutFor.length > 0) {
    heading("Worth reading twice");
    for (const item of result.watchOutFor) {
      lines.push(`- ${item.note}`);
      lines.push(`  "${item.quote}"`);
    }
  }

  if (result.questionsToAsk.length > 0) {
    heading("Questions you could ask");
    for (const question of result.questionsToAsk) lines.push(`- ${question}`);
  }

  if (result.uncertainAbout.length > 0) {
    heading("What we are not sure about");
    for (const note of result.uncertainAbout) lines.push(`- ${note}`);
  }

  heading("About this reading");
  lines.push(`Confidence: ${result.confidence}`);
  lines.push(
    `Quotes checked against the document: ${result.quotesChecked} (${
      result.unverifiedQuotes === 0
        ? "all found"
        : `${result.unverifiedQuotes} not found`
    })`,
  );
  if (result.truncated) {
    lines.push(
      "Note: the document was long, so only the beginning was read.",
    );
  }
  lines.push(
    "Samajh explains what a document says. It does not give legal, medical or financial advice.",
  );

  return lines.join("\n");
}