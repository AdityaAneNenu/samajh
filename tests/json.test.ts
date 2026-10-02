import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/errors";
import { extractJson } from "@/lib/json";

describe("extractJson", () => {
  it("parses a plain object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a fenced json block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose around the object", () => {
    expect(extractJson('Sure, here you go:\n{"a":1}\nHope that helps.')).toEqual({
      a: 1,
    });
  });

  it("repairs a trailing comma", () => {
    expect(extractJson('{"a":1,}')).toEqual({ a: 1 });
    expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it("handles nested braces without truncating", () => {
    expect(extractJson('x {"a":{"b":[1,2]}} y')).toEqual({ a: { b: [1, 2] } });
  });

  it("throws an invalid_response AiError for empty input", () => {
    expect(() => extractJson("   ")).toThrow(AiError);
    try {
      extractJson("");
    } catch (error) {
      expect((error as AiError).kind).toBe("invalid_response");
    }
  });

  it("throws an invalid_response AiError for non-JSON text", () => {
    try {
      extractJson("I could not read this document.");
    } catch (error) {
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).kind).toBe("invalid_response");
      return;
    }
    throw new Error("expected extractJson to throw");
  });
});