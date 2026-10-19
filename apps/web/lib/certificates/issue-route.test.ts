// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/certificates/route";
import { missingRequirements } from "./awards";
import type * as Credential from "./credential";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth/identity", () => ({
  getVerifiedIdentity: () =>
    Promise.resolve({
      status: "verified",
      identity: { issuer: "idp", subject: "ada", name: "Ada Lovelace" },
    }),
}));
vi.mock("@/lib/http/same-origin", () => ({ isSameOriginRequest: () => true }));
const store = vi.hoisted(() => ({ issue: vi.fn(), completions: vi.fn() }));
vi.mock("./store", () => ({
  issueCertificate: store.issue,
  ownCertificates: () => Promise.resolve([]),
  ownCompletions: store.completions,
  revokedIndexes: vi.fn(),
}));
// Stands in for a configured issuer when a test sets `ready`; otherwise the real check runs.
const credential = vi.hoisted(() => ({ ready: false }));
vi.mock("./credential", async (importOriginal) => {
  const actual = await importOriginal<typeof Credential>();
  return {
    ...actual,
    prepareCredentialIssuer: () =>
      credential.ready ? Promise.resolve() : actual.prepareCredentialIssuer(),
  };
});
const db = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => db.sql }));

function issue(extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({ awardKey: "git-foundations", publicNameConsent: false, ...extra });
  return POST(
    new Request("https://gitdojo.example/api/certificates", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(body.length) },
      body,
    }),
  );
}

const log = vi.fn<(...args: unknown[]) => void>();
beforeEach(() => {
  credential.ready = false;
  store.issue.mockReset();
  log.mockReset();
  vi.spyOn(console, "error").mockImplementation(log);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/certificates when issuance is not configured", () => {
  it("says so plainly, names the setting for operators, and issues nothing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const response = await issue();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "issuer_not_configured",
      message: expect.stringContaining("Your progress is safe") as string,
    });
    expect(store.issue).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0]?.[0])).toContain("NEXT_PUBLIC_SITE_URL is required");
  });

  it("never logs any part of an invalid signing key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gitdojo.example");
    vi.stubEnv("GITDOJO_CREDENTIAL_KEY_ID", "rsa-2026-01");
    const secret = "-----BEGIN PRIVATE KEY-----\nTOP-SECRET-MATERIAL\n-----END PRIVATE KEY-----";
    vi.stubEnv("GITDOJO_CREDENTIAL_PRIVATE_KEY", secret);
    const response = await issue();
    expect(await response.json()).toMatchObject({ error: "issuer_not_configured" });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("GITDOJO_CREDENTIAL_PRIVATE_KEY is not a valid PEM private key");
    expect(logged).not.toContain("TOP-SECRET-MATERIAL");
  });

  it("names a missing key id", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gitdojo.example");
    vi.stubEnv("GITDOJO_CREDENTIAL_KEY_ID", "");
    await issue();
    expect(String(log.mock.calls[0]?.[0])).toContain("GITDOJO_CREDENTIAL_KEY_ID is missing");
  });
});

describe("POST /api/certificates and the certificate name", () => {
  beforeEach(() => {
    credential.ready = true;
  });

  it("never passes a name from the request or the identity provider to issuance", async () => {
    store.issue.mockResolvedValue({ status: "issued", certificate: { id: "c1" } });
    const response = await issue({ recipientName: "Mallory", name: "Mallory" });
    expect(await response.json()).toEqual({ id: "c1" });
    expect(store.issue).toHaveBeenCalledWith(
      { issuer: "idp", subject: "ada", name: "Ada Lovelace" },
      "git-foundations",
      false,
    );
    expect(store.issue.mock.calls[0]).toHaveLength(3);
  });

  it("refuses clearly when the learner has no certificate name yet", async () => {
    store.issue.mockResolvedValue({ status: "name_required", reason: "missing", characters: [] });
    const response = await issue();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "name_required",
      reason: "missing",
      message: "Add your certificate name on your account page before getting a certificate.",
    });
  });

  it("names the characters a certificate can't print", async () => {
    store.issue.mockResolvedValue({
      status: "name_required",
      reason: "unprintable",
      characters: ["王"],
    });
    const body = (await (await issue()).json()) as { message: string };
    expect(body.message).toContain('"王"');
  });
});

describe("GET /api/certificates", () => {
  it("reports each award's progress from the account's stored completions, by the issuing rule", async () => {
    const done = {
      lessons: new Set(["what-is-git", "git-init", "what-is-a-branch"]),
      practice: new Set(["commit-one-change"]),
    };
    store.completions.mockResolvedValue({ done, lastLessonId: "git-status" });
    const body = (await (await GET()).json()) as {
      progress: Record<string, { completed: string[]; missing: string[] }>;
      lastLessonId: string | null;
    };
    expect(body.lastLessonId).toBe("git-status");
    expect(body.progress["git-foundations"]?.completed).toEqual([
      "lesson:what-is-git",
      "lesson:git-init",
      "practice:commit-one-change",
    ]);
    expect(body.progress["git-foundations"]?.missing).toEqual(
      missingRequirements("git-foundations", done),
    );
    expect(body.progress["branching-collaboration"]?.completed).toEqual([
      "lesson:what-is-a-branch",
    ]);
  });
});
