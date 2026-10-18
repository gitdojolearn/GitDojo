import { Badge, Button } from "@gitdojo/ui";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  Boxes,
  CircleHelp,
  Code,
  Flag,
  LayoutDashboard,
  Lightbulb,
  Network,
  RotateCcw,
  ShieldCheck,
  SquareTerminal,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { GitHubIcon } from "@/components/site/github-icon";
import { SITE } from "@/lib/site";
import { StartLearningLink } from "./start-learning";

/** A course as the landing page lists it: real content, read at build time. */
export interface LandingCourse {
  slug: string;
  title: string;
  description: string;
  lessons: number;
}

function Section({
  id,
  labelledBy,
  children,
  className,
}: {
  id?: string;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`mx-auto max-w-[1280px] scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24 ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function SectionIntro({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-small font-semibold tracking-wider text-accent uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-h2 font-[650] tracking-tight text-fg">
        {title}
      </h2>
      <p className="mt-3 text-body-lg text-fg-secondary">{children}</p>
    </div>
  );
}

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BookOpen,
    title: "Pick a course",
    body: "Start with Git Basics or jump to a topic. Each lesson explains one idea in a few minutes.",
  },
  {
    icon: SquareTerminal,
    title: "Type real commands",
    body: "Each hands-on lesson gives you a repository and objectives. They tick off when the repository reaches the right state, however you get there.",
  },
  {
    icon: Target,
    title: "Practice on your own",
    body: "Challenges and Practice tasks describe a goal with no step-by-step instructions, so you work it out.",
  },
  {
    icon: LayoutDashboard,
    title: "Track your progress",
    body: "Your dashboard shows where to continue and which skills you have practiced. No account needed; sign in to sync across devices.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-heading">
      <SectionIntro id="how-heading" eyebrow="How it works" title="Learn a concept, then use it">
        GitDojo is a set of short, hands-on lessons that run entirely in your browser.
      </SectionIntro>
      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-lg border border-border bg-panel p-5">
            <div className="flex items-center gap-2 text-fg-muted">
              <Icon className="size-[18px]" aria-hidden="true" />
              <span className="font-mono text-caption">0{index + 1}</span>
            </div>
            <h3 className="mt-3 text-h4 font-semibold text-fg">{title}</h3>
            <p className="mt-1 text-small text-fg-secondary">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function CoursesSection({
  courses,
  challenges,
  practiceTasks,
}: {
  courses: LandingCourse[];
  challenges: number;
  practiceTasks: number;
}) {
  const lessons = courses.reduce((sum, course) => sum + course.lessons, 0);
  return (
    <Section id="courses" labelledBy="courses-heading">
      <SectionIntro
        id="courses-heading"
        eyebrow="What you can learn"
        title="From first commit to recovering lost work"
      >
        {courses.length} courses and {lessons} lessons, in order, from what Git is to working with a
        remote.
      </SectionIntro>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {courses.map((course, index) => (
          <li key={course.slug}>
            <Link
              href={`/learn/${course.slug}`}
              className="group flex h-full flex-col rounded-lg border border-border bg-panel p-5 transition-[border-color,transform] duration-150 ease-out hover:border-border-strong motion-safe:hover:-translate-y-0.5"
            >
              <span className="font-mono text-caption text-fg-muted">
                {String(index + 1).padStart(2, "0")} · {course.lessons} lessons
              </span>
              <span className="mt-2 text-body font-semibold text-fg group-hover:underline">
                {course.title}
              </span>
              <span className="mt-1 text-small text-fg-secondary">{course.description}</span>
            </Link>
          </li>
        ))}
        <li>
          <div className="flex h-full flex-col justify-between gap-4 rounded-lg border border-dashed border-border-strong p-5">
            <p className="text-small text-fg-secondary">Then put it to work:</p>
            <ul className="space-y-2 text-small">
              <li>
                <Link
                  href="/challenges"
                  className="inline-flex items-center gap-2 text-fg hover:underline"
                >
                  <Flag className="size-4 text-fg-muted" aria-hidden="true" />
                  {challenges} real-world challenges
                </Link>
              </li>
              <li>
                <Link
                  href="/practice"
                  className="inline-flex items-center gap-2 text-fg hover:underline"
                >
                  <Target className="size-4 text-fg-muted" aria-hidden="true" />
                  {practiceTasks} Practice tasks
                </Link>
              </li>
              <li>
                <Link
                  href="/playground"
                  className="inline-flex items-center gap-2 text-fg hover:underline"
                >
                  <Boxes className="size-4 text-fg-muted" aria-hidden="true" />A free playground
                </Link>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </Section>
  );
}

const SANDBOX: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: SquareTerminal,
    title: "A real Git engine in a terminal",
    body: "Commands run against an actual repository in your browser, with Git's own output. There is no server shell and nothing to install.",
  },
  {
    icon: Network,
    title: "See what each command does",
    body: "Files move between the working tree, staging area and history, and the commit graph redraws with every branch and merge.",
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
  {
    icon: RotateCcw,
    title: "Break it, then reset",
    body: "Lose a commit or end up in detached HEAD on purpose. Every lesson can start over, and nothing touches a real project.",
  },
];

export function SandboxSection({ scenarios }: { scenarios: string[] }) {
  return (
    <Section id="sandbox" labelledBy="sandbox-heading">
      <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
        <div>
          <SectionIntro
            id="sandbox-heading"
            eyebrow="The practice sandbox"
            title="Break things safely"
          >
            Everything runs in a sandboxed repository inside your browser, so mistakes cost nothing.
          </SectionIntro>
          <p className="mt-6 flex items-start gap-2 text-small text-fg-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            Remotes are simulated in your browser too: fetch, pull and push work against a practice
            &ldquo;origin&rdquo;, and nothing reaches the network.
          </p>
          {scenarios.length > 0 ? (
            <div className="mt-6">
              <p className="text-small text-fg-secondary">
                In the{" "}
                <Link href="/playground" className="text-accent underline">
                  playground
                </Link>
                , load a ready-made situation:
              </p>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Playground scenarios">
                {scenarios.map((title) => (
                  <li key={title}>
                    <Badge>{title}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SANDBOX.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-lg border border-border bg-panel p-5">
              <Icon className="size-[18px] text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-body font-semibold text-fg">{title}</h3>
              <p className="mt-1 text-small text-fg-secondary">{body}</p>
            </li>
          ))}
        </ul>
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
      <div className="grid gap-10 rounded-xl border border-accent-border bg-surface p-6 sm:p-10 lg:grid-cols-[3fr_2fr] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-small font-semibold tracking-wider text-accent uppercase">
            <Award className="size-4" aria-hidden="true" /> Certification track
          </p>
          <h2 id="certification-heading" className="mt-2 text-h2 font-[650] tracking-tight text-fg">
            Earn the {title} completion certificate
          </h2>
          <p className="mt-3 text-body-lg text-fg-secondary">
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
              verification page shows, without an account, whether it is valid or revoked right now.
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
    </Section>
  );
}

export function FinalCta({ firstLessonHref }: { firstLessonHref: string }) {
  return (
    <Section labelledBy="final-heading" className="text-center">
      <h2 id="final-heading" className="text-h2 font-[650] tracking-tight text-fg sm:text-h1">
        Your first commit is a few minutes away.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-body-lg text-fg-secondary">
        No install and no account needed. Your progress is saved in this browser; sign in when you
        want it on every device.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <StartLearningLink firstLessonHref={firstLessonHref} />
        <Button asChild variant="secondary" size="hero">
          <Link href="/playground">Open the playground</Link>
        </Button>
      </div>
    </Section>
  );
}

export function OpenSourceSection() {
  return (
    <Section labelledBy="open-source-heading">
      <div className="flex flex-col items-start justify-between gap-6 border-t border-border-subtle pt-16 lg:flex-row lg:items-center">
        <div>
          <h2 id="open-source-heading" className="text-h2 font-[650] text-fg">
            Built in the open.
          </h2>
          <p className="mt-3 max-w-xl text-body-lg text-fg-secondary">
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
    </Section>
  );
}
