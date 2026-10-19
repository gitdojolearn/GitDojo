"use client";

import { Button, cn } from "@gitdojo/ui";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { type IssuedCertificate } from "../state/use-certification-status";

export const ISSUED_DATE = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });

/**
 * The public-name choice, asked before a certificate is issued. Private is the default, and the
 * choice is fixed once issued.
 */
export function NameConsentChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (consent: boolean) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="rounded-lg border border-border bg-panel p-4" disabled={disabled}>
      <legend className="px-1 text-small font-semibold text-fg">
        Your name on the certificate you issue
      </legend>
      <p className="text-caption text-fg-muted">
        Your PDF always shows the certificate name from your account page. Its QR code and link open
        a public verification page: this choice decides whether that page and the Open Badge show
        your name too.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ConsentOption
          name={name}
          checked={!value}
          onSelect={() => {
            onChange(false);
          }}
          title="Keep my name private"
          detail="The verification page says “Name withheld by learner” and the badge has no name."
        />
        <ConsentOption
          name={name}
          checked={value}
          onSelect={() => {
            onChange(true);
          }}
          title="Show my name publicly"
          detail="Your certificate name appears on the public verification page and in the Open Badge."
        />
      </div>
      <p className="mt-3 text-caption text-fg-muted">
        The choice is fixed for each certificate once it is issued, and copies you have shared
        can&apos;t be recalled.
      </p>
    </fieldset>
  );
}

function ConsentOption({
  name,
  checked,
  onSelect,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-2.5 rounded-md border p-3 transition-colors duration-150 ease-out",
        checked ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1" />
      <span>
        <span className="block text-small font-medium text-fg">{title}</span>
        <span className="block text-caption text-fg-muted">{detail}</span>
      </span>
    </label>
  );
}

/** The certificate PDF and its public verification page. Sharing lives in ShareCertificate. */
export function CertificateLinks({ item }: { item: IssuedCertificate }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-small">
      <a
        className="inline-flex items-center gap-1 text-accent underline"
        href={`/api/certificates/${item.id}/pdf`}
      >
        <Download className="size-3.5" aria-hidden="true" />
        PDF
      </a>
      <a
        className="inline-flex items-center gap-1 text-accent underline"
        href={`/verify/${item.id}`}
      >
        <ExternalLink className="size-3.5" aria-hidden="true" />
        Verify
      </a>
    </div>
  );
}

/** The exact link the PDF's QR code opens. */
export function verificationLinkOf(item: IssuedCertificate): string {
  return item.verificationUrl ?? `${window.location.origin}/verify/${item.id}`;
}

/**
 * Copies the exact link the PDF's QR code opens. Success is shown on the button and announced
 * through the caller's one status region; if the clipboard is blocked, the link is shown instead.
 */
export function CopyVerificationLink({
  item,
  onAnnounce,
}: {
  item: IssuedCertificate;
  onAnnounce: (message: string) => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => {
      setState("idle");
    }, 2500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verificationLinkOf(item));
      setState("copied");
      onAnnounce("Verification link copied.");
    } catch {
      setState("failed");
      onAnnounce("Couldn't copy the link. It is shown below the button so you can copy it.");
    }
  };

  return (
    <div className="mt-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          void copy();
        }}
        data-testid="copy-verification-link"
      >
        {state === "copied" ? (
          <>
            <Check aria-hidden="true" /> Link copied
          </>
        ) : (
          <>
            <Copy aria-hidden="true" /> Copy verification link
          </>
        )}
      </Button>
      {state === "failed" ? (
        <p className="mt-2 text-caption break-all text-fg-secondary">
          <span className="text-fg-muted">Verification link: </span>
          <span className="font-mono select-all">{verificationLinkOf(item)}</span>
        </p>
      ) : null}
    </div>
  );
}
