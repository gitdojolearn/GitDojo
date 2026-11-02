import { DEFAULT_GIT_AUTHOR } from "@gitdojo/shared-types";
import { type ValidatorHandler, type ValidatorOfType } from "../types";

/**
 * A commit (with `message`, if given) is by someone other than GitDojo's default identity, so
 * `user.name` and `user.email` were both set before it was made. The identity lives in the commit
 * itself, so this is checked from history, never from configuration.
 */
export const commitAuthorSet: ValidatorHandler<ValidatorOfType<"commit_author_set">> = (
  { message },
  { repository },
) => {
  const expected = message?.trim();
  const candidates = repository.commits.filter(
    (commit) => expected === undefined || commit.message.trim() === expected,
  );
  if (candidates.length === 0) {
    return Promise.resolve({
      passed: false,
      reason:
        expected === undefined
          ? "There are no commits yet."
          : `No commit has the message "${expected}".`,
    });
  }
  const authored = candidates.find(
    (commit) =>
      commit.authorName !== DEFAULT_GIT_AUTHOR.name &&
      commit.authorEmail !== DEFAULT_GIT_AUTHOR.email,
  );
  if (authored) return Promise.resolve({ passed: true });
  const [newest] = candidates;
  const stillDefault = newest?.authorName === DEFAULT_GIT_AUTHOR.name ? "user.name" : "user.email";
  return Promise.resolve({
    passed: false,
    reason: `The commit is by ${newest?.authorName ?? ""} <${newest?.authorEmail ?? ""}>: ${stillDefault} still has GitDojo's default.`,
  });
};
