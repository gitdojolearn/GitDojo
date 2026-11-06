import { BUILTIN_PROGRAMS, GIT_COMMAND_SPECS } from "../commands";
import { type FlagSpec, type GitCommandSpec } from "../types";

export function helpText(): string {
  const rows = [
    ...Object.values(GIT_COMMAND_SPECS).map((spec) => [spec.usage, spec.summary] as const),
    ...Object.entries(BUILTIN_PROGRAMS),
  ];
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 3;
  return [
    "GitDojo terminal - available commands:",
    "",
    ...rows.map(([usage, summary]) => `  ${usage.padEnd(width)}${summary}`),
    "",
    "Everything runs in a safe sandbox inside your browser.",
  ].join("\n");
}

/** `-m, --message <value>`: every way to type a flag. */
function flagForms(flag: FlagSpec): string {
  const forms = [flag.name, ...(flag.aliases ?? [])]
    .map((name) => (name.length === 1 ? `-${name}` : `--${name}`))
    .join(", ");
  return flag.takesValue ? `${forms} <value>` : forms;
}

/** `git <command> -h`: the command's usage, what it does and the options GitDojo understands. */
export function commandHelpText(spec: GitCommandSpec): string {
  const options = spec.flags.map((flag) => `    ${flagForms(flag)}`);
  return [
    `usage: ${spec.usage}`,
    "",
    spec.summary,
    ...(options.length > 0 ? ["", "Options:", ...options] : []),
  ].join("\n");
}
