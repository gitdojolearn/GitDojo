import "server-only";

import { awardRequirements } from "./awards";
import { CERTIFICATION_TRACK } from "./track";
import { loadPracticeTasks } from "@/lib/content";
import { loadAllCourses } from "@/lib/lessons";

export interface TrackRequirementContent {
  id: string;
  kind: "lesson" | "practice";
  order: number;
  title: string;
  description?: string;
  href?: string;
  course?: string;
}

/**
 * Each track requirement with its title, one-line description and route, read from the content
 * at build time. A requirement whose content is missing keeps its ID as a title and has no link,
 * so the page never points at a lesson that doesn't exist.
 */
export async function loadTrackRequirements(): Promise<TrackRequirementContent[]> {
  const [courses, practice] = await Promise.all([loadAllCourses(), loadPracticeTasks()]);
  const lessons = new Map(
    courses.flatMap(({ course, lessons: list }) =>
      list.map((lesson) => [lesson.id, { lesson, course }] as const),
    ),
  );
  const tasks = new Map(practice.map((task) => [task.id, task]));
  return awardRequirements(CERTIFICATION_TRACK.awardKey).map((requirement) => {
    const base = { id: requirement.id, kind: requirement.kind, order: requirement.order };
    if (requirement.kind === "lesson") {
      const found = lessons.get(requirement.contentId);
      if (!found) return { ...base, title: requirement.contentId };
      return {
        ...base,
        title: found.lesson.title,
        ...(found.lesson.goal ? { description: found.lesson.goal } : {}),
        href: `/learn/${found.course.slug}/${found.lesson.slug}`,
        course: found.course.title,
      };
    }
    const task = tasks.get(requirement.contentId);
    if (!task) return { ...base, title: requirement.contentId };
    return {
      ...base,
      title: task.title,
      description: task.mission.trim(),
      href: `/practice/${task.id}`,
    };
  });
}
