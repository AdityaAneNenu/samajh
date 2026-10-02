import { describe, expect, it } from "vitest";
import { base64Bytes, formatBytes, isAcceptedImage } from "@/lib/image";

/**
 * Only the pure helpers are covered here. `prepareImage` itself needs a DOM
 * (FileReader, canvas) and is deliberately kept thin for that reason.
 */

describe("isAcceptedImage", () => {
  it("accepts what a phone camera and a screenshot produce", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(isAcceptedImage({ type })).toBe(true);
    }
  });

  it("rejects everything else, including a PDF or a HEIC", () => {
    for (const type of [
      "application/pdf",
      "text/plain",
      "image/gif",
      "image/heic",
      "",
    ]) {
      expect(isAcceptedImage({ type })).toBe(false);
    }
  });
});

describe("base64Bytes", () => {
  it("agrees with the real decoded length for arbitrary strings", () => {
    for (const sample of ["a", "hi", "hello world", "x".repeat(1000)]) {
      const encoded = Buffer.from(sample, "utf8").toString("base64");
      expect(base64Bytes(encoded)).toBe(Buffer.byteLength(sample, "utf8"));
    }
  });

  it("accounts for both padding characters", () => {
    expect(base64Bytes("aGk=")).toBe(2); // "hi"
    expect(base64Bytes("aGVsbG8=")).toBe(5); // "hello"
    expect(base64Bytes(Buffer.from("ab").toString("base64"))).toBe(2);
  });

  it("is zero for nothing at all", () => {
    expect(base64Bytes("")).toBe(0);
  });
});

describe("formatBytes", () => {
  it("reads the way a person would say it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});