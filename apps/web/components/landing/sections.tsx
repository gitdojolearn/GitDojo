import { Badge, Button, cn } from "@gitdojo/ui";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Boxes,
  CircleHelp,
  Code,
  Flag,
  LayoutDashboard,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  SquareTerminal,
  Target,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { GitHubIcon } from "@/components/site/github-icon";
import { LogoMark } from "@/components/site/logo";
import { SITE } from "@/lib/site";
import { StartLearningLink } from "./start-learning";

/** A course as the landing page lists it: real content, read at build time. */
export interface LandingCourse {
  slug: string;
  title: string;
  description: string;
  lessons: number;
}

/**
 * One section of the page. `band` sets it on the secondary surface, edge to edge, so the page
 * alternates between open sections and banded ones instead of stacking identical blocks.
 */
function Section({
  id,
  labelledBy,
  band = false,
  children,
  className,
}: {
  id?: string;
  labelledBy: string;
  band?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-20", band && "border-y border-border-subtle bg-surface")}
    >
      <div className={cn("mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24", className)}>
        {children}
      </div>
    </section>
  );
}

/** Section label: a numbered, monospace eyebrow, like a step in a script. */
function Eyebrow({ index, children }: { index: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-caption text-fg-muted">
      <span className="text-accent">{index}</span>
      <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
      {children}
    </p>
  );
}

function SectionIntro({
  id,
  index,
  eyebrow,
  title,
  children,
  className,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <Eyebrow index={index}>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="mt-4 text-[26px] leading-[34px] font-[650] tracking-[-0.02em] text-balance text-fg sm:text-h2"
      >
        {title}
      </h2>
      {children ? (
        <p className="mt-4 text-body-lg text-pretty text-fg-secondary">{children}</p>
      ) : null}
    </div>
  );
}

const STEPS: { verb: string; title: string; body: string }[] = [
  {
    verb: "learn",
    title: "One idea at a time",
    body: "Each lesson explains a single concept in a few minutes, with the commands that go with it.",
  },
  {
    verb: "type",
    title: "Run real commands",
    body: "You get a repository and objectives. They tick off when the repository reaches the right state, however you get there.",
  },
  {
    verb: "visualize",
    title: "See what changed",
    body: "Files move between the working tree, staging area and history, and the commit graph redraws after every command.",
  },
  {
    verb: "fix",
    title: "Break it, then recover",
    body: "Challenges and Practice tasks set a goal with no step-by-step instructions, so you work it out.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-heading">
      <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
        <SectionIntro
          id="how-heading"
          index="01"
          eyebrow="How it works"
          title="Every command changes the repository. GitDojo shows you how."
        />
        <p className="max-w-xl text-body-lg text-pretty text-fg-secondary lg:pb-1">
          Short, hands-on lessons that run entirely in your browser. Read the idea, type the
          command, watch the repository respond, then use it without help.
        </p>
      </div>
      {/* The four steps sit on a line like commits on a branch. */}
      <ol className="relative mt-12 grid gap-10 sm:mt-16 lg:grid-cols-4 lg:gap-8">
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[7px] w-px bg-border lg:top-[7px] lg:right-0 lg:bottom-auto lg:left-2 lg:h-px lg:w-auto"
        />
        {STEPS.map(({ verb, title, body }, index) => (
          <li key={verb} className="relative pl-9 lg:pt-10 lg:pl-0">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1 left-0 size-[15px] rounded-full border-2 lg:top-0",
                index === STEPS.length - 1
                  ? "border-accent bg-accent ring-4 ring-accent-soft"
                  : "border-accent bg-app",
              )}
            />
            <p className="font-mono text-small text-accent">
              <span className="text-fg-muted">{String(index + 1).padStart(2, "0")} </span>
              {verb}
            </p>
            <h3 className="mt-2 text-h4 font-semibold text-fg">{title}</h3>
            <p className="mt-2 max-w-sm text-small text-fg-secondary">{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-12 flex items-start gap-2 text-small text-fg-muted sm:items-center">
        <LayoutDashboard className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden="true" />
        <span>
          Your{" "}
          <Link href="/dashboard" className="text-fg-secondary underline hover:text-fg">
            dashboard
          </Link>{" "}
          shows where to continue. No account needed; sign in to sync across devices.
        </span>
      </p>
    </Section>
  );
}

export function CoursesSection({ courses }: { courses: LandingCourse[] }) {
  const lessons = courses.reduce((sum, course) => sum + course.lessons, 0);
  return (
    <Section id="courses" labelledBy="courses-heading" band>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionIntro
            id="courses-heading"
            index="02"
            eyebrow="What you can learn"
            title="From first commit to recovering lost work"
          >
            {courses.length} courses and {lessons} lessons, in order, from what Git is to working
            with a remote.
          </SectionIntro>
          <Button asChild variant="secondary" size="lg" className="mt-8">
            <Link href="/learn">
              Browse all courses <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {/* A syllabus rather than a grid of cards: one row per course, in learning order. */}
        <ol className="grid border-t border-border sm:grid-cols-2 sm:gap-x-8">
          {courses.map((course, index) => (
            <li key={course.slug} className="border-b border-border">
              <Link
                href={`/learn/${course.slug}`}
                className="group -mx-2 flex h-full gap-4 rounded-md px-2 py-5 transition-colors duration-150 ease-out hover:bg-hover"
              >
                <span className="font-mono text-small text-fg-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-body font-semibold text-fg group-hover:underline">
                      {course.title}
                    </span>
                    <span className="font-mono text-caption text-fg-muted">
                      {course.lessons} lessons
                    </span>
                  </span>
                  <span className="mt-1 block text-small text-fg-secondary">
                    {course.description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/** A small, static commit graph: main, a feature branch and the merge that joins them. */
function GraphIllustration() {
  const main = "var(--text-muted)";
  const feature = "var(--accent-secondary)";
  return (
    <div className="rounded-lg border border-border bg-panel p-4 sm:p-5">
      <svg
        viewBox="0 0 340 120"
        className="h-auto w-full"
        role="img"
        aria-labelledby="graph-illustration-title"
      >
        <title id="graph-illustration-title">
          A commit graph: a feature branch splits from main and is merged back, with HEAD on main.
        </title>
        <g fill="none" strokeWidth="2" strokeLinecap="round">
          <path d="M20 40 H292" stroke={main} />
          <path d="M84 40 C108 40 108 92 132 92 H220 C244 92 264 40 292 40" stroke={feature} />
        </g>
        {[20, 84, 172].map((x) => (
          <circle
            key={x}
            cx={x}
            cy="40"
            r="6"
            fill="var(--bg-panel)"
            stroke={main}
            strokeWidth="2"
          />
        ))}
        {[132, 196].map((x) => (
          <circle
            key={x}
            cx={x}
            cy="92"
            r="6"
            fill="var(--bg-panel)"
            stroke={feature}
            strokeWidth="2"
          />
        ))}
        <circle cx="292" cy="40" r="11" fill="var(--accent-soft)" />
        <circle cx="292" cy="40" r="6.5" fill="var(--purple)" />
        <text x="196" y="114" textAnchor="middle" className="fill-branch font-mono text-[10px]">
          feature
        </text>
      </svg>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-3 text-caption text-fg-muted">
        <Badge className="border-accent-strong bg-accent-strong text-on-accent">HEAD</Badge>
        <ArrowRight className="size-3 text-accent" aria-label="points to" />
        <Badge tone="branch" mono>
          main
        </Badge>
        <span className="ml-1">Merge branch &apos;feature&apos;</span>
      </p>
    </div>
  );
}

const VISIBLE: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: SquareTerminal,
    title: "A real Git engine in a terminal",
    body: "Commands run against an actual repository in your browser, with Git's own output. There is no server shell and nothing to install.",
  },
  {
    icon: Waypoints,
    title: "The graph redraws as you go",
    body: "Branches, merges, rebases and HEAD update after every command, so you see what Git did rather than guess.",
  },
  {
    icon: Code,
    title: "A code editor beside it",
    body: "Edit files, resolve merge conflicts by hand, and watch Git notice the changes.",
  },
  {
    icon: Lightbulb,
    title: "Hints when you're stuck",
    body: "Hints start with the idea and only reach the exact command if you ask for it.",
  },
  {
    icon: CircleHelp,
    title: "“Why did this happen?”",
    body: "When a command fails, GitDojo explains the error in plain words, using your own files and branches.",
  },
];

const CONCEPTS = ["Working tree", "Staging area", "Commits", "Branches", "HEAD"];

export function VisualizeSection() {
  return (
    <Section id="visualize" labelledBy="visualize-heading">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionIntro
            id="visualize-heading"
            index="03"
            eyebrow="See inside Git"
            title="Git makes more sense when you can see it."
          >
            GitDojo makes the invisible parts of Git visible.
          </SectionIntro>
          <ul aria-label="What you can see" className="mt-6 flex flex-wrap gap-2">
            {CONCEPTS.map((concept) => (
              <li
                key={concept}
                className="rounded-sm border border-border-strong bg-elevated px-2 py-0.5 font-mono text-caption text-fg-secondary"
              >
                {concept}
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <GraphIllustration />
          </div>
        </div>
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {VISIBLE.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 py-5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel">
                <Icon className="size-4 text-accent" aria-hidden="true" />
              </span>
              <span>
                <h3 className="text-body font-semibold text-fg">{title}</h3>
                <p className="mt-1 text-small text-fg-secondary">{body}</p>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

const MISHAPS = [
  "Merge the wrong branch.",
  "Lose a commit.",
  "Enter detached HEAD.",
  "Create a conflict.",
];

function PracticeLink({
  href,
  icon: Icon,
  count,
  label,
  children,
}: {
  href: string;
  icon: LucideIcon;
  count?: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-lg border border-border bg-panel p-5 transition-colors duration-150 ease-out hover:border-border-strong hover:bg-hover"
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {count !== undefined ? (
            <span className="font-mono text-h4 font-semibold text-fg tabular-nums">{count}</span>
          ) : null}
          <span className="text-body font-semibold text-fg group-hover:underline">{label}</span>
        </span>
        <span className="mt-1 block text-small text-fg-secondary">{children}</span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-fg-faint transition-transform duration-150 ease-out group-hover:text-fg motion-safe:group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function BreakSection({
  challenges,
  practiceTasks,
  scenarios,
}: {
  challenges: number;
  practiceTasks: number;
  scenarios: string[];
}) {
  return (
    <Section id="sandbox" labelledBy="sandbox-heading" band>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <Eyebrow index="04">Real Git challenges</Eyebrow>
          <h2
            id="sandbox-heading"
            className="mt-4 text-[32px] leading-[40px] font-bold tracking-[-0.03em] text-fg sm:text-h1"
          >
            Break things safely.
          </h2>
          <ul className="mt-6 space-y-1 font-mono text-body text-fg-secondary">
            {MISHAPS.map((mishap) => (
              <li key={mishap} className="flex gap-3">
                <span aria-hidden="true" className="text-danger">
                  ✗
                </span>
                {mishap}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-3 font-mono text-body text-fg">
            <span aria-hidden="true" className="text-success">
              ✓
            </span>
            Then learn how to recover.
          </p>
          <div className="mt-10 space-y-4 border-t border-border pt-6 text-small text-fg-muted">
            <p className="flex items-start gap-2">
              <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Every lesson and challenge can start over, and nothing touches a real project.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Remotes are simulated in your browser too: fetch, pull and push work against a
              practice &ldquo;origin&rdquo;, and nothing reaches the network.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <PracticeLink
            href="/challenges"
            icon={Flag}
            count={challenges}
            label="real-world challenges"
          >
            A broken repository and a goal, like recovering a lost commit or untangling a bad merge.
            No step-by-step instructions.
          </PracticeLink>
          <PracticeLink
            href="/practice"
            icon={Target}
            count={practiceTasks}
            label={practiceTasks === 1 ? "Practice task" : "Practice tasks"}
          >
            One skill each, with no objectives and no hints: reach the end state the mission
            describes.
          </PracticeLink>
          <PracticeLink href="/playground" icon={Boxes} label="The playground">
            No lesson and no objectives: a sandbox to try anything.
            {scenarios.length > 0 ? " Start empty or load a ready-made situation." : null}
          </PracticeLink>
          {scenarios.length > 0 ? (
            <ul aria-label="Playground scenarios" className="flex flex-wrap gap-2 pt-2 pl-1">
              {scenarios.map((title) => (
                <li key={title}>
                  <Badge>{title}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

export function CertificationSection({
  title,
  lessons,
  practiceTasks,
  criteriaVersion,
}: {
  title: string;
  lessons: number;
  practiceTasks: number;
  criteriaVersion: number;
}) {
  return (
    <Section id="certification" labelledBy="certification-heading">
      <div className="relative overflow-hidden rounded-xl border border-accent-border bg-surface">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-32 size-96 bg-[radial-gradient(circle,var(--accent-glow),transparent_70%)]"
        />
        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[3fr_2fr] lg:items-center">
          <div>
            <Eyebrow index="05">
              <span className="inline-flex items-center gap-1.5">
                <Award className="size-3.5" aria-hidden="true" /> Certification track
              </span>
            </Eyebrow>
            <h2
              id="certification-heading"
              className="mt-4 text-[26px] leading-[34px] font-[650] tracking-[-0.02em] text-balance text-fg sm:text-h2"
            >
              Earn the {title} completion certificate
            </h2>
            <p className="mt-4 text-body-lg text-fg-secondary">
              Complete {lessons} lessons and {practiceTasks} Practice{" "}
              {practiceTasks === 1 ? "task" : "tasks"} with a free account, and GitDojo issues a
              certificate with a PDF, a signed Open Badge and a public verification page.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href="/certification">
                  See the requirements <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
          <ul className="space-y-4 text-small text-fg-secondary">
            <li className="flex gap-3">
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-fg">Checkable by anyone.</strong> Its
                verification page shows, without an account, whether it is valid or revoked right
                now.
              </span>
            </li>
            <li className="flex gap-3">
              <Award className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-fg">A completion certificate.</strong> It
                records that you completed the course work in GitDojo; it is not a graded exam or an
                industry certification. Criteria version {criteriaVersion}.
              </span>
            </li>
            <li className="flex gap-3">
              <Target className="mt-0.5 size-5 shrink-0 text-fg-muted" aria-hidden="true" />
              <span>
                Want your Git history graded? The separate{" "}
                <Link href="/assessment" className="text-accent underline">
                  Git capstone
                </Link>{" "}
                is checked on the server.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function OpenSourceSection() {
  return (
    <section aria-labelledby="open-source-heading" className="border-t border-border-subtle">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
        <div>
          <h2 id="open-source-heading" className="text-h3 font-semibold text-fg">
            Built in the open.
          </h2>
          <p className="mt-2 max-w-xl text-body text-fg-secondary">
            GitDojo is MIT licensed. Contribute lessons, challenges, features, docs and fixes:
            lessons are plain YAML files.
          </p>
        </div>
        <Button asChild variant="secondary" size="lg">
          <a href={SITE.githubUrl}>
            <GitHubIcon /> View on GitHub
          </a>
        </Button>
      </div>
    </section>
  );
}

export function FinalCta({ firstLessonHref }: { firstLessonHref: string }) {
  return (
    <section
      aria-labelledby="final-heading"
      className="relative overflow-hidden border-t border-border-subtle"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-40 h-120 bg-[radial-gradient(ellipse_at_center,var(--accent-glow),transparent_65%)]"
      />
      <div className="relative mx-auto max-w-[1280px] px-4 py-20 text-center sm:px-6 sm:py-28">
        <LogoMark className="mx-auto size-12" />
        <h2
          id="final-heading"
          className="mt-6 text-[32px] leading-[40px] font-bold tracking-[-0.03em] text-balance text-fg sm:text-h1"
        >
          Your first commit is a few minutes away.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-body-lg text-pretty text-fg-secondary">
          No install and no account needed. Your progress is saved in this browser; sign in when you
          want it on every device.
        </p>
        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <StartLearningLink firstLessonHref={firstLessonHref} />
          <Button asChild variant="secondary" size="hero">
            <Link href="/playground">Open the playground</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
