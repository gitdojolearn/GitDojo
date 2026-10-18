"use client";

import { Badge, Button, cn } from "@gitdojo/ui";
import {
  ArrowRight,
  Award,
  CircleCheck,
  LoaderCircle,
  LogIn,
  RotateCcw,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CERTIFICATION_TRACK,
  TRACK_AWARD,
  TRACK_CERTIFICATE_TITLE,
  type TrackProgress,
} from "@/lib/certificates/track";
import { useTrackState, type TrackState } from "../hooks/use-track-state";
import { requestCertificate } from "../services/issue-certificate";
import { loadCertificationStatus, type IssuedCertificate } from "../state/use-certification-status";
import {
  CertificateLinks,
  CopyVerificationLink,
  ISSUED_DATE,
  NameConsentChoice,
  verificationLinkOf,
} from "./CertificateParts";
import {
  RequirementStatusLabel,
  TrackProgressBar,
  WithInlineCode,
  type TrackRequirementInfo,
} from "./TrackParts";

const RETURN_TO = encodeURIComponent("/certification");

/**
 * The learner's place on the certification track: their status and next action, then every
 * requirement in order with its state. Progress is the account's, from the server's records.
 */
export function CertificationTrack({ requirements }: { requirements: TrackRequirementInfo[] }) {
  const state = useTrackState();
  const [message, setMessage] = useState("");
  const progress = state.kind === "ready" ? state.progress : null;

  return (
    <>
      <section
        aria-labelledby="track-status-heading"
        data-testid="track-status"
        data-state={state.kind === "ready" ? state.phase : state.kind}
        aria-busy={state.kind === "loading"}
        className="rounded-xl border border-accent-border bg-panel p-5 sm:p-6"
      >
        <h2 id="track-status-heading" className="text-h4 font-semibold text-fg">
          Your progress
        </h2>
        <StatusPanel state={state} requirements={requirements} onAnnounce={setMessage} />
        <p role="status" className="mt-3 min-h-5 text-small text-fg-secondary">
          {message}
        </p>
      </section>

      <section aria-labelledby="requirements-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="requirements-heading" className="text-h4 font-semibold text-fg">
            Requirements, in order
          </h2>
          <p className="text-caption text-fg-muted">
            Criteria version {TRACK_AWARD.criteriaVersion} · {requirements.length} requirements
          </p>
        </div>
        <ol className="mt-4 space-y-2" data-testid="track-requirements">
          {requirements.map((requirement) => {
            const item = progress?.items.find((entry) => entry.requirement.id === requirement.id);
            const isNext = progress?.next?.id === requirement.id;
            return (
              <li
                key={requirement.id}
                data-testid="track-requirement"
                data-requirement={requirement.id}
                data-status={item?.status ?? "unknown"}
                aria-current={isNext ? "step" : undefined}
                className={cn(
                  "flex gap-3 rounded-lg border bg-panel p-4 transition-colors duration-200 ease-out",
                  isNext ? "border-accent-border" : "border-border-subtle",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-caption text-fg-secondary"
                >
                  {requirement.order}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {requirement.href ? (
                      <Link
                        href={requirement.href}
                        className="text-small font-semibold text-fg hover:underline"
                      >
                        <span className="sr-only">Requirement {requirement.order}: </span>
                        {requirement.title}
                      </Link>
                    ) : (
                      <span className="text-small font-semibold text-fg">{requirement.title}</span>
                    )}
                    <Badge>{requirement.kind === "lesson" ? "Lesson" : "Practice task"}</Badge>
                    {isNext ? <Badge tone="accent">Next</Badge> : null}
                  </div>
                  {requirement.description ? (
                    <p className="mt-1 text-caption text-fg-muted">
                      <WithInlineCode text={requirement.description} />
                    </p>
                  ) : null}
                  {requirement.course ? (
                    <p className="mt-0.5 text-caption text-fg-muted">{requirement.course}</p>
                  ) : null}
                </div>
                <div className="shrink-0 pt-0.5">
                  {item ? <RequirementStatusLabel status={item.status} /> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function StatusPanel({
  state,
  requirements,
  onAnnounce,
}: {
  state: TrackState;
  requirements: TrackRequirementInfo[];
  onAnnounce: (message: string) => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="mt-4 space-y-3" data-testid="track-loading">
        <span className="sr-only">Loading your progress…</span>
        <div className="h-4 w-48 animate-pulse rounded bg-elevated" />
        <div className="h-2 animate-pulse rounded-full bg-elevated" />
      </div>
    );
  }
  if (state.kind === "unconfigured") {
    return (
      <p className="mt-3 text-small text-fg-secondary" data-testid="track-unconfigured">
        Certificates need a GitDojo account, and accounts aren&apos;t set up on this site. You can
        still take every lesson and Practice task below.
      </p>
    );
  }
  if (state.kind === "signed-out") {
    return (
      <div className="mt-3" data-testid="track-signed-out">
        <p className="max-w-2xl text-small text-fg-secondary">
          Sign in to track your progress and receive the certificate. The track counts the
          completions saved to your account, so lessons done while signed out don&apos;t count
          towards it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href={`/sign-in?returnTo=${RETURN_TO}`}>
              <LogIn aria-hidden="true" /> Sign in
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/sign-up?returnTo=${RETURN_TO}`}>Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (state.kind === "unavailable") {
    return (
      <div className="mt-3" data-testid="track-unavailable">
        <p className="flex items-start gap-2 text-small text-fg-secondary">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          Your progress can&apos;t be loaded right now, so the track can&apos;t show where you are
          or issue a certificate. Your work is safe.
        </p>
        <Button variant="secondary" className="mt-4" onClick={state.retry}>
          <RotateCcw aria-hidden="true" /> Try again
        </Button>
      </div>
    );
  }

  const { progress, phase, certificate } = state;
  return (
    <div className="mt-3">
      <PhaseLine phase={phase} progress={progress} />
      <TrackProgressBar
        progress={progress}
        label="Certification track requirements"
        className="mt-4"
      />
      {state.stale ? (
        <p className="mt-2 text-caption text-warning">
          Couldn&apos;t refresh just now; this is your progress as last loaded.
        </p>
      ) : null}
      <div className="mt-5">
        {phase === "completed" || phase === "revoked" ? (
          certificate ? (
            <IssuedConfirmation certificate={certificate} onAnnounce={onAnnounce} />
          ) : null
        ) : phase === "eligible" ? (
          <ClaimCertificate accountId={state.accountId} onAnnounce={onAnnounce} />
        ) : (
          <ContinueAction progress={progress} requirements={requirements} phase={phase} />
        )}
      </div>
      {phase === "not-started" || phase === "in-progress" ? (
        <p className="mt-4 text-caption text-fg-muted">
          Just finished something? It counts once it reaches your account, which happens
          automatically while you&apos;re signed in and online.
        </p>
      ) : null}
    </div>
  );
}

function PhaseLine({
  phase,
  progress,
}: {
  phase: Extract<TrackState, { kind: "ready" }>["phase"];
  progress: TrackProgress;
}) {
  const left = progress.total - progress.completed;
  const text: Record<typeof phase, ReactNode> = {
    "not-started": "You haven't started the track yet.",
    "in-progress": (
      <>
        <strong className="font-semibold text-fg">{left}</strong>{" "}
        {left === 1 ? "requirement" : "requirements"} left before you can get the certificate.
      </>
    ),
    eligible: "Every requirement is complete. You can get your certificate.",
    completed: "Track complete. Your certificate has been issued.",
    revoked: "GitDojo revoked the certificate issued for this track.",
  };
  const badge = {
    "not-started": <Badge>Not started</Badge>,
    "in-progress": <Badge tone="accent">In progress</Badge>,
    eligible: <Badge tone="success">Eligible</Badge>,
    completed: (
      <Badge tone="success">
        <CircleCheck aria-hidden="true" /> Completed
      </Badge>
    ),
    revoked: (
      <Badge tone="danger">
        <ShieldX aria-hidden="true" /> Revoked
      </Badge>
    ),
  }[phase];
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-body text-fg-secondary"
      data-testid="track-phase"
    >
      {badge}
      <span>{text[phase]}</span>
    </p>
  );
}

function ContinueAction({
  progress,
  requirements,
  phase,
}: {
  progress: TrackProgress;
  requirements: TrackRequirementInfo[];
  phase: "not-started" | "in-progress";
}) {
  const next = requirements.find((requirement) => requirement.id === progress.next?.id);
  if (!next) return null;
  const label = phase === "not-started" ? "Start certification track" : "Continue track";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {next.href ? (
        <Button asChild variant="primary" size="lg">
          <Link href={next.href} data-testid="track-continue">
            {label} <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      <p className="text-small text-fg-secondary" data-testid="track-next">
        <span className="text-fg-muted">Next: </span>
        <span className="font-medium text-fg">{next.title}</span>
        <span className="text-fg-muted">
          {" "}
          · {next.kind === "lesson" ? "Lesson" : "Practice task"}
        </span>
      </p>
    </div>
  );
}

function ClaimCertificate({
  accountId,
  onAnnounce,
}: {
  accountId: string;
  onAnnounce: (message: string) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    onAnnounce("");
    const result = await requestCertificate(CERTIFICATION_TRACK.awardKey, consent);
    if (result.ok) {
      await loadCertificationStatus(accountId);
      onAnnounce(`${TRACK_CERTIFICATE_TITLE} issued.`);
    } else {
      setError(result.message);
      onAnnounce(result.message);
    }
    setBusy(false);
  };

  return (
    <div data-testid="track-claim">
      <NameConsentChoice value={consent} onChange={setConsent} disabled={busy} />
      <Button
        variant="primary"
        size="lg"
        className="mt-4"
        disabled={busy}
        onClick={() => {
          void claim();
        }}
        data-testid="track-get-certificate"
      >
        {busy ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" /> Issuing…
          </>
        ) : (
          <>
            <Award aria-hidden="true" /> Get certificate
          </>
        )}
      </Button>
      {error ? (
        <p
          className="mt-3 flex items-start gap-2 text-small text-danger"
          data-testid="track-claim-error"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IssuedConfirmation({
  certificate,
  onAnnounce,
}: {
  certificate: IssuedCertificate;
  onAnnounce: (message: string) => void;
}) {
  const url = verificationLinkOf(certificate);
  return (
    <div
      data-testid="track-certificate"
      className={cn(
        "rounded-lg border p-4",
        certificate.revoked
          ? "border-danger/40 bg-danger-soft"
          : "border-success/40 bg-success-soft",
      )}
    >
      {certificate.revoked ? (
        <p className="mb-3 flex items-start gap-2 text-small text-danger">
          <ShieldX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This certificate is no longer valid, and its verification page says so.
        </p>
      ) : null}
      <h3 className="text-body font-semibold text-fg">{TRACK_CERTIFICATE_TITLE}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 text-small sm:grid-cols-2">
        <div>
          <dt className="text-caption text-fg-muted">Recipient</dt>
          <dd className="text-fg">{certificate.recipientName}</dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">Issued</dt>
          <dd className="text-fg">
            <time dateTime={certificate.issuedAt}>
              {ISSUED_DATE.format(new Date(certificate.issuedAt))}
            </time>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-caption text-fg-muted">Credential ID</dt>
          <dd className="font-mono break-all text-fg" data-testid="track-credential-id">
            {certificate.id}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-caption text-fg-muted">Verification link</dt>
          <dd className="break-all">
            <a href={url} className="text-accent underline">
              {url}
            </a>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-caption text-fg-muted">Name on the public page</dt>
          <dd className="text-fg">{certificate.publicNameConsent ? "Shown" : "Withheld"}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <CertificateLinks item={certificate} />
      </div>
      <CopyVerificationLink item={certificate} onAnnounce={onAnnounce} />
    </div>
  );
}
