// @vitest-environment node
import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/certificates/[id]/badge/route";
import { AWARDS, criteriaNarrative } from "./awards";
import { badgeAltText, badgeContent } from "./badge";
import type { Certificate } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
const auth = vi.hoisted(() => ({ status: "verified" }));
vi.mock("@/lib/auth/identity", () => ({
  getVerifiedIdentity: () =>
    Promise.resolve(
      auth.status === "verified"
        ? { status: "verified", identity: { issuer: "idp", subject: "ada", name: "Ada Lovelace" } }
        : { status: auth.status },
    ),
}));
const store = vi.hoisted(() => ({
  own: vi.fn<(identity: unknown, id: string) => Promise<Certificate | null>>(),
}));
vi.mock("./store", () => ({ ownCertificate: store.own, revokedIndexes: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: vi.fn() }));

const ID = "81f3774e-b448-49d7-85cd-dc56f0922f96";
const OUT = process.env.BADGE_OUT;

function certificate(overrides: Partial<Certificate> = {}): Certificate {
  const award = AWARDS["git-foundations"];
  return {
    id: ID,
    statusIndex: 4,
    userId: "private-user-id",
    awardKey: "git-foundations",
    credentialKind: "completion",
    criteriaVersion: 1,
    recipientName: "Aakash Wijesekara",
    publicNameConsent: true,
    issuedAt: new Date("2026-10-18T18:05:00Z"),
    revokedAt: null,
    reissueAllowed: false,
    evidence: {
      kind: "completion",
      title: award.title,
      description: award.description,
      template: award.template,
      criteria: criteriaNarrative("git-foundations"),
      lessons: [...award.lessons],
      practice: [...award.practice],
    },
    ...overrides,
  };
}

const request = (id = ID) =>
  GET(new Request(`https://gitdojo.example/api/certificates/${id}/badge`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  auth.status = "verified";
  store.own.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://git-dojo-drab.vercel.app");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("badge content", () => {
  it("shows the holder's name only with consent, and no private data", () => {
    const url = `https://git-dojo-drab.vercel.app/verify/${ID}`;
    const shown = badgeContent(certificate(), url);
    expect(shown).toEqual({
      title: "Git Foundations",
      kindLabel: "Completion certificate",
      holderName: "Aakash Wijesekara",
      issuedOn: "October 18, 2026",
      verifyAt: `git-dojo-drab.vercel.app/verify/${ID}`,
    });
    const withheld = badgeContent(certificate({ publicNameConsent: false }), url);
    expect(withheld.holderName).toBeNull();
    expect(JSON.stringify(withheld)).not.toMatch(/Aakash|private-user-id|statusIndex/);
    expect(badgeAltText(withheld)).toBe(
      `GitDojo completion certificate: Git Foundations, issued October 18, 2026, check it is valid at git-dojo-drab.vercel.app/verify/${ID}`,
    );
  });
});

describe("GET /api/certificates/[id]/badge", () => {
  it("draws a square PNG of the learner's own certificate", async () => {
    store.own.mockResolvedValue(certificate());
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "gitdojo-badge-git-foundations.png",
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    // Width and height from the PNG header.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 1200]);
    if (OUT) writeFileSync(`${OUT}/badge-named.png`, bytes);
  });

  it("leaves the name out without consent", async () => {
    store.own.mockResolvedValue(certificate({ publicNameConsent: false }));
    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://certificates.gitdojo-learning-platform.example.org",
    );
    const response = await request();
    expect(response.status).toBe(200);
    if (OUT) writeFileSync(`${OUT}/badge-private.png`, Buffer.from(await response.arrayBuffer()));
  });

  it("serves only the signed-in learner's own, current certificate", async () => {
    store.own.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(store.own).toHaveBeenCalledWith(expect.objectContaining({ subject: "ada" }), ID);
    expect((await request("not-an-id")).status).toBe(404);
    store.own.mockResolvedValue(certificate({ revokedAt: new Date() }));
    expect(await (await request()).json()).toEqual({ error: "revoked" });
    auth.status = "unauthenticated";
    expect((await request()).status).toBe(401);
  });
});
