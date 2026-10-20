import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parsePullRequestReleaseNote } from "./pr-release-note.mjs";
import { parseLearnerHighlights } from "./release-highlights.mjs";

const [changelogPath, outputPath] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;

if (!changelogPath || !outputPath || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error(
    "Usage: GITHUB_REPOSITORY=owner/repo node compose-release-notes.mjs <generated-changelog> <output>",
  );
  process.exit(2);
}

const changelog = (await readFile(changelogPath, "utf8")).trim();
// Notes for PRs merged before the required PR check existed. New PRs must supply their own note.
const legacyNotes = JSON.parse(await readFile(".github/legacy-pr-release-notes.json", "utf8"));
const pullRequestNumbers = [
  ...new Set(
    [...changelog.matchAll(/\bin\s+#(\d+)\b|\/pull\/(\d+)\b/g)].map(
      (match) => match[1] ?? match[2],
    ),
  ),
];

if (pullRequestNumbers.length === 0) {
  throw new Error("GitHub generated no pull request links; cannot collect learner release notes.");
}

const highlights = [];
const missingNotes = [];
for (const number of pullRequestNumbers) {
  const raw = execFileSync("gh", ["api", `repos/${repository}/pulls/${number}`], {
    encoding: "utf8",
  });
  const pullRequest = JSON.parse(raw);
  if (pullRequest.merged_at === null || pullRequest.base?.ref !== "main") continue;
  if (pullRequest.user?.type === "Bot") continue;

  try {
    highlights.push(...parsePullRequestReleaseNote(pullRequest.body));
  } catch (error) {
    const fallback = legacyNotes[number];
    if (
      error.message.startsWith('Add a "## Learner-facing release note" section') &&
      typeof fallback === "string"
    ) {
      highlights.push(
        ...parsePullRequestReleaseNote(`## Learner-facing release note\n\n${fallback}`),
      );
    } else {
      missingNotes.push(`#${number} ${pullRequest.title}: ${error.message}`);
    }
  }
}

if (missingNotes.length > 0) {
  throw new Error(
    `Add a “Learner-facing release note” section to these merged PRs, with one plain-language bullet or “No learner-facing change.”:\n${missingNotes.map((note) => `  - ${note}`).join("\n")}`,
  );
}

const uniqueHighlights = [...new Set(highlights)];
const finalHighlights =
  uniqueHighlights.length > 0
    ? uniqueHighlights
    : ["This release focuses on behind-the-scenes improvements to GitDojo."];

const template = await readFile(".github/release-highlights-template.md", "utf8");
if (!template.includes("{{HIGHLIGHTS}}")) {
  throw new Error("The release highlights template is missing the {{HIGHLIGHTS}} placeholder.");
}

const learnerSection = template
  .replace("{{HIGHLIGHTS}}", finalHighlights.map((item) => `- ${item}`).join("\n"))
  .trim();
const notes = `${learnerSection}\n\n${changelog}\n`;

// Keep the release draft aligned with the same checks used before production is deployed.
parseLearnerHighlights(notes);
await writeFile(outputPath, notes, "utf8");
console.log(
  `Collected ${finalHighlights.length} learner highlight(s) from ${pullRequestNumbers.length} merged PR(s).`,
);
