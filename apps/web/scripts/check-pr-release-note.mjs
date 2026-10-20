import { readFile } from "node:fs/promises";
import { parsePullRequestReleaseNote } from "./pr-release-note.mjs";

if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
  console.log("PR release note check is not needed for this event.");
} else {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is missing.");
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest) throw new Error("The pull_request event payload is missing.");

  if (pullRequest.user?.type === "Bot") {
    console.log("Bot PR: no learner-facing release note is required.");
  } else {
    const highlights = parsePullRequestReleaseNote(pullRequest.body);
    console.log(
      highlights.length === 0
        ? "PR declares no learner-facing change."
        : `PR has ${String(highlights.length)} valid learner-facing release note(s).`,
    );
  }
}
