import { AiError } from "@/lib/errors";
import { annotateGrounding } from "@/lib/grounding";
import { extractJson } from "@/lib/json";
import { getModelConfig, inspectModelConfig, type ModelConfig } from "./model";
import { MockProvider } from "./mock";
import { normalizeExplanation } from "./normalize";
import {
  buildDocumentBlock,
  buildRepairInstruction,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
} from "./prompts";
import {
  OpenAiCompatibleProvider,
  type ChatMessage,
  type ChatProvider,
} from "./provider";
import {
  explainInputSchema,
  explanationSchema,
  type ExplainInput,
  type ExplainResult,
  type Explanation,
} from "./schemas";

/**
 * The application's whole AI surface, in one place.
 *
 * Callers pass text and get a validated, grounded `ExplainResult`, or an
 * `AiError`. They never see a provider, a prompt, or raw model output. That
 * separation is what keeps model-specific code out of the UI and makes the
 * model replaceable.
 */

export function providerFromConfig(config: ModelConfig): ChatProvider {
  return config.provider === "mock"
    ? new MockProvider()
    : new OpenAiCompatibleProvider(config);
}

export function createProvider(): ChatProvider {
  return providerFromConfig(getModelConfig());
}

export interface AiStatus {
  ready: boolean;
  provider: string;
  model: string | null;
  /** Names of environment variables that still need filling in. */
  missing: string[];
  /** How much text the server will send to the model, so the UI can warn early. */
  maxInputChars: number | null;
  promptVersion: string;
}

/** Used by the UI to explain what is missing before anyone types anything. */
export function getAiStatus(): AiStatus {
  const inspected = inspectModelConfig();
  if (!inspected.ok) {
    return {
      ready: false,
      provider: "openai-compatible",
      model: null,
      missing: inspected.missing,
      maxInputChars: null,
      promptVersion: PROMPT_VERSION,
    };
  }
  return {
    ready: true,
    provider: inspected.config.provider,
    model: inspected.config.model,
    missing: [],
    maxInputChars: inspected.config.maxInputChars,
    promptVersion: PROMPT_VERSION,
  };
}

export interface FieldIssue {
  field: string;
  message: string;
}

export type InputParseResult =
  | { ok: true; input: ExplainInput }
  | { ok: false; issues: FieldIssue[] };

/** The single place where a request body becomes trusted input. */
export function parseExplainInput(raw: unknown): InputParseResult {
  const parsed = explainInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, input: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "input",
      message: issue.message,
    })),
  };
}

type ValidationOutcome =
  | { ok: true; value: Explanation }
  | { ok: false; issues: string[] };

/**
 * Turn raw model text into a validated `Explanation`.
 *
 * Recovery order matters: strip cosmetic noise (fences, prose, trailing
 * commas), then coerce near-miss shapes, then validate strictly. Anything that
 * still fails is a genuine failure and is reported as one rather than papered
 * over.
 */
function validateModelOutput(raw: string): ValidationOutcome {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (error) {
    return {
      ok: false,
      issues: [
        error instanceof AiError ? error.detail : "The reply was not valid JSON.",
      ],
    };
  }

  const parsed = explanationSchema.safeParse(normalizeExplanation(json));
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}

export interface ExplainDependencies {
  provider?: ChatProvider;
  config?: ModelConfig;
}

/**
 * Read a document and explain it.
 *
 * Throws nothing but `AiError`, so the route handler can map every failure to
 * a calm, useful message containing no internal detail.
 */
export async function explainDocument(
  input: ExplainInput,
  dependencies: ExplainDependencies = {},
): Promise<ExplainResult> {
  const startedAt = Date.now();
  const config = dependencies.config ?? getModelConfig();
  const provider = dependencies.provider ?? providerFromConfig(config);

  // Bound the request before it leaves the server: less latency, less cost,
  // and less of someone's private document travelling than necessary.
  const truncated = input.text.length > config.maxInputChars;
  const documentText = truncated
    ? input.text.slice(0, config.maxInputChars)
    : input.text;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildDocumentBlock(input, documentText, truncated) },
  ];

  const firstAttempt = await provider.complete(messages, { jsonMode: true });
  let model = firstAttempt.model;
  let outcome = validateModelOutput(firstAttempt.text);

  if (!outcome.ok) {
    // One repair attempt, quoting the specific failures back at the model.
    // Logged without any document content.
    console.warn(
      "[samajh] model output failed validation; attempting one repair:",
      outcome.issues.slice(0, 6),
    );

    const repair = await provider.complete(
      [
        ...messages,
        { role: "assistant", content: firstAttempt.text.slice(0, 6000) },
        { role: "user", content: buildRepairInstruction(outcome.issues) },
      ],
      { jsonMode: true },
    );
    model = repair.model;
    outcome = validateModelOutput(repair.text);

    if (!outcome.ok) {
      throw new AiError(
        "invalid_response",
        "Model output failed validation twice",
        { detail: outcome.issues.join(" | ").slice(0, 400) },
      );
    }
  }

  const explanation = outcome.value;
  const grounding = annotateGrounding(explanation, documentText);

  if (grounding.unverified > 0) {
    // Logs item labels only — never the document, never the quotes.
    console.warn(
      `[samajh] ${grounding.unverified}/${grounding.checked} quotes were not found in the source document`,
      grounding.failures.slice(0, 8),
    );
  }

  return {
    ...explanation,
    keyFacts: grounding.keyFacts,
    actions: grounding.actions,
    watchOutFor: grounding.watchOutFor,
    language: input.language,
    truncated,
    model,
    elapsedMs: Date.now() - startedAt,
    quotesChecked: grounding.checked,
    unverifiedQuotes: grounding.unverified,
  };
}