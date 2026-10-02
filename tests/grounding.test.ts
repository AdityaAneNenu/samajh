import { describe, expect, it } from "vitest";
import { annotateGrounding, isQuoteGrounded, locateQuote } from "@/lib/grounding";
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

describe("locateQuote", () => {
  it("finds an exact quote and reports the line it sits on", () => {
    const location = locateQuote("A late payment surcharge of 2%", SOURCE);

    expect(location).not.toBeNull();
    expect(location?.line).toBe(4);
    expect(location?.match).toBe("A late payment surcharge of 2%");
    expect(location?.after).toContain("applies after the due date.");
    // the preceding lines are shown as context, because that is the point
    expect(location?.before).toContain("Amount payable");
  });

  it("handles a quote that a line break falls in the middle of", () => {
    const source = "Amount payable:\n   Rs. 4,250 within 15 days";
    const location = locateQuote("Amount payable: Rs. 4,250", source);

    expect(location?.match).toBe("Amount payable: Rs. 4,250");
    expect(location?.line).toBe(1);
  });

  it("counts lines the way a reader counts them", () => {
    const location = locateQuote("three lines", "one\ntwo\nthree lines");
    expect(location?.line).toBe(3);
  });

  it("ignores case and reports where the source's own wording is", () => {
    const location = locateQuote("NOTICE", "hello\nnotice of demand");
    expect(location?.line).toBe(2);
    expect(location?.match).toBe("notice");
  });

  it("locates a quote that elides its middle with an ellipsis", () => {
    const location = locateQuote(
      "Your electricity connection number is 1234567 ... A late payment surcharge",
      SOURCE,
    );

    expect(location).not.toBeNull();
    expect(location?.match).toContain("Your electricity connection number is 1234567");
    expect(location?.match).toContain("A late payment surcharge");
  });

  it("returns null rather than guessing when the quote is not there", () => {
    expect(
      locateQuote("Your connection will be disconnected on 1 January", SOURCE),
    ).toBeNull();
  });

  it("returns null for a quote too short to place meaningfully", () => {
    expect(locateQuote("Rs.", SOURCE)).toBeNull();
  });

  it("marks context as trimmed when the quote sits deep inside a long document", () => {
    const long = `${"x ".repeat(400)}\nTARGET PHRASE HERE\n${"y ".repeat(400)}`;
    const location = locateQuote("TARGET PHRASE HERE", long);

    expect(location?.trimmed).toBe(true);
    expect(location?.before.length).toBeLessThan(200);
    expect(location?.after.length).toBeLessThan(200);
  });

  it("returns nothing at all when there is no source to search", () => {
    expect(locateQuote("A late payment surcharge of 2%", "")).toBeNull();
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