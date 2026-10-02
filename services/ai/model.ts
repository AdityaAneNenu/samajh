import { z } from "zod";
import { AiError } from "@/lib/errors";

/**
 * Where the model lives, and how we are allowed to talk to it.
 *
 * Read once from the server environment. The application never hard-codes a
 * provider: swapping hosts, or swapping the model itself, is an environment
 * change and nothing else. That is the practical half of the "why open
 * innovation matters" argument — see README.
 */

export type JsonMode = "auto" | "json_object" | "off";

export interface ModelConfig {
  provider: "openai-compatible" | "mock";
  baseUrl: string | null;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  maxRetries: number;
  maxInputChars: number;
  jsonMode: JsonMode;
}

const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    });

const envSchema = z.object({
  AI_PROVIDER: z.enum(["openai-compatible", "mock"]).default("openai-compatible"),
  AI_BASE_URL: z.string().trim().optional(),
  AI_MODEL: z.string().trim().optional(),
  AI_API_KEY: z.string().trim().optional(),
  AI_TIMEOUT_MS: numeric(45_000),
  AI_MAX_RETRIES: numeric(2),
  AI_MAX_INPUT_CHARS: numeric(24_000),
  AI_JSON_MODE: z.enum(["auto", "json_object", "off"]).default("auto"),
});

function readEnv() {
  return envSchema.parse({
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
    AI_MAX_RETRIES: process.env.AI_MAX_RETRIES,
    AI_MAX_INPUT_CHARS: process.env.AI_MAX_INPUT_CHARS,
    AI_JSON_MODE: process.env.AI_JSON_MODE,
  });
}

/**
 * Resolve configuration without throwing — used by the status endpoint so the
 * UI can explain what is missing before a reader types anything.
 */
export function inspectModelConfig():
  | { ok: true; config: ModelConfig }
  | { ok: false; missing: string[] } {
  const env = readEnv();

  if (env.AI_PROVIDER === "mock") {
    return {
      ok: true,
      config: {
        provider: "mock",
        baseUrl: null,
        model: "mock-deterministic",
        apiKey: null,
        timeoutMs: env.AI_TIMEOUT_MS,
        maxRetries: env.AI_MAX_RETRIES,
        maxInputChars: env.AI_MAX_INPUT_CHARS,
        jsonMode: env.AI_JSON_MODE,
      },
    };
  }

  const missing: string[] = [];
  if (!env.AI_BASE_URL) missing.push("AI_BASE_URL");
  if (!env.AI_MODEL) missing.push("AI_MODEL");
  if (!env.AI_API_KEY) missing.push("AI_API_KEY");
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      provider: "openai-compatible",
      // Strip a trailing slash so joining paths stays predictable.
      baseUrl: env.AI_BASE_URL!.replace(/\/+$/, ""),
      model: env.AI_MODEL!,
      apiKey: env.AI_API_KEY!,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxRetries: env.AI_MAX_RETRIES,
      maxInputChars: env.AI_MAX_INPUT_CHARS,
      jsonMode: env.AI_JSON_MODE,
    },
  };
}

/** Throwing variant, used inside the request path. */
export function getModelConfig(): ModelConfig {
  const inspected = inspectModelConfig();
  if (!inspected.ok) {
    // Never log the values — only the variable names that are absent.
    throw new AiError("config", "AI provider is not configured", {
      detail: `missing environment variables: ${inspected.missing.join(", ")}`,
    });
  }
  return inspected.config;
}