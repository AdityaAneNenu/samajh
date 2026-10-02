import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

const ENV_KEYS = ["AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "AI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** Clear the provider configuration and remember it, for restoration. */
function unconfigure() {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
}

describe("GET /api/health", () => {
  it("reports the app as up, and the provider as unconfigured", async () => {
    unconfigure();

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.aiReady).toBe(false);
  });

  it("reports readiness once a provider is configured", async () => {
    unconfigure();
    process.env.AI_PROVIDER = "mock";

    const body = await (await GET()).json();
    expect(body.aiReady).toBe(true);
    expect(body.provider).toBe("mock");
  });

  it("never echoes the credential, only the fact that one is set", async () => {
    unconfigure();
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_BASE_URL = "https://provider.test/v1";
    process.env.AI_MODEL = "test-model";
    process.env.AI_API_KEY = "gsk_supersecretvalue123";

    const response = await GET();
    const raw = await response.text();

    expect(raw).not.toContain("gsk_supersecretvalue123");
    expect(raw).not.toContain("supersecret");
    expect(JSON.parse(raw)).toMatchObject({ status: "ok", aiReady: true });
  });

  it("is never cached", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});