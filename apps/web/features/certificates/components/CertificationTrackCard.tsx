"use client";

import { type ProgressCatalog } from "@gitdojo/progress";
import { Badge, Button } from "@gitdojo/ui";
import { ArrowRight, Award, CircleCheck, ShieldX } from "lucide-react";
import Link from "next/link";
import { CERTIFICATION_TRACK, TRACK_CERTIFICATE_TITLE } from "@/lib/certificates/track";
import { useTrackState } from "../hooks/use-track-state";
import { requirementLink } from "../services/award-progress";
import { TrackProgressBar } from "./TrackParts";

/**
 * The certification track on the dashboard: where the learner is and the one next thing to do.
 * The full checklist lives on /certification; this card never repeats it.
 */
export function CertificationTrackCard({ catalog }: { catalog: ProgressCatalog }) {
  const state = useTrackState();
  const phase = state.kind === "ready" ? state.phase : null;

  return (
    <section
      aria-labelledby="track-card-heading"
      data-testid="track-card"
      data-state={phase ?? state.kind}
      aria-busy={state.kind === "loading"}
      className="rounded-xl border border-accent-border bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-micro font-semibold tracking-wider text-fg-muted uppercase">
            <Award className="size-4" aria-hidden="true" /> Certification track
          </p>
          <h2 id="track-card-heading" className="mt-2 text-h4 font-semibold text-fg">
            {TRACK_CERTIFICATE_TITLE}
          </h2>
          <p className="mt-1 max-w-2xl text-small text-fg-secondary">
            {CERTIFICATION_TRACK.purpose}
          </p>
        </div>
        {phase === "completed" ? (
          <Badge tone="success">
            <CircleCheck aria-hidden="true" /> Completed
          </Badge>
        ) : phase === "revoked" ? (
          <Badge tone="danger">
            <ShieldX aria-hidden="true" /> Revoked
          </Badge>
        ) : phase === "eligible" ? (
          <Badge tone="success">Eligible</Badge>
        ) : phase === "in-progress" ? (
          <Badge tone="accent">In progress</Badge>
        ) : phase === "not-started" ? (
          <Badge>Not started</Badge>
        ) : null}
      </div>

      {state.kind === "ready" ? (
        <TrackProgressBar
          progress={state.progress}
          label="Certification track requirements"
          className="mt-4"
        />
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <CardAction state={state} catalog={catalog} />
        <Link href="/certification" className="text-small text-accent hover:underline">
          View all criteria
        </Link>
      </div>
    </section>
  );
}

function CardAction({
  state,
  catalog,
}: {
  state: ReturnType<typeof useTrackState>;
  catalog: ProgressCatalog;
}) {
  if (state.kind === "loading") {
    return <span className="text-small text-fg-muted">Loading your progress…</span>;
  }
  if (state.kind === "unconfigured") {
    return (
      <span className="text-small text-fg-secondary">
        Certificates need accounts, which aren&apos;t set up on this site.
      </span>
    );
  }
  if (state.kind === "signed-out") {
    return (
      <span className="text-small text-fg-secondary">
        Sign in to track your progress and get certified.
      </span>
    );
  }
  if (state.kind === "unavailable") {
    return (
      <span className="text-small text-fg-secondary" data-testid="track-card-unavailable">
        Your certification progress can&apos;t be loaded right now.
      </span>
    );
  }
  if (state.phase === "eligible" || state.phase === "completed" || state.phase === "revoked") {
    return (
      <Button asChild variant={state.phase === "eligible" ? "primary" : "secondary"}>
        <Link href="/certification" data-testid="track-card-action">
          {state.phase === "eligible" ? "Get your certificate" : "View your certificate"}{" "}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    );
  }
  const next = state.progress.next;
  const link = next ? requirementLink(next, catalog) : null;
  if (!link?.href) return null;
  return (
    <>
      <Button asChild variant="primary">
        <Link href={link.href} data-testid="track-card-action">
          {state.phase === "not-started" ? "Start certification track" : "Continue track"}{" "}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <span className="text-small text-fg-secondary" data-testid="track-card-next">
        <span className="text-fg-muted">Next: </span>
        {link.title}
      </span>
    </>
  );
}
