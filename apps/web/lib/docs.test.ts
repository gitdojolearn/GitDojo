import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DOCS, loadDoc, renderMarkdown, resolveDocLink, slugify } from "./docs";

vi.mock("server-only", () => ({}));

describe("docs", () => {
  it("lists only files that exist, under unique slugs", async () => {
    const root = path.join(process.cwd(), "..", "..");
    await Promise.all(DOCS.map((doc) => access(path.join(root, doc.file))));
    expect(new Set(DOCS.map((doc) => doc.slug)).size).toBe(DOCS.length);
  });

  it("makes GitHub's heading anchors, so existing #links keep working", () => {
    expect(slugify("Adaptive hints")).toBe("adaptive-hints");
    expect(slugify("56. MICROINTERACTIONS")).toBe("56-microinteractions");
    expect(slugify("`git push --force`")).toBe("git-push---force");
  });

  it("keeps links between docs on the site and sends other repository files to GitHub", () => {
    expect(resolveDocLink("./assessment.md", "docs/architecture.md")).toBe("/docs/assessment");
    expect(resolveDocLink("lesson-authoring.md#adaptive-hints", "docs/validators.md")).toBe(
      "/docs/lesson-authoring#adaptive-hints",
    );
    expect(resolveDocLink("../docs/testing.md", ".github/CONTRIBUTING.md")).toBe("/docs/testing");
    expect(resolveDocLink("../apps/web/proxy.ts", "docs/security.md")).toBe(
      "https://github.com/gitdojolearn/GitDojo/blob/main/apps/web/proxy.ts",
    );
    expect(resolveDocLink("https://example.com", "docs/ci.md")).toBe("https://example.com");
    expect(resolveDocLink("#checks", "docs/ci.md")).toBe("#checks");
  });

  it("renders headings with ids, a contents list, and scrollable tables", () => {
    const { html, headings, heading } = renderMarkdown(
      "# Title\n\n## Setup\n\n### Setup\n\n| a | b |\n| - | - |\n| 1 | 2 |\n",
      "docs/x.md",
    );
    expect(heading).toBe("Title");
    expect(headings).toEqual([
      { id: "setup", text: "Setup", depth: 2 },
      { id: "setup-1", text: "Setup", depth: 3 },
    ]);
    expect(html).toContain('<h2 id="setup">');
    expect(html).toMatch(
      /<div class="gd-table" tabindex="0" role="region" aria-label="Table"><table>/,
    );
  });

  it("renders every listed doc", async () => {
    const docs = await Promise.all(DOCS.map((doc) => loadDoc(doc.slug) ?? Promise.resolve(null)));
    for (const doc of docs) expect(doc?.html.length).toBeGreaterThan(100);
  });
});
