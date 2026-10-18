"use client";

import { Button, cn } from "@gitdojo/ui";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileKey2,
  ImageDown,
  Link2,
  LoaderCircle,
  Share2,
  ShieldX,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AWARDS, isAwardKey } from "@/lib/certificates/awards";
import { badgeAltText } from "@/lib/certificates/badge";
import { addToProfileUrl, LINKEDIN_MANUAL_HELP, linkedInFields } from "@/lib/certificates/linkedin";
import { formatCredentialDate } from "@/lib/certificates/public-view";
import { type IssuedCertificate } from "../state/use-certification-status";
import { CopyVerificationLink, verificationLinkOf } from "./CertificateParts";

/**
 * Sharing an earned certificate: LinkedIn, the verification link, a badge picture and the signed
 * Open Badge. Every option leads back to the verification link, the one place that says whether
 * the certificate is valid right now.
 */
export function ShareCertificate({
  item,
  onAnnounce,
  variant = "full",
}: {
  item: IssuedCertificate;
  /** Announces through the caller's one status region. */
  onAnnounce: (message: string) => void;
  /** `compact` folds the options away behind a "Share certificate" toggle, for the dashboard. */
  variant?: "full" | "compact";
}) {
  const content = item.revoked ? (
    <div className="space-y-3" data-testid="share-revoked">
      <p className="flex items-start gap-2 text-small text-fg-secondary">
        <ShieldX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        This certificate was revoked, so there is nothing to share. Its verification link still
        works and shows that it is no longer valid.
      </p>
      <CopyVerificationLink item={item} onAnnounce={onAnnounce} />
    </div>
  ) : (
    <ShareOptions item={item} onAnnounce={onAnnounce} preview={variant === "full"} />
  );

  if (variant === "compact") {
    return (
      <details className="group mt-3" data-testid="share-certificate">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-small font-medium text-accent hover:underline">
          <Share2 className="size-3.5" aria-hidden="true" /> Share certificate
        </summary>
        <div className="mt-3">{content}</div>
      </details>
    );
  }
  return (
    <section aria-labelledby={`share-${item.id}`} data-testid="share-certificate" className="mt-5">
      <h3 id={`share-${item.id}`} className="text-body font-semibold text-fg">
        Share certificate
      </h3>
      <p className="mt-1 text-small text-fg-secondary">
        Your verification link is what counts: anyone can open it, without an account, to see
        whether this certificate is valid right now.
      </p>
      <div className="mt-4">{content}</div>
    </section>
  );
}

function ShareOptions({
  item,
  onAnnounce,
  preview,
}: {
  item: IssuedCertificate;
  onAnnounce: (message: string) => void;
  preview: boolean;
}) {
  const url = verificationLinkOf(item);
  const title = isAwardKey(item.awardKey) ? AWARDS[item.awardKey].title : item.awardKey;
  const fields = linkedInFields({
    title,
    kindLabel: "Completion Certificate",
    id: item.id,
    issuedAt: new Date(item.issuedAt),
    verificationUrl: url,
  });
  const linkedIn = addToProfileUrl();
  const alt = badgeAltText({
    title,
    kindLabel: "Completion certificate",
    holderName: item.publicNameConsent ? item.recipientName : null,
    issuedOn: formatCredentialDate(new Date(item.issuedAt)),
    verifyAt: url.replace(/^https?:\/\//, ""),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ShareCard icon={ExternalLink} title="LinkedIn">
        <Button asChild variant="primary" size="sm">
          <a
            href={linkedIn ?? LINKEDIN_MANUAL_HELP}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="share-linkedin"
          >
            Add to LinkedIn <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
        <p className="mt-3 text-caption text-fg-muted">
          {linkedIn
            ? "LinkedIn opens its “Add license or certification” form. It doesn't fill anything in, so copy these into it:"
            : "Opens LinkedIn's instructions for adding a certification to your profile. Copy these into its form:"}
        </p>
        <dl className="mt-2 space-y-2" data-testid="share-linkedin-fields">
          <CopyField label="Name" value={fields.name} onAnnounce={onAnnounce} />
          <CopyField
            label="Issuing organization"
            value={fields.issuingOrganization}
            onAnnounce={onAnnounce}
          />
          <CopyField label="Issue date" value={fields.issueDate} onAnnounce={onAnnounce} />
          <CopyField label="Credential ID" value={fields.credentialId} onAnnounce={onAnnounce} />
          <CopyField label="Credential URL" value={fields.credentialUrl} onAnnounce={onAnnounce} />
        </dl>
      </ShareCard>

      <div className="grid content-start gap-4">
        <ShareCard icon={Link2} title="Verification link">
          <p className="text-caption text-fg-muted">
            Paste it into a CV, a portfolio or a message.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <CopyVerificationLink item={item} onAnnounce={onAnnounce} />
            <NativeShare
              title={`${title} completion certificate`}
              url={url}
              onAnnounce={onAnnounce}
            />
          </div>
        </ShareCard>

        <ShareCard icon={ImageDown} title="Badge image">
          {preview ? <BadgePreview id={item.id} alt={alt} /> : null}
          <BadgeDownload item={item} onAnnounce={onAnnounce} />
          <p className="mt-2 text-caption text-fg-muted">
            A square PNG for posts and profiles. It&apos;s a picture, not proof: it shows your
            verification link so people can check it.
            {item.publicNameConsent ? "" : " Your name isn't on it, as you chose."}
          </p>
        </ShareCard>

        <ShareCard icon={FileKey2} title="Signed Open Badge">
          <a
            href={`/api/credentials/${item.id}`}
            className="inline-flex items-center gap-1.5 text-small font-medium text-accent underline"
            data-testid="share-open-badge"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download signed Open Badge (.jwt)
          </a>
          <p className="mt-2 text-caption text-fg-muted">
            A credential file signed by GitDojo, for digital-credential wallets that accept Open
            Badges 3.0 as a JWT. It includes a revocation status. It hasn&apos;t been tested with
            specific wallets yet.
          </p>
        </ShareCard>
      </div>
    </div>
  );
}

function ShareCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Link2;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-panel p-4">
      <h4 className="mb-3 flex items-center gap-2 text-small font-semibold text-fg">
        <Icon className="size-4 text-fg-muted" aria-hidden="true" />
        {title}
      </h4>
      {children}
    </div>
  );
}

/**
 * One value LinkedIn asks for, with its own copy button. If the clipboard is unavailable, the
 * value is selected so it can be copied by hand.
 */
function CopyField({
  label,
  value,
  onAnnounce,
}: {
  label: string;
  value: string;
  onAnnounce: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onAnnounce(`${label} copied.`);
    } catch {
      const node = text.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      onAnnounce(`Couldn't copy the ${label.toLowerCase()}. It is selected, so copy it yourself.`);
    }
  };

  return (
    <div data-testid="share-field">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="flex items-start justify-between gap-2">
        <span ref={text} className="min-w-0 text-small wrap-anywhere text-fg">
          {value}
        </span>
        <button
          type="button"
          onClick={() => {
            void copy();
          }}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-fg-secondary transition-colors duration-150 ease-out hover:border-border-strong hover:text-fg",
            copied && "border-success/40 text-success",
          )}
          aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </button>
      </dd>
    </div>
  );
}

const noSubscription = () => () => undefined;

/** A thumbnail of the badge; hidden rather than broken if it can't be drawn right now. */
function BadgePreview({ id, alt }: { id: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // A private, signed-in image: next/image's optimizer would cache it for everyone.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/certificates/${id}/badge`}
      alt={alt}
      width={120}
      height={120}
      onError={() => {
        setFailed(true);
      }}
      className="mb-3 size-30 rounded-md border border-border-subtle"
      data-testid="share-badge-preview"
    />
  );
}

/** The device's own share sheet, offered only where the browser supports it. */
function NativeShare({
  title,
  url,
  onAnnounce,
}: {
  title: string;
  url: string;
  onAnnounce: (message: string) => void;
}) {
  // False on the server and during hydration, then the browser's answer: no markup mismatch.
  const supported = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );
  if (!supported) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="mt-3"
      onClick={() => {
        navigator.share({ title, url }).catch((error: unknown) => {
          // Closing the share sheet is not a failure worth announcing.
          if (error instanceof DOMException && error.name === "AbortError") return;
          onAnnounce("Couldn't open sharing on this device. Copy the link instead.");
        });
      }}
    >
      <Share2 aria-hidden="true" /> Share…
    </Button>
  );
}

/**
 * Downloads the badge PNG from the server, which draws it from the issued record. Fetched rather
 * than linked so a failure becomes a message instead of a broken file.
 */
function BadgeDownload({
  item,
  onAnnounce,
}: {
  item: IssuedCertificate;
  onAnnounce: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/certificates/${item.id}/badge`, { cache: "no-store" });
      if (!response.ok) throw new Error(`badge: ${String(response.status)}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `gitdojo-badge-${item.awardKey}.png`;
      link.click();
      // Give the browser a moment to start the download before releasing the data.
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      onAnnounce("Badge image downloaded.");
    } catch {
      onAnnounce("Couldn't make the badge image right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={() => {
        void download();
      }}
      data-testid="share-badge-download"
    >
      {busy ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" /> Preparing…
        </>
      ) : (
        <>
          <Download aria-hidden="true" /> Download badge image
        </>
      )}
    </Button>
  );
}
