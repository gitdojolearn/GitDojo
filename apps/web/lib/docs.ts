import "server-only";

import { Marked, Renderer, type Tokens } from "marked";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SITE } from "./site";

/** The repository root: docs live in `docs/` and the contributing guide in `.github/`. */
const REPO_DIR = path.join(process.cwd(), "..", "..");

export interface DocEntry {
  slug: string;
  title: string;
  category: string;
  /** Path from the repository root. */
  file: string;
  description: string;
}

/**
 * The documentation shown at /docs, in sidebar order. Each page is a Markdown file from the
 * repository, rendered at build time, so the site and GitHub always show the same text.
 */
export const DOCS: readonly DocEntry[] = [
  {
    slug: "contributing",
    title: "Contributing",
    category: "Getting started",
    file: ".github/CONTRIBUTING.md",
    description: "Set up the project, make a change and open a pull request.",
  },
  {
    slug: "architecture",
    title: "Architecture",
    category: "Getting started",
    file: "docs/architecture.md",
    description: "How the packages and the web app fit together.",
  },
  {
    slug: "testing",
    title: "Testing",
    category: "Getting started",
    file: "docs/testing.md",
    description: "Unit, browser, accessibility and performance tests.",
  },
  {
    slug: "lesson-authoring",
    title: "Lesson authoring",
    category: "Writing content",
    file: "docs/lesson-authoring.md",
    description: "Write a lesson in YAML: setup, objectives, hints and reference content.",
  },
  {
    slug: "validators",
    title: "Validators",
    category: "Writing content",
    file: "docs/validators.md",
    description: "Every objective check a lesson can use.",
  },
  {
    slug: "challenge-authoring",
    title: "Challenge authoring",
    category: "Writing content",
    file: "docs/challenge-authoring.md",
    description: "Write a challenge: a goal without step-by-step instructions.",
  },
  {
    slug: "practice-authoring",
    title: "Practice authoring",
    category: "Writing content",
    file: "docs/practice-authoring.md",
    description: "Write a practice task for a single skill.",
  },
  {
    slug: "release-notes",
    title: "Release notes",
    category: "Writing content",
    file: "docs/release-notes.md",
    description: "How learner-facing release notes are written and published.",
  },
  {
    slug: "git-engine",
    title: "Git engine",
    category: "Git engine",
    file: "docs/git-engine.md",
    description: "The in-browser Git implementation behind the terminal.",
  },
  {
    slug: "command-parser",
    title: "Command parser",
    category: "Git engine",
    file: "docs/command-parser.md",
    description: "How terminal input becomes a Git command.",
  },
  {
    slug: "command-coverage",
    title: "Command coverage",
    category: "Git engine",
    file: "docs/command-coverage.md",
    description: "Which Git behavior the sandbox supports, and its limits.",
  },
  {
    slug: "repository-protection",
    title: "Repository protection",
    category: "Git engine",
    file: "docs/repository-protection.md",
    description: "How learners' repositories are kept safe and recoverable.",
  },
  {
    slug: "progress",
    title: "Progress",
    category: "The app",
    file: "docs/progress.md",
    description: "XP, streaks, skills and how progress is stored.",
  },
  {
    slug: "account-progress",
    title: "Account progress",
    category: "The app",
    file: "docs/account-progress.md",
    description: "Syncing progress to an account.",
  },
  {
    slug: "authentication",
    title: "Authentication",
    category: "The app",
    file: "docs/authentication.md",
    description: "Optional sign-in and how sessions work.",
  },
  {
    slug: "certificates",
    title: "Certificates",
    category: "The app",
    file: "docs/certificates.md",
    description: "Certification tracks and verifiable credentials.",
  },
  {
    slug: "assessment",
    title: "Assessment",
    category: "The app",
    file: "docs/assessment.md",
    description: "The placement assessment.",
  },
  {
    slug: "theming",
    title: "Themes",
    category: "The app",
    file: "docs/theming.md",
    description: "Dark, light and system themes, and the design tokens behind them.",
  },
  {
    slug: "ui",
    title: "Design system",
    category: "The app",
    file: "docs/ui.md",
    description: "The visual language: colors, type, components and motion.",
  },
  {
    slug: "deployment",
    title: "Deployment",
    category: "Operations",
    file: "docs/deployment.md",
    description: "Deploy GitDojo and configure its environment.",
  },
  {
    slug: "ci",
    title: "Continuous integration",
    category: "Operations",
    file: "docs/ci.md",
    description: "What runs on every pull request.",
  },
  {
    slug: "security",
    title: "Security",
    category: "Operations",
    file: "docs/security.md",
    description: "Security headers, content security policy and reporting.",
  },
  {
    slug: "rate-limits",
    title: "Rate limits",
    category: "Operations",
    file: "docs/rate-limits.md",
    description: "Limits on the account and certificate APIs.",
  },
];

export interface DocHeading {
  id: string;
  text: string;
  depth: number;
}

export interface RenderedDoc extends DocEntry {
  /** Rendered from the repository's own Markdown at build time. */
  html: string;
  /** h2 and h3, for the "On this page" list. */
  headings: DocHeading[];
  /** The page's own H1, when the file has one (it replaces the entry title on the page). */
  heading: string;
  sourceUrl: string;
}

/** GitHub's anchor for a heading, so links such as `lesson-authoring.md#adaptive-hints` work. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BY_FILE = new Map(DOCS.map((doc) => [doc.file, doc]));

/**
 * Where a link in `file` should go: another rendered doc stays on the site, anything else in the
 * repository opens on GitHub, and external links are left alone.
 */
export function resolveDocLink(href: string, file: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("//")) {
    return href;
  }
  const [target = "", hash] = href.split("#");
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
  const doc = BY_FILE.get(resolved);
  if (doc) return `/docs/${doc.slug}${hash ? `#${hash}` : ""}`;
  return `${SITE.githubUrl}/blob/main/${resolved}${hash ? `#${hash}` : ""}`;
}

export function renderMarkdown(
  source: string,
  file: string,
): Omit<RenderedDoc, keyof DocEntry | "sourceUrl"> {
  const headings: DocHeading[] = [];
  const used = new Map<string, number>();
  let heading = "";
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const plain = token.text.replace(/`/g, "");
        if (token.depth === 1 && !heading) heading = plain;
        const base = slugify(plain);
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${String(count)}`;
        if (token.depth === 2 || token.depth === 3) {
          headings.push({ id, text: plain, depth: token.depth });
        }
        // The "#" is drawn by CSS, so it is never part of the heading's text.
        return `<h${String(token.depth)} id="${id}"><a href="#${id}" class="gd-anchor" aria-hidden="true" tabindex="-1"></a>${inner}</h${String(token.depth)}>\n`;
      },
      link(token: Tokens.Link) {
        const href = resolveDocLink(token.href, file);
        const external = /^https?:/.test(href);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        const rel = external ? ' rel="noreferrer"' : "";
        return `<a href="${escapeHtml(href)}"${title}${rel}>${this.parser.parseInline(token.tokens)}</a>`;
      },
      image(token: Tokens.Image) {
        const src = /^https?:/.test(token.href)
          ? token.href
          : `${SITE.githubUrl}/raw/main/${path.posix.normalize(path.posix.join(path.posix.dirname(file), token.href))}`;
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}" loading="lazy" />`;
      },
      code(token: Tokens.Code) {
        // Focusable, so a wide block can be scrolled from the keyboard.
        const lang = token.lang?.match(/^\S+/)?.[0];
        const className = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        const text = token.escaped ? token.text : escapeHtml(token.text);
        return `<pre tabindex="0"><code${className}>${text}</code></pre>\n`;
      },
      table(token: Tokens.Table) {
        // Wide tables scroll inside the page instead of widening it.
        const html: string = Renderer.prototype.table.call(this, token) as string;
        return `<div class="gd-table" tabindex="0" role="region" aria-label="Table">${html}</div>`;
      },
    },
  });
  // Raw HTML in the docs (README badges, <picture>) is kept as authored: the files are ours.
  const html = marked.parse(source, { async: false });
  return { html, headings, heading };
}

let cache: Map<string, Promise<RenderedDoc>> | null = null;

export function loadDoc(slug: string): Promise<RenderedDoc> | undefined {
  const entry = DOCS.find((doc) => doc.slug === slug);
  if (!entry) return undefined;
  cache ??= new Map();
  let doc = cache.get(slug);
  if (!doc) {
    doc = readFile(path.join(REPO_DIR, entry.file), "utf8").then((source) => ({
      ...entry,
      ...renderMarkdown(source, entry.file),
      sourceUrl: `${SITE.githubUrl}/blob/main/${entry.file}`,
    }));
    cache.set(slug, doc);
  }
  return doc;
}
