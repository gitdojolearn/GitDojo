import { AWARDS, awardRequirements, type AwardKey, type AwardRequirement } from "./awards";

/**
 * The certification track: the learner-facing path to one award. Its requirements are the award's
 * own (`AWARDS`), so the track can never ask for something issuance doesn't, or the reverse.
 */
export const CERTIFICATION_TRACK = {
  slug: "git-foundations",
  awardKey: "git-foundations",
  name: "Git Foundations certification track",
  issuer: "GitDojo",
  /** One line: why someone would take it. */
  purpose: "Learn the everyday Git workflow, from your first repository to reading its history.",
  audience:
    "Anyone new to Git, or who uses it by copying commands without being sure what they do.",
  prerequisites: "None. You need a free GitDojo account to receive the certificate.",
  topics: [
    "What Git is, and how it differs from GitHub",
    "Starting a repository with git init",
    "Reading git status: the working tree and staging area",
    "Choosing what to commit with git add",
    "Recording changes with git commit",
    "Reading history with git log",
  ],
} as const satisfies {
  slug: string;
  awardKey: AwardKey;
  name: string;
  issuer: string;
  purpose: string;
  audience: string;
  prerequisites: string;
  topics: readonly string[];
};

export const TRACK_AWARD = AWARDS[CERTIFICATION_TRACK.awardKey];

/** "Git Foundations completion certificate". */
export const TRACK_CERTIFICATE_TITLE = `${TRACK_AWARD.title} completion certificate`;

/**
 * - `complete`: the account has a stored completion for it.
 * - `in-progress`: a lesson the account opened most recently and has not finished. Nothing else
 *   counts as started: there is no evidence of partial work on other items.
 * - `not-started`: everything else.
 */
export type RequirementStatus = "not-started" | "in-progress" | "complete";

export interface TrackItem {
  requirement: AwardRequirement;
  status: RequirementStatus;
}

export interface TrackProgress {
  items: TrackItem[];
  completed: number;
  total: number;
  /** Whole percent, 0-100. */
  percent: number;
  /** The first requirement not complete, in track order; `null` once all are. */
  next: AwardRequirement | null;
  /** Every requirement complete: the same rule the server applies before issuing. */
  eligible: boolean;
}

/**
 * Track progress from the account's completed requirement IDs, as the certificates API reports
 * them from the server's records. Unknown IDs are ignored.
 */
export function trackProgress(
  completedIds: readonly string[],
  lastLessonId: string | null = null,
  key: AwardKey = CERTIFICATION_TRACK.awardKey,
): TrackProgress {
  const done = new Set(completedIds);
  const items = awardRequirements(key).map((requirement): TrackItem => {
    const status: RequirementStatus = done.has(requirement.id)
      ? "complete"
      : requirement.kind === "lesson" && requirement.contentId === lastLessonId
        ? "in-progress"
        : "not-started";
    return { requirement, status };
  });
  const completed = items.filter((item) => item.status === "complete").length;
  const total = items.length;
  return {
    items,
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    next: items.find((item) => item.status !== "complete")?.requirement ?? null,
    eligible: total > 0 && completed === total,
  };
}
