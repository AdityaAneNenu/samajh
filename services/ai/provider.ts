import { AiError, redactSecret } from "@/lib/errors";
import type { ModelConfig } from "./model";

/**
 * The only place in the application that speaks to a model over the network.
 *
 * Everything above this file deals in `ChatMessage[]` in, text out. That is
 * what makes the model swappable: this adapter targets the OpenAI-compatible
 * `POST /chat/completions` shape, which Groq, Together, Fireworks, OpenRouter,
 * DeepInfra, Hugging Face Inference Providers, vLLM, llama.cpp's server and
 * LM Studio all speak. Changing model or host — including pointing at a server
 * you run yourself — is an environment change, not a code change.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  text: string;
  model: string;
}

export interface ChatProvider {
  readonly id: string;
  readonly model: string;
  complete(
    messages: ChatMessage[],
    options?: { jsonMode?: boolean },
  ): Promise<CompletionResult>;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
    };
  }>;
  error?: { message?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 400ms, 800ms, 1600ms — plus jitter so parallel callers don't sync up. */
function backoffMs(attempt: number): number {
  return 400 * 2 ** attempt + Math.floor(Math.random() * 150);
}

function readContent(data: ChatCompletionResponse): string | null {
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw.length > 0 ? raw : null;
  if (Array.isArray(raw)) {
    const joined = raw
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    return joined.length > 0 ? joined : null;
  }
  return null;
}

export class OpenAiCompatibleProvider implements ChatProvider {
  readonly id = "openai-compatible";
  readonly model: string;

  private readonly config: ModelConfig;
  /**
   * Some OpenAI-compatible servers reject `response_format`. When one does, we
   * stop sending it for the life of the process instead of failing every call.
   */
  private jsonModeAllowed: boolean;

  constructor(config: ModelConfig) {
    if (!config.baseUrl || !config.apiKey) {
      throw new AiError("config", "AI provider is not configured", {
        detail: "baseUrl or apiKey missing",
      });
    }
    this.config = config;
    this.model = config.model;
    this.jsonModeAllowed = config.jsonMode !== "off";
  }

  async complete(
    messages: ChatMessage[],
    options?: { jsonMode?: boolean },
  ): Promise<CompletionResult> {
    const attempts = Math.max(1, this.config.maxRetries + 1);
    let lastError: AiError | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.request(messages, options?.jsonMode === true);
      } catch (error) {
        const aiError = AiError.fromUnknown(error);
        lastError = aiError;
        const isLast = attempt === attempts - 1;
        if (!aiError.isRetryable || isLast) throw aiError;
        await sleep(backoffMs(attempt));
      }
    }

    throw lastError ?? new AiError("unknown", "AI request failed");
  }

  private async request(
    messages: ChatMessage[],
    jsonMode: boolean,
  ): Promise<CompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: 0.1,
      stream: false,
    };

    if (jsonMode && this.jsonModeAllowed) {
      body.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        // Read the body for diagnosis, but never echo it to the browser, and
        // scrub anything resembling our credential before it can reach a log.
        const raw = (await response.text().catch(() => "")).slice(0, 400);
        const detail = redactSecret(raw, this.config.apiKey);

        if (
          response.status === 400 &&
          jsonMode &&
          this.jsonModeAllowed &&
          /response_format/i.test(detail)
        ) {
          this.jsonModeAllowed = false;
          return this.request(messages, false);
        }

        throw AiError.fromHttpStatus(response.status, detail);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const text = readContent(data);
      if (text === null) {
        throw new AiError("invalid_response", "Provider returned no content", {
          detail: `unexpected payload shape: ${JSON.stringify(data).slice(0, 200)}`,
        });
      }

      return { text, model: data.model ?? this.config.model };
    } catch (error) {
      throw AiError.fromUnknown(error);
    } finally {
      clearTimeout(timer);
    }
  }
}