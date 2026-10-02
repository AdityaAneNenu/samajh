import { describe, expect, it } from "vitest";
import { toPlainText } from "@/lib/format";
import type { ExplainResult } from "@/services/ai/schemas";

const RESULT: ExplainResult = {
  documentType: "Electricity bill",
  whatThisIs: "A bill for electricity you have used.",
  summary: "You owe money and there is a deadline.",
  sender: "State Electricity Board",
  keyFacts: [
    {
      label: "Amount payable",
      value: "Rs. 4,250",
      quote: "Amount payable: Rs. 4,250",
      verified: true,
      location: null,
    },
  ],
  actions: [
    {
      instruction: "Pay the amount.",
      deadline: "15 days",
      quote: "within 15 days",
      verified: true,
      location: null,
    },
  ],
  watchOutFor: [
    {
      note: "A surcharge applies after the due date.",
      quote: "surcharge of 2%",
      verified: false,
      location: null,
    },
  ],
  questionsToAsk: ["Is there any surcharge?"],
  uncertainAbout: ["The account number was hard to read."],
  confidence: "medium",
  language: "hi",
  truncated: false,
  model: "some-open-model",
  elapsedMs: 1234,
  quotesChecked: 3,
  unverifiedQuotes: 1,
  groundingSkipped: false,
};

describe("toPlainText", () => {
  it("includes every section a reader saw on screen", () => {
    const text = toPlainText(RESULT);
    expect(text).toContain("Electricity bill");
    expect(text).toContain("State Electricity Board");
    expect(text).toContain("THE GIST");
    expect(text).toContain("WHAT IT ASKS YOU TO DO");
    expect(text).toContain("NUMBERS AND DATES THAT MATTER");
    expect(text).toContain("WORTH READING TWICE");
    expect(text).toContain("QUESTIONS YOU COULD ASK");
    expect(text).toContain("WHAT WE ARE NOT SURE ABOUT");
  });

  it("keeps the quotes, because they are the reason to trust it", () => {
    const text = toPlainText(RESULT);
    expect(text).toContain("Amount payable: Rs. 4,250");
    expect(text).toContain("within 15 days");
  });

  it("states the unverified count plainly", () => {
    expect(toPlainText(RESULT)).toContain("1 not found");
  });

  it("names the language the explanation was written in", () => {
    expect(toPlainText(RESULT)).toContain("Hindi");
  });

  it("warns when only the beginning was read", () => {
    expect(toPlainText({ ...RESULT, truncated: true })).toContain(
      "only the beginning was read",
    );
  });

  it("repeats the no-advice disclaimer, so it survives being forwarded", () => {
    expect(toPlainText(RESULT)).toContain("does not give legal, medical or financial advice");
  });
});