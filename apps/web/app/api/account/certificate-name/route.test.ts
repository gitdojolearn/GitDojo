// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

const auth = vi.hoisted(() => ({
  result: { status: "verified", identity: { issuer: "idp", subject: "ada", name: "Ada Lovelace" } },
}));
const store = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
const origin = vi.hoisted(() => ({ allowed: true }));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth/identity", () => ({ getVerifiedIdentity: () => Promise.resolve(auth.result) }));
vi.mock("@/lib/certificates/name-store", () => ({
  readCertificateName: store.read,
  saveCertificateName: store.save,
}));
vi.mock("@/lib/http/same-origin", () => ({ isSameOriginRequest: () => origin.allowed }));

const savedName = {
  givenName: "Ada",
  familyName: "Lovelace",
  updatedAt: new Date("2026-10-19T10:00:00Z"),
};
function request(payload: unknown) {
  const body = JSON.stringify(payload);
  return new Request("https://gitdojo.example/api/account/certificate-name", {
    method: "PUT",
    headers: { "content-type": "application/json", "content-length": String(body.length) },
    body,
  });
}

beforeEach(() => {
  auth.result = {
    status: "verified",
    identity: { issuer: "idp", subject: "ada", name: "Provider Name" },
  };
  origin.allowed = true;
  store.read.mockReset().mockResolvedValue(savedName);
  store.save.mockReset().mockResolvedValue(savedName);
});
afterEach(() => vi.restoreAllMocks());

describe("/api/account/certificate-name", () => {
  it("returns only the signed-in account's saved name and no-store headers", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      name: { givenName: "Ada", familyName: "Lovelace" },
      certificate: { ok: true, recipientName: "Ada Lovelace" },
    });
    expect(store.read).toHaveBeenCalledWith({
      issuer: "idp",
      subject: "ada",
      name: "Provider Name",
    });
  });

  it("saves only validated request names under the verified identity", async () => {
    const response = await PUT(
      request({ givenName: " Zoë ", familyName: "O’Brien", issuer: "other", subject: "mallory" }),
    );
    expect(response.status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
    const ok = await PUT(request({ givenName: " Zoë ", familyName: "O’Brien" }));
    expect(ok.status).toBe(200);
    expect(store.save).toHaveBeenCalledWith(
      { issuer: "idp", subject: "ada", name: "Provider Name" },
      { givenName: "Zoë", familyName: "O’Brien" },
    );
  });

  it("rejects cross-origin writes before saving and gives field validation errors", async () => {
    origin.allowed = false;
    expect((await PUT(request({ givenName: "Ada", familyName: "Lovelace" }))).status).toBe(403);
    origin.allowed = true;
    const response = await PUT(request({ givenName: "", familyName: "Lovelace" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "invalid_name",
      errors: { givenName: { code: "required" } },
    });
    expect(store.save).not.toHaveBeenCalled();
  });
});
