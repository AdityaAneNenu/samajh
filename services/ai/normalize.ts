/**
 * Coax a model's reply into the shape our schema expects — before validation,
 * not instead of it.
 *
 * Two real-world failure modes motivate this file:
 *   1. Models drift to snake_case (`document_type`) after seeing camelCase in
 *      a skeleton, or invent a near-synonym (`facts` for `keyFacts`).
 *   2. Models pad arrays with half-filled items.
 *
 * Dropping a malformed item is much better than rejecting the entire document:
 * the reader still gets the nine facts the model got right. The schema remains
 * the gate — this only removes noise the gate would otherwise trip over.
 */

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const pick = (
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
};

function cap<T>(items: T[], max: number): T[] {
  return items.slice(0, max);
}

function normalizeGroundedItem(value: unknown): unknown | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;

  const label =
    asString(pick(item, ["label", "name", "field", "key", "title"])) ?? null;
  const val =
    asString(pick(item, ["value", "text", "detail", "content"])) ?? null;
  const quote =
    asString(pick(item, ["quote", "quotation", "sourceQuote", "source_quote", "evidence"])) ??
    null;

  if (!label || !val || !quote) return null;
  return { label, value: val, quote };
}

function normalizeAction(value: unknown): unknown | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;

  const instruction =
    asString(pick(item, ["instruction", "action", "whatToDo", "what_to_do", "task"]));
  const quote = asString(pick(item, ["quote", "quotation", "evidence"]));
  const deadline = asString(pick(item, ["deadline", "dueDate", "due_date", "due"]));

  if (!instruction || !quote) return null;
  return { instruction, deadline: deadline ?? null, quote };
}

/**
 * Cautions use their own shape (`note`, not `label`/`value`), so they must not
 * be run through the generic grounded-item normaliser — doing so silently
 * drops every one of them.
 */
function normalizeCaution(value: unknown): unknown | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;

  const note =
    asString(pick(item, ["note", "caution", "warning", "label", "title", "text"])) ??
    null;
  const quote =
    asString(
      pick(item, ["quote", "quotation", "sourceQuote", "source_quote", "evidence"]),
    ) ?? null;

  if (!note || !quote) return null;
  return { note, quote };
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  const text = asString(value)?.toLowerCase() ?? "";
  if (text.startsWith("high")) return "high";
  if (text.startsWith("med") || text.startsWith("mod")) return "medium";
  // Anything unrecognised is treated as low. Under-promising is the honest
  // failure mode for a tool people will act on.
  return "low";
}

export function normalizeExplanation(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const source = raw as Record<string, unknown>;

  const documentType =
    asString(pick(source, ["documentType", "document_type", "docType", "type"])) ?? null;
  const whatThisIs =
    asString(pick(source, ["whatThisIs", "what_this_is", "explanation", "whatItIs"])) ??
    null;
  const summary = asString(pick(source, ["summary", "overview", "gist", "shortSummary"])) ?? null;
  const sender = asString(pick(source, ["sender", "issuer", "from", "source"])) ?? null;

  const keyFacts = cap(
    asArray(pick(source, ["keyFacts", "key_facts", "facts", "importantFacts"]))
      .map(normalizeGroundedItem)
      .filter((item): item is unknown => item !== null),
    12,
  );

  const actions = cap(
    asArray(pick(source, ["actions", "actionItems", "action_items", "todos", "whatToDo"]))
      .map(normalizeAction)
      .filter((item): item is unknown => item !== null),
    8,
  );

  const watchOutFor = cap(
    asArray(pick(source, ["watchOutFor", "watch_out_for", "cautions", "thingsToWatch"]))
      .map(normalizeCaution)
      .filter((item): item is unknown => item !== null),
    6,
  );

  const stringList = (keys: readonly string[], max: number): string[] =>
    cap(
      asArray(pick(source, keys))
        .map(asString)
        .filter((item): item is string => item !== null),
      max,
    );

  return {
    documentType,
    whatThisIs,
    summary,
    sender,
    keyFacts,
    actions,
    watchOutFor,
    questionsToAsk: stringList(
      ["questionsToAsk", "questions_to_ask", "questions", "askTheSender"],
      6,
    ),
    uncertainAbout: stringList(
      ["uncertainAbout", "uncertain_about", "uncertainties", "unknowns"],
      6,
    ),
    confidence: normalizeConfidence(pick(source, ["confidence", "certainty", "sureness"])),
  };
}