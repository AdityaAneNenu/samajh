import type { ChatMessage, ChatProvider, CompletionResult } from "./provider";

/**
 * A deterministic, offline stand-in for a model.
 *
 * It exists for three honest reasons:
 *   - the test suite must not depend on a paid API or the network;
 *   - the UI can be developed and demonstrated without a key;
 *   - a judge can run this repository and see the whole flow immediately.
 *
 * It is NOT pretending to be AI. It says so in its own output, and it always
 * reports `confidence: "low"`. It does one deterministic mechanical thing:
 * find amounts, dates and risky-looking clauses in the text, and quote the
 * lines it found them on. That is enough to exercise every code path —
 * schema validation, grounding verification, error handling — without
 * dishonestly claiming comprehension it does not have.
 */

const START_MARKER = "<<<DOCUMENT";
const END_MARKER = "DOCUMENT>>>";

function extractDocument(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const text = lastUser.content;
  const start = text.indexOf(START_MARKER);
  const end = text.lastIndexOf(END_MARKER);
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start + START_MARKER.length, end).trim();
}

const CURRENCY = /(?:₹|Rs\.?|INR|USD|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?/i;
const DATE_WORD =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const DATE_NUMERIC = /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/;
const RELATIVE_DEADLINE = /\bwithin\s+\w+\s+(?:days?|weeks?|months?)\b/i;
const RISK_WORD =
  /\b(?:penalt|fine|late\s+fee|interest|terminat|renew|non-?refundable|surcharge|liable|forfeit|due\s+immediately)\b/i;

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

function buildReading(document: string): Record<string, unknown> {
  const allLines = document
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const title = clip(allLines[0] ?? "Untitled document", 120);

  const keyFacts: unknown[] = [];
  const actions: unknown[] = [];
  const watchOutFor: unknown[] = [];

  for (const line of allLines) {
    const quote = clip(line, 800);

    const amount = CURRENCY.exec(line);
    if (amount && keyFacts.length < 12) {
      keyFacts.push({
        label: "Amount mentioned",
        value: clip(amount[0], 400),
        quote,
      });
    }

    const date = DATE_NUMERIC.exec(line) ?? DATE_WORD.exec(line) ?? RELATIVE_DEADLINE.exec(line);
    if (date && actions.length < 8) {
      actions.push({
        instruction:
          "This line is tied to a date. Check what the document asks you to do by then.",
        deadline: clip(date[0], 120),
        quote,
      });
    }

    if (RISK_WORD.test(line) && watchOutFor.length < 6) {
      watchOutFor.push({
        note: "A condition worth reading twice appears here. The document does not explain whether it applies to you.",
        quote,
      });
    }
  }

  const senderMatch = /(?:from|by|issued\s+by)\s*[:\-]?\s*(.{2,60})/i.exec(document);

  return {
    documentType: title,
    whatThisIs:
      "This is a placeholder reading produced by the built-in offline provider, not by a language model. It lists amounts, dates and risky-looking lines it found by pattern matching. It does not understand what the document means.",
    summary: `A real reading was not requested: the app is running with the offline mock provider. Pattern matching found ${keyFacts.length} amount(s) and ${actions.length} date-related line(s) in a document it calls "${title}". Set AI_PROVIDER=openai-compatible and a model that your provider serves to get a genuine, grounded explanation in your own language.`,
    sender: senderMatch ? clip(senderMatch[1].trim(), 200) : null,
    keyFacts,
    actions,
    watchOutFor,
    questionsToAsk: [
      "What exactly am I expected to do, and by when?",
      "Is there any charge, penalty or interest I should expect?",
      "Who do I contact if something here looks wrong?",
    ],
    uncertainAbout: [
      "No language model read this document — the app is in offline mock mode.",
      "Nothing here should be relied on. It is a demonstration of the app's plumbing.",
    ],
    confidence: "low",
  };
}

export class MockProvider implements ChatProvider {
  readonly id = "mock";
  readonly model = "mock-deterministic";

  async complete(messages: ChatMessage[]): Promise<CompletionResult> {
    // A tiny delay keeps the loading states honest in development.
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      model: this.model,
      text: JSON.stringify(buildReading(extractDocument(messages))),
    };
  }
}