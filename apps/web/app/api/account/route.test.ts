// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const state = vi.hoisted(() => {
  const auth: { status: string; identity?: { issuer: string; subject: string } } = {
    status: "verified",
    identity: { issuer: "issuer", subject: "learner" },
  };
  return { auth, originAllowed: true, deleteAccountData: vi.fn() };
});

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/auth/identity", () => ({ getVerifiedIdentity: () => Promise.resolve(state.auth) }));
vi.mock("@/lib/account-deletion/store", () => ({
  deleteAccountData: state.deleteAccountData,
}));
vi.mock("@/lib/http/same-origin", () => ({
  isSameOriginRequest: () => state.originAllowed,
}));

const request = () => new Request("https://gitdojo.example/api/account", { method: "DELETE" });

beforeEach(() => {
  state.auth = { status: "verified", identity: { issuer: "issuer", subject: "learner" } };
  state.originAllowed = true;
  state.deleteAccountData.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("DELETE /api/account", () => {
  it("deletes only the verified identity's data and returns no-store", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.deleteAccountData).toHaveBeenCalledWith({ issuer: "issuer", subject: "learner" });
  });

  it("rejects cross-origin and unauthenticated requests before deleting", async () => {
    state.originAllowed = false;
    expect((await DELETE(request())).status).toBe(403);
    state.originAllowed = true;
    state.auth = { status: "unauthenticated", identity: undefined };
    expect((await DELETE(request())).status).toBe(401);
    expect(state.deleteAccountData).not.toHaveBeenCalled();
  });

  it("does not delete when the identity provider or database is unavailable", async () => {
    state.auth = { status: "unavailable", identity: undefined };
    expect((await DELETE(request())).status).toBe(503);
    state.auth = { status: "verified", identity: { issuer: "issuer", subject: "learner" } };
    state.deleteAccountData.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await DELETE(request())).status).toBe(503);
  });
});
