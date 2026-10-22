import {
  BUILTIN_PROGRAMS,
  GIT_COMMAND_SPECS,
  isSupportedGitCommand,
} from "@gitdojo/command-parser";
import { type RepositoryState } from "@gitdojo/shared-types";
import { type LineState } from "./line-editor";

export interface TerminalCompletionContext {
  branches: string[];
  commits: string[];
  files: string[];
  remotes: string[];
  stashes: string[];
  tags: string[];
}

export interface CompletionRange {
  start: number;
  end: number;
  prefix: string;
}

export function completionContextFromRepository(
  repository: RepositoryState,
): TerminalCompletionContext {
  return {
    branches: [
      ...repository.branches.map(({ name }) => name),
      ...repository.remoteBranches.map(({ name }) => name),
    ],
    commits: [...new Set(repository.allCommits.map(({ shortOid }) => shortOid))],
    files: repository.files.map(({ path }) => path),
    remotes: repository.remotes.map(({ name }) => name),
    stashes: repository.stashes.map(({ selector }) => selector),
    tags: repository.tags.map(({ name }) => name),
  };
}

/** Returns the word under the cursor, unless it is inside a quoted value. */
export function completionRange(line: string, cursor: number): CompletionRange | null {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of line.slice(0, cursor)) {
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (quote === character) {
      quote = null;
    } else if (quote === null && (character === "'" || character === '"')) {
      quote = character;
    }
  }
  if (quote !== null) return null;

  let start = cursor;
  while (start > 0 && !/\s/.test(line[start - 1] ?? "")) start -= 1;
  let end = cursor;
  while (end < line.length && !/\s/.test(line[end] ?? "")) end += 1;
  return { start, end, prefix: line.slice(start, cursor) };
}

function pathCandidates(files: readonly string[]): string[] {
  const paths = new Set<string>();
  for (const path of files) {
    paths.add(path);
    let slash = path.indexOf("/");
    while (slash !== -1) {
      paths.add(path.slice(0, slash + 1));
      slash = path.indexOf("/", slash + 1);
    }
  }
  return [...paths];
}

function flagCandidates(command: string): string[] {
  if (!isSupportedGitCommand(command)) return [];
  const spec = GIT_COMMAND_SPECS[command];
  const flags = new Set<string>();
  for (const flag of spec.flags) {
    flags.add(flag.name.length === 1 ? `-${flag.name}` : `--${flag.name}`);
    for (const alias of "aliases" in flag ? flag.aliases : []) {
      flags.add(alias.length === 1 ? `-${alias}` : `--${alias}`);
    }
  }
  return [...flags];
}

function argumentCandidates(
  command: string,
  args: readonly string[],
  context: TerminalCompletionContext,
): string[] {
  if (command === "restore" && args.some((arg) => arg === "--source" || arg === "-s")) {
    return ["HEAD", "HEAD~1", "HEAD~2", ...context.commits, ...context.tags];
  }
  if (command === "reset" && args.includes("--")) {
    return pathCandidates(context.files);
  }
  if (["add", "diff", "restore", "rm", "mv"].includes(command)) {
    return [...pathCandidates(context.files), ...(command === "add" ? ["."] : [])];
  }
  if (command === "branch") {
    return args.some((arg) => arg === "-d" || arg === "-D" || arg === "--delete")
      ? context.branches
      : [];
  }
  if (["switch", "checkout", "merge", "rebase"].includes(command)) {
    if (args.some((arg) => arg === "-c" || arg === "--create" || arg === "-b")) return [];
    if (command === "switch" && args.includes("--detach")) {
      return ["HEAD", "HEAD~1", "HEAD~2", ...context.commits, ...context.tags];
    }
    return context.branches;
  }
  if (["fetch", "pull", "push"].includes(command)) {
    return args.length === 0 ? context.remotes : context.branches;
  }
  if (["show", "log", "reset", "revert", "cherry-pick"].includes(command)) {
    return ["HEAD", "HEAD~1", "HEAD~2", ...context.commits, ...context.tags];
  }
  if (command === "tag") return context.tags;
  if (command === "stash") return context.stashes;
  if (command === "remote") return context.remotes;
  return [];
}

/**
 * Context-aware candidates for the token at the cursor. Suggestions come from the Git command
 * catalog and current virtual repository; this never probes the host filesystem or shell.
 */
export function completionCandidates(
  line: string,
  cursor: number,
  context: TerminalCompletionContext,
): { range: CompletionRange; candidates: string[] } | null {
  const range = completionRange(line, cursor);
  if (!range) return null;

  const beforeToken = line.slice(0, range.start).trim();
  const tokens = beforeToken === "" ? [] : beforeToken.split(/\s+/);
  const current = range.prefix;
  let candidates: string[];

  if (tokens.length === 0) {
    candidates = ["git", ...Object.keys(BUILTIN_PROGRAMS)];
  } else if (tokens.length === 1 && tokens[0] === "git") {
    candidates = Object.keys(GIT_COMMAND_SPECS);
  } else if (tokens[0] !== "git") {
    candidates = [];
  } else {
    const command = tokens[1] ?? "";
    const args = tokens.slice(2);
    if (command === "" || (tokens.length === 1 && range.prefix !== "")) {
      candidates = Object.keys(GIT_COMMAND_SPECS);
    } else if (current.startsWith("-")) {
      candidates = flagCandidates(command);
    } else {
      candidates = argumentCandidates(command, args, context);
    }
  }

  return {
    range,
    candidates: [...new Set(candidates)]
      .filter((candidate) => candidate.startsWith(current))
      .sort(),
  };
}

export function commonCompletionPrefix(candidates: readonly string[]): string {
  if (candidates.length === 0) return "";
  let prefix = candidates[0] ?? "";
  for (const candidate of candidates.slice(1)) {
    while (!candidate.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function replaceCompletion(
  state: LineState,
  range: CompletionRange,
  candidate: string,
  directory = false,
  appendSeparator = true,
): LineState {
  const after = state.buffer.slice(range.end);
  const suffix = directory ? (candidate.endsWith("/") ? "" : "/") : " ";
  const insertSuffix = directory || (appendSeparator && !after.startsWith(" "));
  const replacement = `${candidate}${insertSuffix ? suffix : ""}`;
  const buffer = state.buffer.slice(0, range.start) + replacement + after;
  return { buffer, cursor: range.start + replacement.length };
}

export function formatCompletionList(candidates: readonly string[], cols: number): string[] {
  if (candidates.length === 0) return [];
  const width = Math.max(...candidates.map((candidate) => candidate.length)) + 2;
  const columns = Math.max(1, Math.floor(Math.max(cols, 1) / width));
  const rows: string[] = [];
  for (let index = 0; index < candidates.length; index += columns) {
    const row = candidates.slice(index, index + columns);
    rows.push(
      row
        .map((candidate) => candidate.padEnd(width))
        .join("")
        .trimEnd(),
    );
  }
  return rows;
}
