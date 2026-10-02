import { describe, expect, it } from "vitest";
import { normalizeExplanation } from "@/services/ai/normalize";
import { explainInputSchema, explanationSchema } from "@/services/ai/schemas";

const VALID_REPLY = {
  documentType: "Electricity bill",
  whatThisIs: "A bill for electricity you have used.",
  summary: "You owe money and there is a deadline.",
  sender: "State Electricity Board",
  keyFacts: [
    { label: "Amount payable", value: "Rs. 4,250", quote: "Amount payable: Rs. 4,250" },
  ],
  actions: [
    { instruction: "Pay it.", deadline: "15 days", quote: "within 15 days" },
  ],
  watchOutFor: [],
  questionsToAsk: ["Is there any surcharge?"],
  uncertainAbout: [],
  confidence: "medium",
};

describe("explainInputSchema", () => {
  it("accepts a document and trims it", () => {
    const parsed = explainInputSchema.safeParse({
      text: `   ${"a".repeat(60)}   `,
      language: "hi",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.text).toBe("a".repeat(60));
    expect(parsed.success && parsed.data.language).toBe("hi");
  });

  it("rejects text that is too short to read, naming the field", () => {
    const parsed = explainInputSchema.safeParse({ text: "too short", language: "en" });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.path).toEqual(["text"]);
  });

  it("rejects an unsupported language", () => {
    const parsed = explainInputSchema.safeParse({
      text: "x".repeat(60),
      language: "kl",
    });
    expect(parsed.success).toBe(false);
  });

  it("allows readerContext to be omitted", () => {
    const parsed = explainInputSchema.safeParse({
      text: "x".repeat(60),
      language: "en",
    });
    expect(parsed.success && parsed.data.readerContext).toBeUndefined();
  });

  it("caps readerContext so no long personal note can be sent", () => {
    const parsed = explainInputSchema.safeParse({
      text: "x".repeat(60),
      language: "en",
      readerContext: "y".repeat(301),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("normalizeExplanation", () => {
  it("passes a well-formed reply through untouched", () => {
    expect(normalizeExplanation(VALID_REPLY)).toMatchObject({
      documentType: "Electricity bill",
      sender: "State Electricity Board",
    });
  });

  it("accepts snake_case keys that models drift into", () => {
    const normalized = normalizeExplanation({
      document_type: "Lease",
      what_this_is: "A rental agreement.",
      summary: "Rent is due monthly.",
      key_facts: [
        { label: "Rent", value: "Rs. 9,000", quote: "monthly rent of Rs. 9,000" },
      ],
      watch_out_for: [],
      questions_to_ask: ["Can I have a receipt?"],
      uncertain_about: [],
      confidence: "HIGH",
    }) as Record<string, unknown>;

    expect(normalized.documentType).toBe("Lease");
    expect(normalized.whatThisIs).toBe("A rental agreement.");
    expect(normalized.confidence).toBe("high");
    expect(normalized.keyFacts).toHaveLength(1);
  });

  it("accepts near-synonym key names", () => {
    const normalized = normalizeExplanation({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      facts: [{ name: "Due date", text: "12 Aug", sourceQuote: "due on 12 Aug" }],
      action_items: [{ action: "Respond", evidence: "you must respond" }],
      confidence: "low",
    }) as Record<string, unknown>;

    expect(normalized.keyFacts).toEqual([
      { label: "Due date", value: "12 Aug", quote: "due on 12 Aug" },
    ]);
    expect(normalized.actions).toEqual([
      { instruction: "Respond", deadline: null, quote: "you must respond" },
    ]);
  });

  it("drops half-filled items instead of failing the whole document", () => {
    const normalized = normalizeExplanation({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      keyFacts: [
        { label: "Good", value: "1", quote: "quote one" },
        { label: "No quote", value: "2" },
        { value: "3", quote: "quote three" },
        "not an object",
      ],
      confidence: "low",
    }) as Record<string, unknown>;

    expect(normalized.keyFacts).toHaveLength(1);
  });

  it("treats an unrecognised confidence as low rather than guessing high", () => {
    const normalized = normalizeExplanation({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      confidence: "quite sure actually",
    }) as Record<string, unknown>;

    expect(normalized.confidence).toBe("low");
  });

  it("turns blank strings into nulls and caps over-long lists", () => {
    const normalized = normalizeExplanation({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      sender: "   ",
      questionsToAsk: Array.from({ length: 20 }, (_unused, i) => `q${i}`),
      confidence: "low",
    }) as Record<string, unknown>;

    expect(normalized.sender).toBeNull();
    expect((normalized.questionsToAsk as string[]).length).toBe(6);
  });

  it("keeps cautions written in their own shape, which uses note not value", () => {
    const normalized = normalizeExplanation({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      watchOutFor: [
        { note: "A surcharge applies after the due date.", quote: "surcharge of 2%" },
        { note: "Auto-renews unless cancelled.", quote: "renews automatically" },
      ],
      confidence: "medium",
    }) as Record<string, unknown>;

    expect(normalized.watchOutFor).toEqual([
      { note: "A surcharge applies after the due date.", quote: "surcharge of 2%" },
      { note: "Auto-renews unless cancelled.", quote: "renews automatically" },
    ]);
  });

  it("leaves a non-object reply for the schema to reject", () => {
    expect(normalizeExplanation("just a string")).toBe("just a string");
    expect(normalizeExplanation(null)).toBeNull();
  });
});

describe("explanationSchema", () => {
  it("fills honest defaults for everything optional", () => {
    const parsed = explanationSchema.safeParse({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      confidence: "low",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.sender).toBeNull();
    expect(parsed.success && parsed.data.keyFacts).toEqual([]);
    expect(parsed.success && parsed.data.actions).toEqual([]);
  });

  it("requires the parts a reader depends on", () => {
    expect(explanationSchema.safeParse({ summary: "x" }).success).toBe(false);
  });

  it("rejects a confidence value outside the three allowed", () => {
    const parsed = explanationSchema.safeParse({
      documentType: "Notice",
      whatThisIs: "A notice.",
      summary: "Something is due.",
      confidence: "pretty sure",
    });
    expect(parsed.success).toBe(false);
  });
});