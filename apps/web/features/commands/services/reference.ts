import "server-only";

import { GIT_COMMAND_SPECS, type FlagSpec } from "@gitdojo/command-parser";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { lessonHref } from "@/features/course";
import { loadAllCourses } from "@/lib/lessons";
import { CATEGORIES, COMMAND_INFO, type CommandInfo } from "./catalog";

export interface LessonLink {
  title: string;
  href: string;
  course: string;
}

/** A worked example, taken as authored from a lesson's reference content. */
export interface CommandExample {
  title?: string;
  command: string;
  output?: string;
  explanation?: string;
  lesson: LessonLink;
}

export interface CommandReference {
  name: string;
  summary: string;
  usage: string;
  /** As typed: `-m, --message <value>`. */
  options: string[];
  info: CommandInfo;
  examples: CommandExample[];
  lessons: LessonLink[];
}

const MAX_EXAMPLES = 4;

function flagForm(name: string): string {
  return name.length === 1 ? `-${name}` : `--${name}`;
}

export function formatFlag(flag: FlagSpec): string {
  const forms = [flag.name, ...(flag.aliases ?? [])].map(flagForm).join(", ");
  return flag.takesValue ? `${forms} <value>` : forms;
}

/** `git stash pop` is about `stash`; `git status` is not about `stash`. */
export function isAbout(command: string, name: string): boolean {
  const prefix = `git ${name}`;
  const text = command.trim();
  if (!text.startsWith(prefix)) return false;
  const next = text.charAt(prefix.length);
  return next === "" || /\s/.test(next);
}

function examplesIn(lesson: LessonDefinition, name: string, link: LessonLink): CommandExample[] {
  return (lesson.content ?? []).flatMap((block) =>
    block.type === "example" && isAbout(block.command, name)
      ? [
          {
            ...(block.title ? { title: block.title } : {}),
            command: block.command,
            ...(block.output ? { output: block.output.trimEnd() } : {}),
            ...(block.explanation ? { explanation: block.explanation } : {}),
            lesson: link,
          },
        ]
      : [],
  );
}

let reference: Promise<CommandReference[]> | null = null;

/**
 * Every command the terminal runs, in reference order (by category, then as the parser lists
 * them), with the lessons that teach it and the examples those lessons show. Built once, at
 * build time.
 */
export function loadCommandReference(): Promise<CommandReference[]> {
  reference ??= (async () => {
    const courses = await loadAllCourses();
    const commands = Object.values(GIT_COMMAND_SPECS).map((spec) => {
      const info = COMMAND_INFO[spec.name];
      if (!info) throw new Error(`The command reference has no entry for git ${spec.name}.`);
      const examples: CommandExample[] = [];
      const lessons: LessonLink[] = [];
      for (const { course, lessons: courseLessons } of courses) {
        for (const lesson of courseLessons) {
          const link = {
            title: lesson.title,
            href: lessonHref(course.slug, lesson.slug),
            course: course.title,
          };
          const found = examplesIn(lesson, spec.name, link);
          examples.push(...found);
          const teaches = (lesson.commands ?? []).some((command) => isAbout(command, spec.name));
          if (teaches || found.length > 0) lessons.push(link);
        }
      }
      return {
        name: spec.name,
        summary: spec.summary,
        usage: spec.usage,
        options: spec.flags.map(formatFlag),
        info,
        examples: examples.slice(0, MAX_EXAMPLES),
        lessons,
      };
    });
    return CATEGORIES.flatMap((category) =>
      commands.filter((command) => command.info.category === category),
    );
  })();
  return reference;
}

export async function loadCommand(name: string): Promise<CommandReference | undefined> {
  return (await loadCommandReference()).find((command) => command.name === name);
}
