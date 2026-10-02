import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/errors";
import { OpenAiCompatibleProvider } from "@/services/ai/provider";
import type { ModelConfig } from "@/services/ai/model";

const CONFIG: ModelConfig = {
  provider: "openai-compatible",
  baseUrl: "https://provider.test/v1",
  model: "test-model",
  apiKey: "gsk_test_abcdefghijklmnop",
  timeoutMs: 2_000,
  maxRetries: 1,
  maxInputChars: 1_000,
  jsonMode: "auto",
};

const CONVERSATION = [{ role: "system" as const, content: "read this" }];

interface Recorded {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Swaps in a scripted fetch for the duration of one test. */
function withFetch(
  handler: (url: string, init: RequestInit) => Promise<Response>,
): { calls: Recorded[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: Recorded[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (init?.headers as Record<string, string>) ?? {},
    )) {
      headers[key.toLowerCase()] = String(value);
    }
    calls.push({ url, body, headers });
    return handler(url, init ?? {});
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const completion = (content: string) => ({
  model: "test-model",
  choices: [{ message: { content } }],
});

describe("OpenAiCompatibleProvider", () => {
  it("posts to /chat/completions and returns the text", async () => {
    const { calls, restore } = withFetch(async () =>
      jsonResponse(completion('{"ok":true}')),
    );
    try {
      const provider = new OpenAiCompatibleProvider(CONFIG);
      const result = await provider.complete(CONVERSATION, { jsonMode: true });

      expect(result.text).toBe('{"ok":true}');
      expect(calls[0]?.url).toBe("https://provider.test/v1/chat/completions");
      expect(calls[0]?.body.model).toBe("test-model");
      expect(calls[0]?.body.response_format).toEqual({ type: "json_object" });
      expect(calls[0]?.headers.authorization).toBe(
        "Bearer gsk_test_abcdefghijklmnop",
      );
    } finally {
      restore();
    }
  });

  it("omits response_format when json mode is off", async () => {
    const { calls, restore } = withFetch(async () =>
      jsonResponse(completion("hello")),
    );
    try {
      await new OpenAiCompatibleProvider({
        ...CONFIG,
        jsonMode: "off",
      }).complete(CONVERSATION);
      expect(calls[0]?.body.response_format).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("disables json mode for good when the server rejects the field", async () => {
    let rejected = false;
    const { calls, restore } = withFetch(async (_url, init) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (body.response_format && !rejected) {
        rejected = true;
        return new Response('{"error":"unknown field response_format"}', {
          status: 400,
        });
      }
      return jsonResponse(completion('{"ok":true}'));
    });

    try {
      const provider = new OpenAiCompatibleProvider(CONFIG);
      const result = await provider.complete(CONVERSATION, { jsonMode: true });

      expect(result.text).toBe('{"ok":true}');
      expect(calls).toHaveLength(2);
      expect(calls[1]?.body.response_format).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("maps a 401 to a configuration error and keeps the key out of the detail", async () => {
    const secret = CONFIG.apiKey as string;
    const { restore } = withFetch(async () =>
      jsonResponse({ error: `invalid key ${secret}` }, 401),
    );
    try {
      await new OpenAiCompatibleProvider(CONFIG).complete(CONVERSATION);
      throw new Error("expected the call to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AiError);
      const aiError = error as AiError;
      expect(aiError.kind).toBe("config");
      expect(aiError.detail).not.toContain(secret);
    } finally {
      restore();
    }
  });

  it("retries a 429 up to the configured limit, then fails", async () => {
    const { calls, restore } = withFetch(async () =>
      jsonResponse({ error: "rate limited" }, 429),
    );
    try {
      await new OpenAiCompatibleProvider({
        ...CONFIG,
        maxRetries: 2,
      }).complete(CONVERSATION);
      throw new Error("expected the call to fail");
    } catch (error) {
      expect((error as AiError).kind).toBe("rate_limit");
      // one initial attempt plus two retries
      expect(calls).toHaveLength(3);
    } finally {
      restore();
    }
  });

  it("recovers when a retry succeeds", async () => {
    let attempt = 0;
    const { calls, restore } = withFetch(async () => {
      attempt += 1;
      return attempt === 1
        ? jsonResponse({ error: "busy" }, 503)
        : jsonResponse(completion('{"ok":true}'));
    });
    try {
      const result = await new OpenAiCompatibleProvider(CONFIG).complete(
        CONVERSATION,
      );
      expect(result.text).toBe('{"ok":true}');
      expect(calls).toHaveLength(2);
    } finally {
      restore();
    }
  });

  it("does not retry a failure that cannot succeed", async () => {
    const { calls, restore } = withFetch(async () =>
      jsonResponse({ error: "nope" }, 422),
    );
    try {
      await new OpenAiCompatibleProvider(CONFIG).complete(CONVERSATION);
      throw new Error("expected the call to fail");
    } catch (error) {
      expect((error as AiError).kind).toBe("unknown");
      expect(calls).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("reports a missing credential as a configuration error, without calling out", () => {
    expect(
      () => new OpenAiCompatibleProvider({ ...CONFIG, apiKey: null }),
    ).toThrow(AiError);
  });

  it("rejects an empty completion rather than passing it on", async () => {
    const { restore } = withFetch(async () =>
      jsonResponse({
        model: "test-model",
        choices: [{ message: { content: "" } }],
      }),
    );
    try {
      await new OpenAiCompatibleProvider(CONFIG).complete(CONVERSATION);
      throw new Error("expected the call to fail");
    } catch (error) {
      expect((error as AiError).kind).toBe("invalid_response");
    } finally {
      restore();
    }
  });

  it("joins content sent as an array of parts", async () => {
    const { restore } = withFetch(async () =>
      jsonResponse({
        model: "test-model",
        choices: [
          {
            message: {
              content: [
                { type: "text", text: '{"a":' },
                { type: "text", text: "1}" },
              ],
            },
          },
        ],
      }),
    );
    try {
      const result = await new OpenAiCompatibleProvider(CONFIG).complete(
        CONVERSATION,
      );
      expect(result.text).toBe('{"a":1}');
    } finally {
      restore();
    }
  });
});