import { type GitContext } from "../engine/context";
import {
  parseConfigKey,
  readConfigEntries,
  readConfigValue,
  writeConfigValue,
  type ConfigScope,
} from "../engine/config";
import { failure, gitError, success } from "../engine/errors";
import { type GitConfigOptions, type GitConfigResult } from "../engine/git-engine";
import { isRepository } from "../engine/repository";

export const CONFIG_USAGE = [
  "usage: git config [--global | --local] <name> [<value>]",
  "   or: git config [--global | --local] --get <name>",
  "   or: git config [--global | --local] --unset <name>",
  "   or: git config [--global | --local] --list",
].join("\n");

const NOT_IN_REPOSITORY = "fatal: not in a git directory";

/** Settings Git writes into every commit as `Name <email>`. */
const IDENTITY_KEYS = new Set(["user.name", "user.email"]);

/**
 * `git config`: read, set, unset and list settings in the repository's `.git/config` or the
 * learner's global `~/.gitconfig`. Like Git, a lookup with no value prints nothing and fails.
 */
export async function runConfig(
  ctx: GitContext,
  { action, key: text, value, scope }: GitConfigOptions,
): Promise<GitConfigResult> {
  const inRepository = await isRepository(ctx);

  if (action === "list") {
    if (scope === "local" && !inRepository) {
      return failure(gitError("NOT_A_REPOSITORY", NOT_IN_REPOSITORY));
    }
    const scopes: ConfigScope[] =
      scope !== undefined ? [scope] : inRepository ? ["global", "local"] : ["global"];
    const entries = (await Promise.all(scopes.map((s) => readConfigEntries(ctx, s)))).flat();
    return success(entries.map((entry) => `${entry.key}=${entry.value}`).join("\n"), { entries });
  }

  if (text === undefined || text === "") {
    return failure(gitError("INVALID_ARGUMENT", CONFIG_USAGE));
  }
  const parsed = parseConfigKey(text);
  if (!parsed.ok) return failure(gitError("INVALID_ARGUMENT", parsed.message));
  const key = parsed.key;
  const shown = key.subsection === null ? `${key.section}.${key.name}` : text;

  if (action === "get") {
    const scopes: ConfigScope[] =
      scope !== undefined ? [scope] : inRepository ? ["local", "global"] : ["global"];
    if (scope === "local" && !inRepository) {
      return failure(gitError("NOT_A_REPOSITORY", NOT_IN_REPOSITORY));
    }
    for (const s of scopes) {
      const found = await readConfigValue(ctx, s, key);
      if (found !== null) {
        return success(found, { entries: [{ key: shown, value: found, scope: s }] });
      }
    }
    // Git prints nothing and exits with status 1.
    return failure(gitError("CONFIG_NOT_SET", `${shown} is not set`), "");
  }

  // Writing: without --global, Git writes the repository's own config.
  const target: ConfigScope = scope ?? "local";
  if (target === "local" && !inRepository) {
    return failure(gitError("NOT_A_REPOSITORY", NOT_IN_REPOSITORY));
  }

  if (action === "unset") {
    const removed = await writeConfigValue(ctx, target, key, null);
    // Git exits with status 5, silently.
    if (!removed) return failure(gitError("CONFIG_NOT_SET", `${shown} is not set`), "");
    return success("", { entries: [] });
  }

  if (value === undefined) return failure(gitError("INVALID_ARGUMENT", CONFIG_USAGE));
  if (IDENTITY_KEYS.has(shown) && /[<>\n]/.test(value)) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        `fatal: ${shown} cannot contain '<', '>' or a line break\nhint: Git writes it into every commit as "Name <email>".`,
      ),
    );
  }
  if (IDENTITY_KEYS.has(shown) && value.trim() === "") {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        `fatal: empty ident ${shown === "user.name" ? "name" : "email"} not allowed`,
      ),
    );
  }
  await writeConfigValue(ctx, target, key, value);
  return success("", { entries: [{ key: shown, value, scope: target }] });
}
