/**
 * The name printed on a learner's certificates: entered and stored by GitDojo, never taken from
 * the identity provider. Shared by the account page (to explain problems as the learner types),
 * the profile API (to validate what it stores) and issuance (to refuse a name it can't print).
 */

export const NAME_LIMITS = { part: 60, full: 80 } as const;

export interface CertificateNameInput {
  givenName: string;
  familyName: string;
}

export type NameFieldError = "required" | "too_long" | "characters";

export type NameValidation =
  | { ok: true; name: CertificateNameInput }
  | { ok: false; errors: Partial<Record<keyof CertificateNameInput | "full", NameFieldError>> };

/**
 * Letters of any script (with their accents and marks), spaces, apostrophes, hyphens and full
 * stops, starting with a letter: "Zoë", "O'Brien", "Jean-Luc", "José Martín", "Nguyễn", "王".
 * Digits and symbols are refused so an email address or a URL can't become a name.
 */
const NAME = /^[\p{L}][\p{L}\p{M} '\u2019.\-\u2010]*$/u;

const tidy = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");

/** Validates and tidies (NFC, trimmed, single spaces) a name. The given name is required. */
export function validateCertificateName(input: {
  givenName?: unknown;
  familyName?: unknown;
}): NameValidation {
  const errors: Partial<Record<keyof CertificateNameInput | "full", NameFieldError>> = {};
  const givenName = typeof input.givenName === "string" ? tidy(input.givenName) : "";
  const familyName = typeof input.familyName === "string" ? tidy(input.familyName) : "";

  if (!givenName) errors.givenName = "required";
  else if (givenName.length > NAME_LIMITS.part) errors.givenName = "too_long";
  else if (!NAME.test(givenName)) errors.givenName = "characters";

  if (familyName.length > NAME_LIMITS.part) errors.familyName = "too_long";
  else if (familyName && !NAME.test(familyName)) errors.familyName = "characters";

  if (
    Object.keys(errors).length === 0 &&
    fullName({ givenName, familyName }).length > NAME_LIMITS.full
  ) {
    errors.full = "too_long";
  }
  return Object.keys(errors).length === 0
    ? { ok: true, name: { givenName, familyName } }
    : { ok: false, errors };
}

/** "Aakash Wijesekara"; just the given name when there is no surname. */
export function fullName(name: CertificateNameInput): string {
  return [name.givenName, name.familyName].filter(Boolean).join(" ");
}

/**
 * Characters the certificate can't print yet. The PDF uses its built-in fonts, which cover
 * Latin-1 only (and the badge image's font covers Latin), so a name in another script is stored
 * but can't be issued until GitDojo embeds a wider font.
 */
export function unprintableCharacters(name: string): string[] {
  // The u flag matches whole code points, so a character outside the BMP counts once.
  const outside = name.replaceAll("\u2019", "'").match(/[^\u0020-\u007e\u00a0-\u00ff]/gu) ?? [];
  return [...new Set(outside)];
}

/**
 * The exact name to print on a new certificate, or why there isn't one. Curly apostrophes
 * become straight ones so the same text appears in the PDF, on the page and in the badge.
 */
export function issuableName(
  name: CertificateNameInput | null,
):
  | { ok: true; recipientName: string }
  | { ok: false; reason: "missing" | "unprintable"; characters?: string[] } {
  if (!name || !validateCertificateName(name).ok) return { ok: false, reason: "missing" };
  const recipientName = fullName(name).replaceAll("’", "'");
  const characters = unprintableCharacters(recipientName);
  return characters.length > 0
    ? { ok: false, reason: "unprintable", characters }
    : { ok: true, recipientName };
}

/** Learner-facing explanations, used by the API and the account page alike. */
export const NAME_ERROR_MESSAGES: Record<NameFieldError, string> = {
  required: "Enter your given name. It's required for certificates.",
  too_long: `Keep each part to ${String(NAME_LIMITS.part)} characters, and the whole name to ${String(NAME_LIMITS.full)}.`,
  characters: "Use letters, spaces, apostrophes, hyphens and full stops only.",
};

/** Why a certificate can't be issued with the learner's name, and what to do about it. */
export function nameRequiredMessage(
  reason: "missing" | "unprintable",
  characters: readonly string[] = [],
): string {
  return reason === "missing"
    ? "Add your certificate name on your account page before getting a certificate."
    : `Certificates can't print ${characters.map((char) => `"${char}"`).join(", ")} yet. Change your certificate name on your account page, for example to how it's written in Latin letters.`;
}
