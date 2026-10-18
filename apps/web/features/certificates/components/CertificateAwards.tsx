"use client";

import { type LocalProgress, type ProgressCatalog } from "@gitdojo/progress";
import { Badge, Button, cn } from "@gitdojo/ui";
import { ArrowRight, Award, CircleCheck, LoaderCircle, ShieldX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AWARDS, awardKeys, type AwardKey } from "@/lib/certificates/awards";
import { CERTIFICATION_TRACK } from "@/lib/certificates/track";
import { useProgressStore } from "@/features/progress";
import {
  awardProgress,
  awardProgressFrom,
  completionSetsFromIds,
  type AwardProgress,
} from "../services/award-progress";
import { requestCertificate } from "../services/issue-certificate";
import {
  loadCertificationStatus,
  useAccountCertification,
  type IssuedCertificate,
} from "../state/use-certification-status";
import {
  CertificateLinks,
  CopyVerificationLink,
  ISSUED_DATE,
  NameConsentChoice,
} from "./CertificateParts";

const plural = (count: number, noun: string) => `${String(count)} ${noun}${count === 1 ? "" : "s"}`;

/** The awards besides the certification track's, which has its own card and page. */
const OTHER_AWARDS = awardKeys.filter((key) => key !== CERTIFICATION_TRACK.awardKey);

export function CertificateAwards({
  progress,
  catalog,
}: {
  progress: LocalProgress;
  catalog: ProgressCatalog;
}) {
  const mode = useProgressStore((state) => state.mode);
  const accountId = progress.owner.kind === "account" ? progress.owner.accountId : null;
  const account = mode === "account" && accountId !== null;
  const certification = useAccountCertification(account ? accountId : null);
  const issued = certification.data?.certificates ?? null;
  const loadFailed = certification.status === "error";
  const [busy, setBusy] = useState<AwardKey | null>(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  // The award issued in this visit, for its brief unlock moment.
  const [unlocked, setUnlocked] = useState<AwardKey | null>(null);

  async function issue(key: AwardKey) {
    if (busy || !accountId) return;
    setBusy(key);
    setMessage("");
    const result = await requestCertificate(key, consent);
    if (result.ok) {
      await loadCertificationStatus(accountId);
      setUnlocked(key);
      setMessage(`${AWARDS[key].title} certificate issued.`);
    } else {
      setMessage(result.message);
    }
    setBusy(null);
  }

  const awards = OTHER_AWARDS.map((key) => {
    const award = AWARDS[key];
    const item = issued?.find(
      (candidate) =>
        candidate.awardKey === key && candidate.criteriaVersion === award.criteriaVersion,
    );
    // Signed in: the account's stored completions, as issuance counts them. Otherwise a guide
    // from this browser.
    const server = account ? certification.data?.progress[key] : undefined;
    const status = server
      ? awardProgressFrom(key, completionSetsFromIds(server.completed), catalog)
      : awardProgress(key, progress, catalog);
    return { key, award, item, status };
  });
  const issuable = awards.some(({ item, status }) => !item && status.remaining === 0);

  return (
    <section
      aria-labelledby="certificates-heading"
      data-testid="certificates"
      className="rounded-xl border border-border-subtle bg-surface p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <Award className="size-5 text-accent" aria-hidden="true" />
        <h2 id="certificates-heading" className="text-h3 font-semibold text-fg">
          More completion certificates
        </h2>
      </div>
      <p className="mt-2 max-w-3xl text-small text-fg-secondary">
        Finish each set of lessons and Practice tasks to receive a GitDojo completion certificate.
        These awards record learner-reported progress in GitDojo; they are not an assessment of Git
        proficiency.
      </p>
      {mode === "anonymous" ? (
        <p className="mt-3 text-small text-fg-secondary" data-testid="certificates-sign-in">
          Sign in to receive verifiable certificates. Certificates count your account&apos;s
          completions, so work done while signed out doesn&apos;t count towards them.
        </p>
      ) : mode === "account-unavailable" ? (
        <p className="mt-3 text-small text-fg-secondary" data-testid="certificates-unavailable">
          Your account can&apos;t be reached right now, so certificates can&apos;t be shown or
          issued. The progress below is from this visit.
        </p>
      ) : loadFailed ? (
        <p className="mt-3 text-small text-fg-secondary" data-testid="certificates-load-failed">
          Certificates are temporarily unavailable. The progress below is from this browser.
        </p>
      ) : null}

      {account && issuable ? (
        <div className="mt-5">
          <NameConsentChoice value={consent} onChange={setConsent} disabled={busy !== null} />
        </div>
      ) : null}

      <ul className="mt-5 grid gap-4 lg:grid-cols-2">
        {awards.map(({ key, award, item, status }) => (
          <li
            key={key}
            data-testid="certificate"
            data-award={key}
            data-state={
              item
                ? item.revoked
                  ? "revoked"
                  : "issued"
                : status.remaining === 0
                  ? "ready"
                  : "in-progress"
            }
            className={cn(
              "flex flex-col rounded-lg border bg-panel p-4 transition-colors duration-200 ease-out",
              item && !item.revoked ? "border-success/40" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-fg">{award.title}</h3>
              <AwardBadge item={item} status={status} unlocked={unlocked === key} />
            </div>
            <Requirements status={status} title={award.title} />
            <p className="mt-1 text-caption text-fg-muted">
              {award.lessons.length} lessons · {plural(award.practice.length, "Practice task")} ·
              criteria v{award.criteriaVersion}
            </p>

            <div className="mt-auto pt-4">
              {item ? (
                <Earned item={item} unlocked={unlocked === key} onAnnounce={setMessage} />
              ) : status.next ? (
                <p className="text-small text-fg-secondary" data-testid="certificate-next">
                  <span className="text-fg-muted">Next: </span>
                  {status.next.href ? (
                    <Link
                      href={status.next.href}
                      className="group inline-flex items-center gap-1 font-medium text-accent hover:underline"
                    >
                      {status.next.title}
                      <ArrowRight
                        className="size-3.5 transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    <span className="font-medium text-fg">{status.next.title}</span>
                  )}
                  <span className="text-fg-muted">
                    {" "}
                    · {status.next.kind === "lesson" ? "Lesson" : "Practice task"}
                  </span>
                </p>
              ) : account ? (
                <Button
                  variant="primary"
                  disabled={busy !== null || issued === null}
                  onClick={() => {
                    void issue(key);
                  }}
                >
                  {busy === key ? (
                    <>
                      <LoaderCircle className="animate-spin" aria-hidden="true" /> Issuing…
                    </>
                  ) : issued === null && !loadFailed ? (
                    "Checking…"
                  ) : (
                    "Issue certificate"
                  )}
                </Button>
              ) : (
                <p className="text-small text-fg-secondary">
                  All requirements done in this browser.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p role="status" className="mt-4 min-h-5 text-small text-fg-secondary">
        {message}
      </p>
    </section>
  );
}

function Requirements({ status, title }: { status: AwardProgress; title: string }) {
  return (
    <div className="mt-3">
      <p className="flex items-baseline justify-between gap-3 text-small text-fg-secondary">
        <span data-testid="certificate-count">
          <span className="font-mono font-semibold text-fg">{status.done}</span> of{" "}
          <span className="font-mono">{status.total}</span> requirements
        </span>
        <span className="text-caption text-fg-muted">
          {status.remaining === 0 ? "All done" : `${String(status.remaining)} left`}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={`${title} requirements`}
        aria-valuetext={`${String(status.done)} of ${String(status.total)} requirements`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-strong"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            status.remaining === 0 ? "bg-success" : "bg-accent",
          )}
          style={{ width: `${String(status.percent)}%` }}
        />
      </div>
    </div>
  );
}

function AwardBadge({
  item,
  status,
  unlocked,
}: {
  item?: IssuedCertificate;
  status: AwardProgress;
  unlocked: boolean;
}) {
  if (item?.revoked) {
    return (
      <Badge tone="danger">
        <ShieldX aria-hidden="true" /> Revoked
      </Badge>
    );
  }
  if (item) {
    return (
      <Badge tone="success" className={unlocked ? "animate-gd-pop" : undefined}>
        <CircleCheck aria-hidden="true" /> Earned
      </Badge>
    );
  }
  return status.remaining === 0 ? <Badge tone="accent">Ready</Badge> : <Badge>In progress</Badge>;
}

function Earned({
  item,
  unlocked,
  onAnnounce,
}: {
  item: IssuedCertificate;
  unlocked: boolean;
  onAnnounce: (message: string) => void;
}) {
  return (
    <div className={unlocked ? "animate-gd-enter" : undefined} data-testid="certificate-earned">
      {item.revoked ? (
        <p
          className="mb-3 flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-small text-danger"
          data-testid="certificate-revoked"
        >
          <ShieldX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          GitDojo revoked this certificate. It is no longer valid, and its verification page says
          so.
        </p>
      ) : null}
      <p className="text-small text-fg-secondary">
        {item.revoked ? "Issued, then revoked by GitDojo" : "Issued"}{" "}
        <time dateTime={item.issuedAt} className="font-medium text-fg">
          {ISSUED_DATE.format(new Date(item.issuedAt))}
        </time>
      </p>
      <div className="mt-3">
        <CertificateLinks item={item} />
      </div>
      <CopyVerificationLink item={item} onAnnounce={onAnnounce} />
      <p className="mt-2 text-caption text-fg-muted">
        Name on the public page: {item.publicNameConsent ? "shown" : "withheld"}
      </p>
    </div>
  );
}
