import "server-only";

import { createHash } from "node:crypto";
import { practiceToLessonDefinition, toLessonDefinition } from "@gitdojo/challenge-engine";
import { type CompletionKind, type LessonDefinition } from "@gitdojo/shared-types";
import { loadChallenges, loadPracticeTasks } from "@/lib/content";
import { DEMO_LESSON, loadAllCourses, loadLesson } from "@/lib/lessons";

export interface VersionedCompletionContent {
  lesson: LessonDefinition;
  version: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentVersion(lesson: LessonDefinition): string {
  return createHash("sha256").update(stable(lesson)).digest("hex");
}

export async function loadCompletionContent(
  kind: CompletionKind,
  id: string,
): Promise<VersionedCompletionContent | null> {
  let lesson: LessonDefinition | undefined;
  if (kind === "challenge") {
    const challenge = (await loadChallenges()).find((item) => item.id === id);
    lesson = challenge ? toLessonDefinition(challenge) : undefined;
  } else if (kind === "practice") {
    const task = (await loadPracticeTasks()).find((item) => item.id === id);
    lesson = task ? practiceToLessonDefinition(task) : undefined;
  } else {
    const courses = await loadAllCourses();
    lesson = courses.flatMap((course) => course.lessons).find((item) => item.id === id);
    if (!lesson && id === DEMO_LESSON) lesson = await loadLesson(DEMO_LESSON);
  }
  return lesson ? { lesson, version: contentVersion(lesson) } : null;
}
