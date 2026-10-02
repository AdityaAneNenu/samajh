import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserContent } from "@/services/ai/prompts";
import type { ChatContentPart } from "@/services/ai/provider";

const DOCUMENT = `Your electricity connection number is 1234567.
Amount payable: Rs. 4,250 within 15 days from the date of this letter.`;

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const parts = (content: string | ChatContentPart[]) =>
  content as Array<{ type: string; text?: string; image_url?: { url: string } }>;

describe("buildUserContent", () => {
  it("returns a plain string for a text document", () => {
    const content = buildUserContent(
      { text: DOCUMENT, language: "hi" },
      DOCUMENT,
      false,
    );

    expect(typeof content).toBe("string");
    expect(content).toContain("Hindi (hi)");
    expect(content).toContain("<<<DOCUMENT");
    expect(content).toContain("Rs. 4,250");
    expect(content).toContain("the whole document");
  });

  it("says so when the document was cut short", () => {
    const content = buildUserContent(
      { text: DOCUMENT, language: "en" },
      DOCUMENT,
      true,
    ) as string;

    expect(content).toContain("cut short");
  });

  it("tells the model when no reader context was given", () => {
    const content = buildUserContent(
      { text: DOCUMENT, language: "en" },
      DOCUMENT,
      false,
    ) as string;

    expect(content).toContain("not provided");
  });

  it("passes the reader context through when there is one", () => {
    const content = buildUserContent(
      { text: DOCUMENT, language: "en", readerContext: "my mother, 68" },
      DOCUMENT,
      false,
    ) as string;

    expect(content).toContain("my mother, 68");
  });

  it("sends a photograph as content parts with a data URL", () => {
    const content = buildUserContent(
      { language: "te", image: { mediaType: "image/png", dataBase64: PNG_BASE64 } },
      "",
      false,
    );

    expect(Array.isArray(content)).toBe(true);
    const [instructions, image] = parts(content);

    expect(instructions?.type).toBe("text");
    expect(instructions?.text).toContain("photograph attached to this message");
    expect(instructions?.text).toContain("Telugu (te)");

    expect(image?.type).toBe("image_url");
    expect(image?.image_url?.url).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it("gives the model no document markers when there is no text to give", () => {
    const content = buildUserContent(
      { language: "en", image: { mediaType: "image/jpeg", dataBase64: PNG_BASE64 } },
      "",
      false,
    );

    expect(parts(content)[0]?.text).not.toContain("<<<DOCUMENT");
  });

  it("tells the model to prefer the photo when a transcription is also sent", () => {
    const content = buildUserContent(
      {
        text: DOCUMENT,
        language: "en",
        image: { mediaType: "image/webp", dataBase64: PNG_BASE64 },
      },
      DOCUMENT,
      false,
    );

    const instructions = parts(content)[0]?.text ?? "";
    expect(instructions).toContain("prefer the photograph");
    // and the transcription is still included, marked as such
    expect(instructions).toContain("<<<DOCUMENT");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("forbids advice, which is the whole safety story", () => {
    expect(SYSTEM_PROMPT).toContain("Explain, never advise");
  });

  it("requires quotes to be copied exactly, or the item omitted", () => {
    expect(SYSTEM_PROMPT).toContain("copied EXACTLY");
    expect(SYSTEM_PROMPT).toContain("omit the item entirely");
  });

  it("requires gaps to be reported rather than filled", () => {
    expect(SYSTEM_PROMPT).toContain("uncertainAbout");
    expect(SYSTEM_PROMPT).toContain("does not exist for you");
  });

  it("covers photographs, including what to do when text is unreadable", () => {
    expect(SYSTEM_PROMPT).toContain("photograph");
    expect(SYSTEM_PROMPT).toContain("Never reconstruct a sentence");
  });

  it("names the exact JSON keys so output conforms", () => {
    for (const key of [
      "documentType",
      "whatThisIs",
      "summary",
      "keyFacts",
      "actions",
      "watchOutFor",
      "questionsToAsk",
      "uncertainAbout",
      "confidence",
    ]) {
      expect(SYSTEM_PROMPT).toContain(key);
    }
  });

  it("is versioned, so a wording change is visible", () => {
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});