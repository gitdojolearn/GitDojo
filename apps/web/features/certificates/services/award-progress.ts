import {
  completedLessonIds,
  indexLessons,
  solvedPracticeIds,
  type LocalProgress,
  type ProgressCatalog,
} from "@gitdojo/progress";
import {
  awardRequirements,
  missingRequirements,
  type AwardKey,
  type AwardRequirement,
  type CompletionSets,
} from "@/lib/certificates/awards";

/** A requirement with where to do it, for links. */
export interface RequirementLink {
  kind: "lesson" | "practice";
  id: string;
  /** The current title, or the id if the content is not in the catalog. */
  title: string;
  /** Where to do it; absent when the content is not in the catalog. */
  href?: string;
  /** The lesson's course, when it still exists. */
  course?: string;
}

export interface AwardProgress {
  done: number;
  total: number;
  remaining: number;
  /** Whole percent, 0–100. */
  percent: number;
  /** The first requirement not done yet, in the award's order. */
  next: RequirementLink | null;
}

/** Title, course and route for a requirement, from the content catalog. */
export function requirementLink(
  requirement: Pick<AwardRequirement, "kind" | "contentId">,
  catalog: ProgressCatalog,
): RequirementLink {
  const { kind, contentId: id } = requirement;
  if (kind === "lesson") {
    const lesson = indexLessons(catalog).get(id);
    return {
      kind,
      id,
      title: lesson?.title ?? id,
      ...(lesson?.course
        ? { href: `/learn/${lesson.course.slug}/${lesson.slug}`, course: lesson.course.title }
        : {}),
    };
  }
  const task = catalog.practice.find((candidate) => candidate.id === id);
  return { kind, id, title: task?.title ?? id, ...(task ? { href: `/practice/${id}` } : {}) };
}

/** Completion sets from requirement IDs (`lesson:<id>`, `practice:<id>`), as the server reports. */
export function completionSetsFromIds(ids: readonly string[]): CompletionSets {
  const lessons = new Set<string>();
  const practice = new Set<string>();
  for (const id of ids) {
    if (id.startsWith("lesson:")) lessons.add(id.slice("lesson:".length));
    else if (id.startsWith("practice:")) practice.add(id.slice("practice:".length));
  }
  return { lessons, practice };
}

/** How far a set of completions is towards an award, by the rule issuance applies. */
export function awardProgressFrom(
  key: AwardKey,
  done: CompletionSets,
  catalog: ProgressCatalog,
): AwardProgress {
  const total = awardRequirements(key).length;
  const missing = missingRequirements(key, done);
  const nextId = missing[0];
  const next = awardRequirements(key).find((requirement) => requirement.id === nextId);
  return {
    done: total - missing.length,
    total,
    remaining: missing.length,
    percent: total === 0 ? 0 : Math.round(((total - missing.length) / total) * 100),
    next: next ? requirementLink(next, catalog) : null,
  };
}

/**
 * How far this browser's progress is towards an award's fixed criteria. Only a guide for learners
 * without an account: certificates count the account's stored completions.
 */
export function awardProgress(
  key: AwardKey,
  progress: LocalProgress,
  catalog: ProgressCatalog,
): AwardProgress {
  return awardProgressFrom(
    key,
    { lessons: completedLessonIds(progress), practice: solvedPracticeIds(progress) },
    catalog,
  );
}
