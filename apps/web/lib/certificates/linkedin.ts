/**
 * LinkedIn's Add to Profile: LinkedIn no longer pre-fills certificate
 * details, and each organization gets one static link when it creates an Add to Profile button for
 * its LinkedIn Page (https://www.linkedin.com/help/linkedin/answer/a528030). GitDojo reads that
 * link from NEXT_PUBLIC_LINKEDIN_ADD_TO_PROFILE_URL rather than inventing URL parameters.
 */

/** LinkedIn's own instructions for adding a certification by hand, used until a link is set. */
export const LINKEDIN_MANUAL_HELP = "https://www.linkedin.com/help/linkedin/answer/a567169";

const LINKEDIN_HOSTS = new Set(["www.linkedin.com", "linkedin.com", "lnkd.in"]);

/** The configured Add to Profile link, only if it is an https link on LinkedIn; otherwise null. */
export function addToProfileUrl(
  configured: string | undefined = process.env.NEXT_PUBLIC_LINKEDIN_ADD_TO_PROFILE_URL,
): string | null {
  const value = configured?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && LINKEDIN_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What LinkedIn's "Add license or certification" form asks for, in its order. */
export interface LinkedInFields {
  name: string;
  issuingOrganization: string;
  /** "October 2026": LinkedIn asks for a month and year. */
  issueDate: string;
  credentialId: string;
  credentialUrl: string;
}

const MONTH_YEAR = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function linkedInFields(certificate: {
  title: string;
  kindLabel: string;
  id: string;
  issuedAt: Date;
  verificationUrl: string;
}): LinkedInFields {
  return {
    name: `${certificate.title} ${certificate.kindLabel}`,
    issuingOrganization: "GitDojo",
    issueDate: MONTH_YEAR.format(certificate.issuedAt),
    credentialId: certificate.id,
    credentialUrl: certificate.verificationUrl,
  };
}
