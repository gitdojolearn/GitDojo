/** Versioned, fixed criteria. Changing requirements means a new version, never an edit here. */
export const AWARDS = {
  "git-foundations": {
    title: "Git Foundations",
    description: "GitDojo completion certificate for foundational Git lessons and practice.",
    template: "git-foundations-template.png",
    criteriaVersion: 1,
    lessons: [
      "what-is-git",
      "git-vs-github",
      "git-init",
      "git-status",
      "working-tree",
      "staging-area",
      "git-add",
      "git-commit",
      "git-log",
      "first-repository-challenge",
    ],
    practice: ["commit-one-change"],
  },
  "branching-collaboration": {
    title: "Branching & Collaboration",
    description: "GitDojo completion certificate for branching and merging lessons and practice.",
    template: "branching-collaboration-template.png",
    criteriaVersion: 1,
    lessons: [
      "what-is-a-branch",
      "understanding-head",
      "git-branch",
      "git-switch",
      "commit-on-branch",
      "branching-challenge",
      "what-is-merging",
      "fast-forward-merge",
      "three-way-merge",
      "merge-feature-into-main",
      "merge-challenge",
    ],
    practice: ["start-a-branch", "merge-a-feature"],
  },
  "git-recovery-history": {
    title: "Git Recovery & History",
    description: "GitDojo completion certificate for history and recovery lessons and practice.",
    template: "git-recovery-history-template.png",
    criteriaVersion: 1,
    lessons: [
      "git-diff",
      "git-restore",
      "three-trees",
      "git-reset",
      "git-revert",
      "git-stash",
      "git-cherry-pick",
      "git-reflog",
      "git-rebase",
      "git-rebase-interactive",
      "recovery-challenge",
    ],
    practice: ["rescue-a-reset", "shelve-and-switch"],
  },
} as const;

export type AwardKey = keyof typeof AWARDS;
export const awardKeys = Object.keys(AWARDS) as AwardKey[];
export function isAwardKey(value: unknown): value is AwardKey {
  return typeof value === "string" && Object.hasOwn(AWARDS, value);
}

export function criteriaNarrative(key: AwardKey): string {
  const award = AWARDS[key];
  return `Complete ${award.lessons.length} named lessons and ${award.practice.length} named Practice mode tasks in GitDojo. Completions are learner-reported and content IDs are checked by GitDojo; exercise outcomes are not independently verified by the server.`;
}

/**
 * One thing an award asks for. `id` is the stable requirement ID and completion key
 * (`lesson:<id>` or `practice:<id>`), the same key the server reports as missing.
 */
export interface AwardRequirement {
  id: string;
  kind: "lesson" | "practice";
  /** The lesson or Practice task ID in the content. */
  contentId: string;
  /** 1-based: lessons in the award's order, then Practice tasks. */
  order: number;
}

/** An award's requirements in the order a learner should complete them. */
export function awardRequirements(key: AwardKey): AwardRequirement[] {
  const award = AWARDS[key];
  return [
    ...award.lessons.map((contentId) => ({ kind: "lesson" as const, contentId })),
    ...award.practice.map((contentId) => ({ kind: "practice" as const, contentId })),
  ].map((item, index) => ({ ...item, id: `${item.kind}:${item.contentId}`, order: index + 1 }));
}

/** Completed lesson and Practice task IDs, as stored for an account. */
export interface CompletionSets {
  lessons: ReadonlySet<string>;
  practice: ReadonlySet<string>;
}

const isDone = (requirement: AwardRequirement, done: CompletionSets) =>
  (requirement.kind === "lesson" ? done.lessons : done.practice).has(requirement.contentId);

/**
 * The requirement IDs still missing, in order. The single eligibility rule: issuance refuses a
 * certificate while this is not empty, and the track page and dashboard show the same list.
 */
export function missingRequirements(key: AwardKey, done: CompletionSets): string[] {
  return awardRequirements(key)
    .filter((requirement) => !isDone(requirement, done))
    .map((requirement) => requirement.id);
}

/** The requirement IDs already complete, in order. */
export function completedRequirements(key: AwardKey, done: CompletionSets): string[] {
  return awardRequirements(key)
    .filter((requirement) => isDone(requirement, done))
    .map((requirement) => requirement.id);
}
