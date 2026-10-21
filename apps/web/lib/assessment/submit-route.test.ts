// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assessment/attempts/[id]/submit/route";
import { submitFailure } from "@/features/assessment/components/AssessmentWorkspace";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth/identity", () => ({
  getVerifiedIdentity: () =>
    Promise.resolve({ status: "verified", identity: { issuer: "idp", subject: "ada" } }),
}));
vi.mock("@/lib/http/same-origin", () => ({ isSameOriginRequest: () => true }));
const store = vi.hoisted(() => ({ submit: vi.fn() }));
const quota = vi.hoisted(() => ({ consume: vi.fn(), cost: vi.fn() }));
vi.mock("@/lib/assessment/store", () => ({ submitAttempt: store.submit }));
vi.mock("@/lib/assessment/rate-limit", () => ({
  consumeAssessmentQuota: quota.consume,
  assessmentSubmissionCost: quota.cost,
}));
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitedResponse: (retryAfter: number) =>
    Response.json(
      { error: { code: "rate_limited", message: "Too many requests. Try again shortly." } },
      { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(retryAfter) } },
    ),
}));

const GRADED = { grade: { passed: true, rubricVersion: 1, criteria: [] }, credentialId: null };

function submit(id: string) {
  const body = JSON.stringify({ evidence: { attemptId: id }, publicNameConsent: false });
  return POST(
    new Request(`https://gitdojo.example/api/assessment/attempts/${id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(body.length) },
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  store.submit.mockReset().mockResolvedValue(GRADED);
  quota.consume.mockReset().mockResolvedValue(null);
  quota.cost.mockReset().mockReturnValue(1);
});

describe("POST /api/assessment/attempts/[id]/submit", () => {
  it("grades an attempt whose id is a real database UUID", async () => {
    // gen_random_uuid() ids have five groups; a four-group check rejected every attempt.
    const id = "6f1c2b9e-3a4d-4f5e-8a7b-9c0d1e2f3a4b";
    const response = await submit(id);
    expect(response.status).toBe(200);
    expect(store.submit).toHaveBeenCalledWith(
      { issuer: "idp", subject: "ada" },
      id,
      { attemptId: id },
      false,
    );
    expect(quota.cost).toHaveBeenCalledWith(
      Buffer.byteLength(JSON.stringify({ evidence: { attemptId: id }, publicNameConsent: false })),
    );
    expect(quota.consume).toHaveBeenCalledWith({ issuer: "idp", subject: "ada" }, "submit", 1);
  });

  it("returns the standard retry response when the account quota is exhausted", async () => {
    quota.consume.mockResolvedValue(17);
    const response = await submit("6f1c2b9e-3a4d-4f5e-8a7b-9c0d1e2f3a4b");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "Too many requests. Try again shortly." },
    });
    expect(store.submit).not.toHaveBeenCalled();
  });

  it("refuses a malformed id without touching the database", async () => {
    expect((await submit("not-an-attempt")).status).toBe(404);
    expect((await submit("6f1c2b9e-3a4d-4f5e-9c0d1e2f3a4b")).status).toBe(404);
    expect(store.submit).not.toHaveBeenCalled();
  });
});

describe("submitFailure", () => {
  it("tells the learner what went wrong and what to do", () => {
    expect(submitFailure(401)).toMatch(/Sign in again/);
    expect(submitFailure(404)).toMatch(/Start a fresh attempt/);
    expect(submitFailure(503)).toMatch(/try again in a moment/);
    expect(submitFailure(500)).toMatch(/could not grade/);
  });
});
