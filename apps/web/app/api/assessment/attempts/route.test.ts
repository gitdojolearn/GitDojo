// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ create: vi.fn(), consume: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth/identity", () => ({
  getVerifiedIdentity: () =>
    Promise.resolve({ status: "verified", identity: { issuer: "idp", subject: "ada" } }),
}));
vi.mock("@/lib/http/same-origin", () => ({ isSameOriginRequest: () => true }));
vi.mock("@/lib/assessment/store", () => ({ createAttempt: mocks.create }));
vi.mock("@/lib/assessment/rate-limit", () => ({ consumeAssessmentQuota: mocks.consume }));
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitedResponse: (retryAfter: number) =>
    Response.json(
      { error: { code: "rate_limited", message: "Too many requests. Try again shortly." } },
      {
        status: 429,
        headers: { "Cache-Control": "private, no-store", "Retry-After": String(retryAfter) },
      },
    ),
}));

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ id: "attempt-id", nonce: "nonce" });
  mocks.consume.mockReset().mockResolvedValue(null);
});

describe("POST /api/assessment/attempts", () => {
  it("applies the account quota before creating an attempt", async () => {
    mocks.consume.mockResolvedValue(23);
    const response = await POST(
      new Request("https://gitdojo.example/api/assessment/attempts", { method: "POST" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
    expect(mocks.consume).toHaveBeenCalledWith({ issuer: "idp", subject: "ada" }, "create");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates an attempt when the account quota allows it", async () => {
    const response = await POST(
      new Request("https://gitdojo.example/api/assessment/attempts", { method: "POST" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ issuer: "idp", subject: "ada" });
  });
});
