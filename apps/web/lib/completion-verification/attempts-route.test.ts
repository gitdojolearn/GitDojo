// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/attempts/route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/lib/http/same-origin", () => ({ isSameOriginRequest: () => true }));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  content: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({ getVerifiedIdentity: mocks.auth }));
vi.mock("./content", () => ({ loadCompletionContent: mocks.content }));
vi.mock("./store", () => ({ createCompletionAttempt: mocks.create }));

const identity = { issuer: "idp", subject: "ada", name: "Ada" };
const binding = {
  id: "11111111-1111-4111-8111-111111111111",
  nonce: "server-created-nonce",
  kind: "lesson" as const,
  contentId: "git-init",
  contentVersion: "a".repeat(64),
};

function request(body: unknown) {
  return new Request("https://gitdojo.example/api/attempts", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://gitdojo.example" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ status: "verified", identity });
  mocks.content.mockReset().mockResolvedValue({
    version: binding.contentVersion,
    lesson: { objectives: [{ id: "init" }] },
  });
  mocks.create.mockReset().mockResolvedValue(binding);
});

describe("POST /api/attempts", () => {
  it("creates an account-owned, content-versioned attempt for hands-on work", async () => {
    const response = await POST(request({ kind: "lesson", contentId: "git-init" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(binding);
    expect(mocks.create).toHaveBeenCalledWith(
      identity,
      "lesson",
      "git-init",
      binding.contentVersion,
    );
  });

  it("does not create attempts for anonymous users, invalid ids or concept lessons", async () => {
    mocks.auth.mockResolvedValueOnce({ status: "anonymous" });
    expect((await POST(request({ kind: "lesson", contentId: "git-init" }))).status).toBe(401);

    expect((await POST(request({ kind: "lesson", contentId: "../git-init" }))).status).toBe(400);

    mocks.content.mockResolvedValueOnce({
      version: binding.contentVersion,
      lesson: { objectives: [] },
    });
    expect((await POST(request({ kind: "lesson", contentId: "what-is-git" }))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
