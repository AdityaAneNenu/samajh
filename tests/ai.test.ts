import { describe, expect, it, afterEach } from "vitest";
import { AiError } from "@/lib/errors";
import { explainDocument, parseExplainInput } from "@/services/ai";
import type { ModelConfig } from "@/services/ai/model";
import type {
  ChatContentPart,
  ChatMessage,
  ChatProvider,
  CompletionResult,
} from "@/services/ai/provider";

const CONFIG: ModelConfig = {
  provider: "mock",
  baseUrl: null,
  model: "fake-model",
  apiKey: null,
  timeoutMs: 1_000,
  maxRetries: 0,
  maxInputChars: 24_000,
  jsonMode: "off",
  supportsImages: false,
};

const ENV_KEYS = ["AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "AI_API_KEY"] as const;
const savedEnv: Record<string, string | undefined> = {};

// Tests that clear the provider configuration put it back afterwards.
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/** Flatten a message's content to text, so assertions read the same either way. */
const textOf = (content: string | ChatContentPart[] | undefined): string => {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
};

/** A stand-in photograph. Only its presence matters to these tests. */
const PHOTO = {
  mediaType: "image/jpeg" as const,
  dataBase64: "A".repeat(200),
};

/** A provider that replies exactly what the test tells it to. */
class ScriptedProvider implements ChatProvider {
  readonly id = "scripted";
  readonly model = "fake-model";
  readonly calls: ChatMessage[][] = [];

  constructor(private readonly replies: string[]) {}

  async complete(messages: ChatMessage[]): Promise<CompletionResult> {
    this.calls.push(messages);
    const index = Math.min(this.calls.length - 1, this.replies.length - 1);
    return { text: this.replies[index] ?? "", model: this.model };
  }
}

const DOCUMENT = `NOTICE FROM STATE ELECTRICITY BOARD
Your electricity connection number is 1234567.
Amount payable: Rs. 4,250 within 15 days from the date of this letter.
A late payment surcharge of 2% applies after the due date.`;

const GOOD_REPLY = JSON.stringify({
  documentType: "Electricity bill",
  whatThisIs: "A bill from the electricity board.",
  summary: "You owe Rs. 4,250 and there is a deadline.",
  sender: "State Electricity Board",
  keyFacts: [
    {
      label: "Connection number",
      value: "1234567",
      quote: "Your electricity connection number is 1234567.",
    },
    {
      label: "Amount payable",
      value: "Rs. 4,250",
      quote: "Amount payable: Rs. 4,250 within 15 days",
    },
  ],
  actions: [
    {
      instruction: "Pay the amount within the stated period.",
      deadline: "15 days",
      quote: "within 15 days from the date of this letter.",
    },
  ],
  watchOutFor: [
    {
      note: "A surcharge applies after the due date.",
      quote: "A late payment surcharge of 2% applies after the due date.",
    },
  ],
  questionsToAsk: ["What happens if I pay late?"],
  uncertainAbout: [],
  confidence: "high",
});

const input = (overrides: Record<string, unknown> = {}) => ({
  text: DOCUMENT,
  language: "en" as const,
  ...overrides,
});

describe("parseExplainInput", () => {
  it("accepts a good body and returns typed input", () => {
    const parsed = parseExplainInput(input());
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.input.language).toBe("en");
  });

  it("names the offending field when the body is wrong", () => {
    const parsed = parseExplainInput({ text: "tiny", language: "en" });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.issues[0]?.field).toBe("text");
  });
});

describe("explainDocument", () => {
  it("returns a validated result with every quote checked", async () => {
    const provider = new ScriptedProvider([GOOD_REPLY]);
    const result = await explainDocument(input(), { provider, config: CONFIG });

    expect(result.documentType).toBe("Electricity bill");
    expect(result.sender).toBe("State Electricity Board");
    expect(result.language).toBe("en");
    expect(result.model).toBe("fake-model");
    expect(result.quotesChecked).toBe(4);
    expect(result.unverifiedQuotes).toBe(0);
    expect(result.keyFacts.every((fact) => fact.verified)).toBe(true);
    expect(result.truncated).toBe(false);
    expect(provider.calls).toHaveLength(1);
  });

  it("sends the document and the requested language to the model", async () => {
    const provider = new ScriptedProvider([GOOD_REPLY]);
    await explainDocument(input({ language: "te" }), { provider, config: CONFIG });

    const sent = provider.calls[0] ?? [];
    const system = textOf(sent.find((message) => message.role === "system")?.content);
    const user = textOf(sent.find((message) => message.role === "user")?.content);

    expect(system).toContain("Explain, never advise");
    expect(system).toContain("copied EXACTLY");
    expect(user).toContain("1234567");
    expect(user).toContain("Telugu (te)");
  });

  it("accepts a reply wrapped in a markdown fence without spending a repair", async () => {
    const provider = new ScriptedProvider([`\`\`\`json\n${GOOD_REPLY}\n\`\`\``]);
    const result = await explainDocument(input(), { provider, config: CONFIG });

    expect(result.documentType).toBe("Electricity bill");
    expect(provider.calls).toHaveLength(1);
  });

  it("repairs once, handing the model its own specific failures", async () => {
    const provider = new ScriptedProvider([
      '{"summary":"I forgot every other field"}',
      GOOD_REPLY,
    ]);
    const result = await explainDocument(input(), { provider, config: CONFIG });

    expect(result.documentType).toBe("Electricity bill");
    expect(provider.calls).toHaveLength(2);

    const repairConversation = provider.calls[1] ?? [];
    const instruction = repairConversation[repairConversation.length - 1]?.content ?? "";
    expect(instruction).toContain("failed validation");
    expect(instruction).toContain("documentType");
  });

  it("gives up honestly when two replies are unreadable", async () => {
    const provider = new ScriptedProvider(["not json at all", "still not json"]);
    await expect(
      explainDocument(input(), { provider, config: CONFIG }),
    ).rejects.toMatchObject({ kind: "invalid_response" });
    expect(provider.calls).toHaveLength(2);
  });

  it("flags an invented quote instead of trusting it", async () => {
    const invented = JSON.stringify({
      ...(JSON.parse(GOOD_REPLY) as Record<string, unknown>),
      keyFacts: [
        {
          label: "Amount payable",
          value: "Rs. 9,999",
          quote: "Amount payable: Rs. 9,999 due immediately",
        },
      ],
      actions: [],
      watchOutFor: [],
    });

    const provider = new ScriptedProvider([invented]);
    const result = await explainDocument(input(), { provider, config: CONFIG });

    expect(result.quotesChecked).toBe(1);
    expect(result.unverifiedQuotes).toBe(1);
    expect(result.keyFacts[0]?.verified).toBe(false);
    // the item is kept, so the reader sees the warning next to it
    expect(result.keyFacts).toHaveLength(1);
  });

  it("bounds how much of a long document reaches the model", async () => {
    const longDocument = `${DOCUMENT}\n${"filler line\n".repeat(2000)}`;
    const provider = new ScriptedProvider([GOOD_REPLY]);

    const result = await explainDocument(
      { text: longDocument, language: "en" },
      { provider, config: { ...CONFIG, maxInputChars: 200 } },
    );

    expect(result.truncated).toBe(true);

    const user = provider.calls[0]?.find((m) => m.role === "user")?.content ?? "";
    expect(user).toContain(DOCUMENT.slice(0, 60));
    expect(user).not.toContain("filler line");
    expect(user.length).toBeLessThan(longDocument.length);
  });

  it("keeps the reader's own note out of the request when it is not given", async () => {
    const provider = new ScriptedProvider([GOOD_REPLY]);
    await explainDocument(input(), { provider, config: CONFIG });

    const user = textOf(
      provider.calls[0]?.find((m) => m.role === "user")?.content,
    );
    expect(user).toContain("not provided");
  });

  it("refuses a photograph when the deployment reads text only", async () => {
    const provider = new ScriptedProvider([GOOD_REPLY]);

    await expect(
      explainDocument(
        { language: "en", image: PHOTO },
        { provider, config: CONFIG },
      ),
    ).rejects.toMatchObject({ kind: "unsupported_input" });

    // and it must not spend a call discovering that the model cannot see
    expect(provider.calls).toHaveLength(0);
  });

  it("reads a photograph without pretending the quotes were checked", async () => {
    const provider = new ScriptedProvider([GOOD_REPLY]);

    const result = await explainDocument(
      { language: "en", image: PHOTO },
      { provider, config: { ...CONFIG, supportsImages: true } },
    );

    expect(result.groundingSkipped).toBe(true);
    expect(result.quotesChecked).toBe(0);
    expect(result.unverifiedQuotes).toBe(0);

    // the photograph travels as a content part, not as a string
    const user = provider.calls[0]?.find((m) => m.role === "user");
    expect(Array.isArray(user?.content)).toBe(true);
    const imagePart = (user?.content as ChatContentPart[]).find(
      (part) => part.type === "image_url",
    );
    expect(imagePart?.type).toBe("image_url");
  });

  it("still checks every quote when a transcription accompanies the photograph", async () => {
    const provider = new ScriptedProvider([GOOD_REPLY]);

    const result = await explainDocument(
      { text: DOCUMENT, language: "en", image: PHOTO },
      { provider, config: { ...CONFIG, supportsImages: true } },
    );

    expect(result.groundingSkipped).toBe(false);
    expect(result.quotesChecked).toBe(4);
    expect(result.unverifiedQuotes).toBe(0);
  });

  it("reports a configuration error when no provider is set up", async () => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    await expect(explainDocument(input())).rejects.toMatchObject({
      kind: "config",
    });

    const error = await explainDocument(input()).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).userFacing.status).toBe(503);
    // the detail names the missing variables but carries no values
    expect((error as AiError).detail).toContain("AI_API_KEY");
  });
});