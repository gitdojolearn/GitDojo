import { credentialKindLabel, formatCredentialDate, publicCertificate } from "./public-view";
import type { Certificate } from "./store";

/** What the shareable badge image shows: public fields of the issued record, and nothing else. */
export interface BadgeContent {
  title: string;
  /** "Completion certificate" or "Server-graded skills credential". */
  kindLabel: string;
  /** Only when the learner chose to show their name publicly. */
  holderName: string | null;
  issuedOn: string;
  /** The verification URL without its scheme, so it stays short enough to read in the image. */
  verifyAt: string;
}

export function badgeContent(certificate: Certificate, verificationUrl: string): BadgeContent {
  const view = publicCertificate(certificate);
  return {
    title: view.title,
    kindLabel: credentialKindLabel(view),
    holderName: view.holderName,
    issuedOn: formatCredentialDate(view.issuedAt),
    verifyAt: verificationUrl.replace(/^https?:\/\//, ""),
  };
}

/** Describes the image for people who can't see it, from the same content. */
export function badgeAltText(content: BadgeContent): string {
  return [
    `GitDojo ${content.kindLabel.toLowerCase()}: ${content.title}`,
    content.holderName ? `awarded to ${content.holderName}` : null,
    `issued ${content.issuedOn}`,
    `check it is valid at ${content.verifyAt}`,
  ]
    .filter(Boolean)
    .join(", ");
}
