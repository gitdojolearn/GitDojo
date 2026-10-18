// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/certificates/route";

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
const store = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("./store", () => ({
  issueCertificate: store.issue,
  ownCertificates: vi.fn(),
  revokedIndexes: vi.fn(),
}));
const db = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => db.sql }));

function issue() {
  const body = JSON.stringify({ awardKey: "git-foundations", publicNameConsent: false });
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
