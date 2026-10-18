import { describe, expect, it } from "vitest";
import {
  fullName,
  issuableName,
  unprintableCharacters,
  validateCertificateName,
} from "./certificate-name";

describe("certificate name rules", () => {
  it("normalizes whitespace and Unicode while allowing an optional surname", () => {
    expect(validateCertificateName({ givenName: "  Zoë  ", familyName: " O'Brien  " })).toEqual({
      ok: true,
      name: { givenName: "Zoë", familyName: "O'Brien" },
    });
    expect(fullName({ givenName: "Ada", familyName: "" })).toBe("Ada");
  });

  it("requires a given name and limits each part and the whole name", () => {
    expect(validateCertificateName({ givenName: "", familyName: "Lovelace" })).toMatchObject({
      ok: false,
      errors: { givenName: "required" },
    });
    expect(validateCertificateName({ givenName: "a".repeat(61) })).toMatchObject({
      ok: false,
      errors: { givenName: "too_long" },
    });
    expect(
      validateCertificateName({ givenName: "a".repeat(40), familyName: "b".repeat(40) }),
    ).toMatchObject({
      ok: false,
      errors: { full: "too_long" },
    });
  });

  it("rejects names containing digits, symbols or leading combining marks", () => {
    for (const givenName of ["Ada1", "Ada@", "\u0301Ada"]) {
      expect(validateCertificateName({ givenName })).toMatchObject({
        ok: false,
        errors: { givenName: "characters" },
      });
    }
  });

  it("reports unique code points the current credential artwork cannot print", () => {
    expect(unprintableCharacters("A王😀王")).toEqual(["王", "😀"]);
    expect(issuableName({ givenName: "Zoë", familyName: "D'Arcy" })).toEqual({
      ok: true,
      recipientName: "Zoë D'Arcy",
    });
    expect(issuableName({ givenName: "王", familyName: "" })).toEqual({
      ok: false,
      reason: "unprintable",
      characters: ["王"],
    });
  });
});
