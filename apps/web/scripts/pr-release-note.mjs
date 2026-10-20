import {
  parseLearnerHighlights,
  ReleaseNotesError,
  stripHtmlComments,
} from "./release-highlights.mjs";

const HEADING = /^#{2,3}[ \t]+Learner-facing release note[ \t]*:?[ \t]*$/im;
const NEXT_HEADING = /^#{1,6}[ \t]+/m;
const NO_CHANGE = /^(?:[-*+]\s*)?(?:none|no learner-facing change)\.?$/i;

/** Read the same PR section that draft release generation uses. An empty list means internal work. */
export function parsePullRequestReleaseNote(body) {
  const text = stripHtmlComments(String(body ?? "")).replace(/\r\n?/g, "\n");
  const heading = HEADING.exec(text);
  if (!heading) {
    throw new Error('Add a "## Learner-facing release note" section to the PR description.');
  }

  const start = heading.index + heading[0].length;
  const next = NEXT_HEADING.exec(text.slice(start));
  const section = text.slice(start, next ? start + next.index : undefined).trim();
  if (NO_CHANGE.test(section)) return [];
  if (section !== "" && !/^[-*+][ \t]+/m.test(section)) {
    throw new Error('Use only plain-language bullets, or write "No learner-facing change."');
  }

  try {
    const { intro, highlights } = parseLearnerHighlights(
      `## Highlights for learners\n\n${section}`,
    );
    if (intro !== null) {
      throw new Error('Use only plain-language bullets, or write "No learner-facing change."');
    }
    return highlights;
  } catch (error) {
    if (error instanceof ReleaseNotesError) {
      throw new Error(
        `Fix the "Learner-facing release note" section:\n${error.problems.map((problem) => `- ${problem}`).join("\n")}`,
      );
    }
    throw error;
  }
}
