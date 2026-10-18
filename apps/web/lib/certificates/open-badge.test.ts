// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { compactVerify, importJWK, type JWK } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AWARDS, criteriaNarrative } from "./awards";
import { signedBadge, verificationUrl } from "./credential";
import type { Certificate } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("./store", () => ({ revokedIndexes: vi.fn() }));

/** A stand-in for the key table: remembers the public key the issuer registers. */
const keys = vi.hoisted(() => ({ stored: new Map<string, unknown>() }));
vi.mock("@/lib/db/client", () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("INSERT INTO certificate_signing_keys")) {
      const [keyId, jwk] = values as [string, unknown];
      if (!keys.stored.has(keyId)) keys.stored.set(keyId, jwk);
      return Promise.resolve([]);
    }
    const [keyId] = values as [string];
    return Promise.resolve(keys.stored.has(keyId) ? [{ public_jwk: keys.stored.get(keyId) }] : []);
  };
  sql.json = (value: unknown) => value;
  return { getDatabase: () => sql };
});

const ID = "81f3774e-b448-49d7-85cd-dc56f0922f96";
const ORIGIN = "https://git-dojo-drab.vercel.app";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

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

interface BadgeClaims {
  jti: string;
  iss: string;
  validFrom: string;
  credentialSubject: { name?: string; achievement: { name: string } };
  evidence: { id: string }[];
  credentialStatus: { statusPurpose: string };
}

async function verified(jwt: string) {
  const jwk = keys.stored.get("rsa-test") as JWK;
  const { payload, protectedHeader } = await compactVerify(jwt, await importJWK(jwk, "RS256"));
  return {
    header: protectedHeader,
    claims: JSON.parse(new TextDecoder().decode(payload)) as BadgeClaims,
  };
}

beforeEach(() => {
  keys.stored.clear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.stubEnv("GITDOJO_CREDENTIAL_KEY_ID", "rsa-test");
  vi.stubEnv("GITDOJO_CREDENTIAL_PRIVATE_KEY", privateKey);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signed Open Badge", () => {
  it("is signed by GitDojo's key and describes the issued certificate", async () => {
    const { header, claims } = await verified(await signedBadge(certificate()));
    expect(header).toMatchObject({
      alg: "RS256",
      typ: "JWT",
      kid: `${ORIGIN}/api/credentials/keys/rsa-test`,
    });
    expect(claims.jti).toBe(`${ORIGIN}/api/credentials/${ID}`);
    expect(claims.iss).toBe(`${ORIGIN}/api/credentials/issuer`);
    expect(claims.validFrom).toBe("2026-10-18T18:05:00.000Z");
    expect(claims.credentialSubject.achievement.name).toBe("Git Foundations");
    expect(claims.credentialSubject.name).toBe("Aakash Wijesekara");
    // The same verification URL the page, PDF and share options use.
    expect(claims.evidence[0]?.id).toBe(verificationUrl(ID));
    expect(claims.credentialStatus.statusPurpose).toBe("revocation");
  });

  it("leaves the name out without consent, and never carries private data", async () => {
    const jwt = await signedBadge(certificate({ publicNameConsent: false }));
    const { claims } = await verified(jwt);
    expect(claims.credentialSubject.name).toBeUndefined();
    const decoded = JSON.stringify(claims);
    for (const secret of ["Aakash", "private-user-id", "PRIVATE KEY"]) {
      expect(decoded).not.toContain(secret);
    }
    expect(jwt).not.toContain(privateKey.split("\n")[1] ?? "never");
  });
});
