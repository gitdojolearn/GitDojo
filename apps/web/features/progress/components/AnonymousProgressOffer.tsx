"use client";

import { Button } from "@gitdojo/ui";
import { CloudUpload } from "lucide-react";
import { useState } from "react";
import {
  addAnonymousProgress,
  dismissAnonymousProgress,
  useProgressStore,
  type AnonymousProgressOffer as Offer,
} from "../state/use-progress-store";

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

function describeOffer({ lessons, challenges, practice }: Offer): string {
  const parts = [
    lessons > 0 ? plural(lessons, "lesson") : null,
    challenges > 0 ? plural(challenges, "challenge") : null,
    practice > 0 ? plural(practice, "practice task") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`
    : (parts[0] ?? "");
}

/**
 * Offered once a signed-in learner's account has loaded, when this browser holds completions
 * made while signed out that the account lacks. Adding them works exactly like restoring a
 * backup; declining keeps both records as they are and is not asked again for the same work.
 */
export function AnonymousProgressOffer() {
  const offer = useProgressStore((state) => state.anonymousOffer);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  if (!offer) return null;

  const add = async () => {
    setWorking(true);
    setError("");
    try {
      const result = await addAnonymousProgress();
      if (result === "activity-sync-failed") {
        setError(
          "Your completions were added on this device, but your account couldn't be reached to save everything. Try again in a moment.",
        );
      } else if (result === "not-ready") {
        setError("Progress is still loading. Wait a moment, then try again.");
      }
    } catch {
      setError("We couldn't add that progress. Nothing was changed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section
      aria-labelledby="anonymous-offer-heading"
      data-testid="anonymous-progress-offer"
      className="rounded-xl border border-accent/40 bg-accent-soft p-5"
    >
      <h2
        id="anonymous-offer-heading"
        className="flex items-center gap-2 text-body font-semibold text-fg"
      >
        <CloudUpload className="size-4 text-accent" aria-hidden="true" />
        Add your signed-out progress to this account?
      </h2>
      <p className="mt-2 max-w-2xl text-small text-fg-secondary">
        This browser has {describeOffer(offer)} you finished while signed out. Add them to your
        account only if they are yours: on a shared computer, they may be someone else&apos;s. They
        count as completions you reported; certificates still need work your account verified.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-small text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="primary"
          disabled={working}
          onClick={() => {
            void add();
          }}
          data-testid="anonymous-progress-add"
        >
          Add to my account
        </Button>
        <Button
          variant="secondary"
          disabled={working}
          onClick={dismissAnonymousProgress}
          data-testid="anonymous-progress-dismiss"
        >
          Not now
        </Button>
      </div>
    </section>
  );
}
