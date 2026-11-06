import "server-only";

import { GIT_COMMAND_SPECS } from "@gitdojo/command-parser";
import { type ProgressCatalog } from "@gitdojo/progress";
import { commandHref } from "@/features/commands/services/catalog";
import { type PaletteLink } from "@/features/palette/services/search";
import { DOCS } from "@/lib/docs";

const PAGES: readonly [string, string, string?][] = [
  ["Home", "/"],
  ["Courses", "/learn", "learn lessons"],
  ["Five-minute lesson", "/learn/demo", "demo first commit start"],
  ["Challenges", "/challenges"],
  ["Practice", "/practice", "drills exercises"],
  ["Playground", "/playground", "sandbox experiment terminal"],
  ["Dashboard", "/dashboard", "progress xp streak profile stats"],
  ["Git commands", "/commands", "reference cheat sheet"],
  ["Certification", "/certification", "certificate"],
  ["Git capstone assessment", "/assessment", "exam test"],
  ["Settings", "/settings", "preferences font size theme animation"],
  ["Documentation", "/docs", "docs help guide"],
  ["Open source", "/open-source", "contribute github"],
  ["What's new", "/whats-new", "release notes changelog"],
];

/**
 * Everything the command palette can open, from the content catalog the layout already loads.
 * Built on the server, once per build.
 */
export function paletteLinks(catalog: ProgressCatalog): PaletteLink[] {
  return [
    ...PAGES.map(([label, href, keywords]) => ({
      id: `page:${href}`,
      group: "Pages",
      label,
      href,
      ...(keywords ? { keywords } : {}),
    })),
    ...Object.values(GIT_COMMAND_SPECS).map((spec) => ({
      id: `command:${spec.name}`,
      group: "Git commands",
      label: `git ${spec.name}`,
      hint: spec.summary,
      href: commandHref(spec.name),
    })),
    ...catalog.courses.flatMap((course) =>
      course.lessons.map((lesson) => ({
        id: `lesson:${course.slug}/${lesson.slug}`,
        group: "Lessons",
        label: lesson.title,
        hint: course.title,
        href: `/learn/${course.slug}/${lesson.slug}`,
      })),
    ),
    ...catalog.challenges.map((challenge) => ({
      id: `challenge:${challenge.id}`,
      group: "Challenges",
      label: challenge.title,
      href: `/challenges/${challenge.id}`,
    })),
    ...catalog.practice.map((task) => ({
      id: `practice:${task.id}`,
      group: "Practice",
      label: task.title,
      hint: task.difficulty,
      href: `/practice/${task.id}`,
    })),
    ...DOCS.map((doc) => ({
      id: `doc:${doc.slug}`,
      group: "Docs",
      label: doc.title,
      hint: doc.description,
      href: `/docs/${doc.slug}`,
    })),
  ];
}
