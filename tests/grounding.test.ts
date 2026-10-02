import { describe, expect, it } from "vitest";
import { annotateGrounding, isQuoteGrounded } from "@/lib/grounding";
import type { Explanation } from "@/services/ai/schemas";

const SOURCE = `NOTICE
Your electricity connection number is 1234567.
Amount payable: Rs. 4,250 within 15 days from the date of this letter.
A late payment surcharge of 2% applies after the due date.`;

describe("isQuoteGrounded", () => {
  it("finds a quote copied exactly", () => {
    expect(
      isQuoteGrounded("Amount payable: Rs. 4,250 within 15 days", SOURCE),
    ).toBe(true);
  });

  it("tolerates case, spacing and line breaks", () => {
    expect(
      isQuoteGrounded("your electricity\n   CONNECTION number is 1234567", SOURCE),
    ).toBe(true);
  });

  it("tolerates punctuation differences in an otherwise long quote", () => {
    expect(
      isQuoteGrounded("Amount payable Rs 4250 within 15 days", SOURCE),
    ).toBe(true);
  });

  it("accepts a quote that elides the middle with an ellipsis", () => {
    expect(
      isQuoteGrounded(
        "Your electricity connection number is 1234567 … Amount payable: Rs. 4,250",
        SOURCE,
      ),
    ).toBe(true);
  });

  it("rejects an invented quote that is not in the document", () => {
    expect(
      isQuoteGrounded(
        "Your connection will be disconnected on 1 January without further notice",
        SOURCE,
      ),
    ).toBe(false);
  });

  it("rejects a quote too short to be meaningful", () => {
    expect(isQuoteGrounded("Rs.", SOURCE)).toBe(false);
  });
});

function explanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    documentType: "Electricity bill",
    whatThisIs: "A bill for electricity you have used.",
    summary: "You owe money for electricity and there is a deadline.",
    sender: "State Electricity Board",
    keyFacts: [
      {
        label: "Amount payable",
        value: "Rs. 4,250",
        quote: "Amount payable: Rs. 4,250 within 15 days",
      },
      {
        label: "Connection number",
        value: "1234567",
        quote: "The connection number is 999888",
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
    questionsToAsk: [],
    uncertainAbout: [],
    confidence: "medium",
    ...overrides,
  };
}

describe("annotateGrounding", () => {
  it("marks each item as verified or not, and counts both", () => {
    const outcome = annotateGrounding(explanation(), SOURCE);

    expect(outcome.checked).toBe(4);
    expect(outcome.unverified).toBe(1);
    expect(outcome.keyFacts[0]?.verified).toBe(true);
    expect(outcome.keyFacts[1]?.verified).toBe(false);
    expect(outcome.actions[0]?.verified).toBe(true);
    expect(outcome.watchOutFor[0]?.verified).toBe(true);
  });

  it("names the failing items for the server log", () => {
    const outcome = annotateGrounding(explanation(), SOURCE);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toContain("Connection number");
  });

  it("keeps unverified items rather than silently dropping them", () => {
    const outcome = annotateGrounding(explanation(), SOURCE);
    expect(outcome.keyFacts).toHaveLength(2);
  });

  it("reports nothing unverified when every quote is present", () => {
    const clean = explanation({
      keyFacts: [
        {
          label: "Amount payable",
          value: "Rs. 4,250",
          quote: "Amount payable: Rs. 4,250 within 15 days",
        },
      ],
    });
    const outcome = annotateGrounding(clean, SOURCE);
    expect(outcome.unverified).toBe(0);
    expect(outcome.failures).toEqual([]);
  });
});