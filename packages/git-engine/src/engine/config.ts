import { type GitAuthor } from "@gitdojo/shared-types";
import { hasErrorCode } from "../filesystem/fs-errors";
import { ensureDirectory } from "../filesystem/fs-helpers";
import { type GitContext } from "./context";
import { DEFAULT_AUTHOR, DEFAULT_BRANCH } from "./git-engine";

/**
 * The learner's "home directory": `~/.gitconfig` lives here, outside every workspace, so
 * `git config --global` is shared by all lessons in this browser, as it is on a real machine.
 * No learner-supplied path can reach it: workspace paths are confined to `/gitdojo/<id>`.
 */
export const HOME_DIR = "/gitdojo-home";
const GLOBAL_CONFIG = `${HOME_DIR}/.gitconfig`;

export type ConfigScope = "global" | "local";

export interface ConfigEntry {
  /** `user.name`, `remote.origin.url`: section and name lowercased, subsection as written. */
  key: string;
  value: string;
  scope: ConfigScope;
}

export function configPath(ctx: GitContext, scope: ConfigScope): string {
  return scope === "global" ? GLOBAL_CONFIG : `${ctx.dir}/.git/config`;
}

async function readText(ctx: GitContext, path: string): Promise<string> {
  try {
    const raw = await ctx.fs.promises.readFile(path, { encoding: "utf8" });
    return typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return "";
    throw error;
  }
}

interface ParsedKey {
  section: string;
  subsection: string | null;
  name: string;
}

const NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

/** Splits `section[.subsection].name`, or says why Git would refuse the key. */
export function parseConfigKey(
  key: string,
): { ok: true; key: ParsedKey } | { ok: false; message: string } {
  const first = key.indexOf(".");
  const last = key.lastIndexOf(".");
  if (first <= 0 || last === key.length - 1) {
    return { ok: false, message: `error: key does not contain a section: ${key}` };
  }
  const section = key.slice(0, first);
  const name = key.slice(last + 1);
  const subsection = first === last ? null : key.slice(first + 1, last);
  if (!NAME.test(section) || !NAME.test(name) || subsection?.includes("\n")) {
    return { ok: false, message: `error: invalid key: ${key}` };
  }
  return {
    ok: true,
    key: { section: section.toLowerCase(), subsection, name: name.toLowerCase() },
  };
}

function formatKey({ section, subsection, name }: ParsedKey): string {
  return subsection === null ? `${section}.${name}` : `${section}.${subsection}.${name}`;
}

const SECTION_LINE = /^\s*\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]\s*$/;
const VALUE_LINE = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/;

/** Git's value syntax: optional quotes, `\"` / `\\` / `\n` / `\t` escapes, `#` or `;` comments. */
function parseValue(raw: string | undefined): string {
  if (raw === undefined) return "true";
  let value = "";
  // Whitespace outside quotes is dropped at either end; inside quotes it is kept.
  let kept = 0;
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? "";
    if (char === "\\") {
      const next = raw[index + 1] ?? "";
      value += next === "n" ? "\n" : next === "t" ? "\t" : next;
      kept = value.length;
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "#" || char === ";")) {
      break;
    } else if (!quoted && /\s/.test(char)) {
      if (value.length > 0) value += char;
    } else {
      value += char;
      kept = value.length;
    }
  }
  return value.slice(0, kept);
}

function formatValue(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
  return /^\s|\s$|[#;]/.test(value) || escaped !== value ? `"${escaped}"` : value;
}

interface Line {
  text: string;
  /** The section this line belongs to (or opens). */
  section: { name: string; subsection: string | null } | null;
  /** Set on `name = value` lines. */
  entry?: { name: string; value: string };
}

function parseLines(text: string): Line[] {
  let section: Line["section"] = null;
  return text.split("\n").map((raw) => {
    const header = SECTION_LINE.exec(raw);
    if (header) {
      const [, fullName = "", quoted] = header;
      // `[remote.origin]` is the old spelling of `[remote "origin"]`.
      const dot = fullName.indexOf(".");
      section =
        quoted !== undefined
          ? { name: fullName.toLowerCase(), subsection: quoted.replace(/\\(.)/g, "$1") }
          : dot === -1
            ? { name: fullName.toLowerCase(), subsection: null }
            : { name: fullName.slice(0, dot).toLowerCase(), subsection: fullName.slice(dot + 1) };
      return { text: raw, section };
    }
    const value = section && !/^\s*[#;]/.test(raw) ? VALUE_LINE.exec(raw) : null;
    if (value) {
      const [, name = "", rawValue] = value;
      return {
        text: raw,
        section,
        entry: { name: name.toLowerCase(), value: parseValue(rawValue) },
      };
    }
    return { text: raw, section };
  });
}

function lastIndex<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (test(items[index] as T)) return index;
  }
  return -1;
}

function sameSection(line: Line, key: ParsedKey): boolean {
  return line.section?.name === key.section && line.section.subsection === key.subsection;
}

/** Every `key=value` in one file, in file order. */
export async function readConfigEntries(
  ctx: GitContext,
  scope: ConfigScope,
): Promise<ConfigEntry[]> {
  return parseLines(await readText(ctx, configPath(ctx, scope))).flatMap((line) =>
    line.entry && line.section
      ? [
          {
            key: formatKey({
              section: line.section.name,
              subsection: line.section.subsection,
              name: line.entry.name,
            }),
            value: line.entry.value,
            scope,
          },
        ]
      : [],
  );
}

/** The last value for `key` in one file (Git's "last one wins"), or `null`. */
export async function readConfigValue(
  ctx: GitContext,
  scope: ConfigScope,
  key: ParsedKey,
): Promise<string | null> {
  const lines = parseLines(await readText(ctx, configPath(ctx, scope)));
  const matches = lines.filter((line) => sameSection(line, key) && line.entry?.name === key.name);
  return matches.at(-1)?.entry?.value ?? null;
}

/**
 * Sets (or with `value: null`, removes) `key` in one file. Edits only the lines involved, so
 * everything else, such as the remotes isomorphic-git reads, is kept exactly as it was.
 * Returns `false` when there was nothing to remove (`--unset` of a missing key).
 */
export async function writeConfigValue(
  ctx: GitContext,
  scope: ConfigScope,
  key: ParsedKey,
  value: string | null,
): Promise<boolean> {
  const path = configPath(ctx, scope);
  const lines = parseLines(await readText(ctx, path));
  const matching = (line: Line) => sameSection(line, key) && line.entry?.name === key.name;
  const existing = lines.filter(matching);

  let next: string[];
  if (value === null) {
    if (existing.length === 0) return false;
    next = lines.filter((line) => !matching(line)).map((line) => line.text);
  } else {
    const entryLine = `\t${key.name} = ${formatValue(value)}`;
    const last = lastIndex(lines, matching);
    if (last !== -1) {
      // Replace the value that wins; drop any earlier duplicates so one value remains.
      next = lines.flatMap((line, index) =>
        index === last ? [entryLine] : matching(line) ? [] : [line.text],
      );
    } else {
      // After the section's last setting (or its header), before any blank lines that follow.
      const sectionEnd = lastIndex(
        lines,
        (line) =>
          sameSection(line, key) && (line.entry !== undefined || SECTION_LINE.test(line.text)),
      );
      const texts = lines.map((line) => line.text);
      if (sectionEnd !== -1) {
        next = [...texts.slice(0, sectionEnd + 1), entryLine, ...texts.slice(sectionEnd + 1)];
      } else {
        const header =
          key.subsection === null
            ? `[${key.section}]`
            : `[${key.section} "${key.subsection.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`;
        while (texts.length > 0 && texts.at(-1) === "") texts.pop();
        next = [...texts, header, entryLine];
      }
    }
  }
  const text = next.join("\n").replace(/\n*$/, "\n");
  if (scope === "global") await ensureDirectory(ctx.fs.promises, HOME_DIR);
  await ctx.fs.promises.writeFile(path, text === "\n" ? "" : text, "utf8");
  return true;
}

function key(text: string): ParsedKey {
  const parsed = parseConfigKey(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.key;
}

/** The repository's value, else the global one (local wins, as in Git). */
export async function effectiveConfigValue(ctx: GitContext, text: string): Promise<string | null> {
  const parsed = key(text);
  return (
    (await readConfigValue(ctx, "local", parsed).catch(() => null)) ??
    (await readConfigValue(ctx, "global", parsed))
  );
}

/** Who the learner's commits, tags and reflog entries are by: `user.name` / `user.email`. */
export async function learnerIdentity(ctx: GitContext): Promise<GitAuthor> {
  const [name, email] = await Promise.all([
    effectiveConfigValue(ctx, "user.name"),
    effectiveConfigValue(ctx, "user.email"),
  ]);
  return {
    name: name?.trim() || DEFAULT_AUTHOR.name,
    email: email?.trim() || DEFAULT_AUTHOR.email,
  };
}

/** `init.defaultBranch`, when it names a usable branch; GitDojo's `main` otherwise. */
export async function configuredDefaultBranch(
  ctx: GitContext,
  isValid: (name: string) => boolean,
): Promise<string> {
  const value = (await readConfigValue(ctx, "global", key("init.defaultBranch")))?.trim();
  return value && isValid(value) ? value : DEFAULT_BRANCH;
}
