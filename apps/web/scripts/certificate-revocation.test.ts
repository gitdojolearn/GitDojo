import { describe, expect, it } from "vitest";
import { parseRevokeArgs } from "./certificate-revocation.mjs";

const ID = "3F2B8C1E-9A4D-4E7B-8C2A-1D5E6F7A8B9C";

describe("parseRevokeArgs", () => {
  it("needs a credential id and the operator, and takes an optional reason", () => {
    expect(parseRevokeArgs([ID, "--by", "ops-ada", "--reason", " Issued in error "])).toEqual({
      id: ID.toLowerCase(),
      by: "ops-ada",
      reason: "Issued in error",
      allowReissue: false,
    });
    expect(parseRevokeArgs([ID, "--by", "ops-ada"])).toEqual({
      id: ID.toLowerCase(),
      by: "ops-ada",
      reason: null,
      allowReissue: false,
    });
  });

  it("allows a replacement only when asked to", () => {
    expect(
      parseRevokeArgs([ID, "--allow-reissue", "--by", "ops-ada", "--reason", "Misspelt name"]),
    ).toEqual({ id: ID.toLowerCase(), by: "ops-ada", reason: "Misspelt name", allowReissue: true });
    expect(parseRevokeArgs([ID, "--by", "ops-ada", "--allow-reissue"])).toMatchObject({
      allowReissue: true,
    });
  });

  it("refuses a revocation that would not say who made it", () => {
    expect(parseRevokeArgs([ID]).error).toMatch(/--by is required/);
    expect(parseRevokeArgs([ID, "--by", "  "]).error).toMatch(/--by is required/);
  });

  it("refuses malformed input", () => {
    expect(parseRevokeArgs([]).error).toMatch(/credential UUID/);
    expect(parseRevokeArgs(["3f2b8c1e-9a4d-4e7b-1d5e6f7a8b9c", "--by", "x"]).error).toMatch(
      /credential UUID/,
    );
    expect(parseRevokeArgs([ID, "--by"]).error).toMatch(/Unexpected argument/);
    expect(parseRevokeArgs([ID, "--force", "yes"]).error).toMatch(/Unexpected argument/);
    expect(parseRevokeArgs([ID, "--by", "x", "--reason", "r".repeat(501)]).error).toMatch(/1-500/);
  });
});
