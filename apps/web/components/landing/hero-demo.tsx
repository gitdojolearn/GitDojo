import { Badge, cn } from "@gitdojo/ui";
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  FileText,
  FolderOpen,
  GitBranch,
  Inbox,
  Layers,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { type DemoArea, DemoPlayer, type DemoState, type DemoStep } from "./demo-player";

/*
 * The hero's demonstration: the first-commit flow in a terminal, with the working tree, staging
 * area and repository as they are after each command. Everything is rendered here, on the
 * server; DemoPlayer only plays it back. (Rendering the icons and badges in the browser would
 * share modules with the lesson workspace, and Turbopack then merges the Git engine's chunk into
 * the landing page.)
 */

const SHA = "1f9d220";

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.92em] text-fg">{children}</code>;
}

/** A line the terminal prints, colored as GitDojo's terminal colors Git's output. */
function Out({ children, tone }: { children: string; tone?: "danger" | "muted" }) {
  return (
    <p
      className={cn(
        "whitespace-pre-wrap",
        tone === "danger" ? "text-danger" : tone === "muted" ? "text-fg-muted" : "",
      )}
    >
      {children}
    </p>
  );
}

/**
 * The first-commit flow, with the output GitDojo's engine prints for it (status is abridged:
 * Git's "(use …)" hint lines are left out). The playground starts from the same folder, so a
 * visitor can run exactly these commands there.
 */
const STEPS: DemoStep[] = [
  {
    name: "init",
    command: "git init",
    output: <Out>Initialized empty Git repository in ~/project/.git/</Out>,
    caption: (
      <>
        <Code>git init</Code> creates the repository. Git can see <Code>README.md</Code> but
        isn&apos;t tracking it yet.
      </>
    ),
  },
  {
    name: "status",
    command: "git status",
    output: (
      <>
        <Out>On branch main</Out>
        <Out>No commits yet</Out>
        <Out tone="muted">Untracked files:</Out>
        <Out tone="danger">{"        README.md"}</Out>
      </>
    ),
    caption: (
      <>
        <Code>git status</Code> only reads. It reports <Code>README.md</Code> as untracked and
        changes nothing.
      </>
    ),
  },
  {
    name: "add",
    command: "git add README.md",
    output: null,
    caption: (
      <>
        <Code>git add</Code> copies <Code>README.md</Code> into the staging area: it will be in the
        next commit.
      </>
    ),
  },
  {
    name: "commit",
    command: 'git commit -m "Initial commit"',
    output: (
      <>
        <Out>{`[main (root-commit) ${SHA}] Initial commit`}</Out>
        <Out>{" 1 file changed"}</Out>
        <Out>{" create mode 100644 README.md"}</Out>
      </>
    ),
    caption: (
      <>
        <Code>git commit</Code> saves what&apos;s staged as a snapshot. <Code>main</Code> now points
        at it, and <Code>HEAD</Code> points at <Code>main</Code>.
      </>
    ),
  },
];

const INTRO = (
  <>
    A folder with one file, <Code>README.md</Code>. It isn&apos;t a Git repository yet.
  </>
);

function FileChip({ status }: { status: "plain" | "untracked" | "staged" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 sm:flex-col sm:flex-nowrap sm:items-start sm:gap-1.5",
        status === "staged" ? "animate-gd-move-in" : "animate-gd-enter",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-caption text-fg">
        <FileText className="size-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
        <span className="truncate">README.md</span>
      </span>
      {status === "untracked" ? (
        <Badge>
          <CircleDashed aria-hidden="true" /> Untracked
        </Badge>
      ) : status === "staged" ? (
        <Badge tone="success">
          <CircleCheck aria-hidden="true" /> Staged
        </Badge>
      ) : null}
    </div>
  );
}

function Empty({ icon: Icon, children }: { icon: typeof Inbox; children: ReactNode }) {
  return (
    <p className="flex animate-gd-enter items-center gap-1.5 text-caption text-fg-muted">
      <Icon className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
      {children}
    </p>
  );
}

const COMMIT = (
  <div className="flex min-w-0 animate-gd-pop flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:block">
    <p className="flex items-center gap-1.5 text-caption">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full bg-accent ring-2 ring-accent-soft"
      />
      <span className="sr-only">Commit </span>
      <span className="font-mono text-fg-secondary">{SHA}</span>
    </p>
    <p className="flex flex-wrap items-center gap-1 sm:mt-1.5">
      <Badge className="border-accent-strong bg-accent-strong text-on-accent">HEAD</Badge>
      <ArrowRight className="size-3 text-accent" aria-label="points to" />
      <Badge tone="branch" mono>
        <GitBranch aria-hidden="true" />
        main
      </Badge>
    </p>
  </div>
);

const PANELS = {
  plain: { id: "plain", content: <FileChip status="plain" /> },
  untracked: { id: "untracked", content: <FileChip status="untracked" /> },
  staged: { id: "staged", content: <FileChip status="staged" /> },
  clean: { id: "clean", content: <Empty icon={CircleCheck}>No changes</Empty> },
  nothingStaged: { id: "nothing-staged", content: <Empty icon={Inbox}>Nothing staged</Empty> },
  noRepository: { id: "no-repository", content: <Empty icon={CircleDashed}>No .git yet</Empty> },
  noCommits: { id: "no-commits", content: <Empty icon={CircleDashed}>No commits yet</Empty> },
  commit: { id: "commit", content: COMMIT },
};

/** The areas before any command, and after each one. */
const STATES: DemoState[] = [
  {
    panels: {
      working: PANELS.plain,
      staging: PANELS.nothingStaged,
      repository: PANELS.noRepository,
    },
  },
  {
    panels: {
      working: PANELS.untracked,
      staging: PANELS.nothingStaged,
      repository: PANELS.noCommits,
    },
    changed: "repository",
  },
  {
    panels: {
      working: PANELS.untracked,
      staging: PANELS.nothingStaged,
      repository: PANELS.noCommits,
    },
  },
  {
    panels: { working: PANELS.clean, staging: PANELS.staged, repository: PANELS.noCommits },
    changed: "staging",
  },
  {
    panels: { working: PANELS.clean, staging: PANELS.nothingStaged, repository: PANELS.commit },
    changed: "repository",
  },
];

function AreaTitle({ icon: Icon, children }: { icon: typeof Inbox; children: string }) {
  return (
    <>
      <Icon aria-hidden="true" />
      <span className="truncate">{children}</span>
    </>
  );
}

const AREAS: Record<DemoArea, { label: string; title: ReactNode }> = {
  working: { label: "Working tree", title: <AreaTitle icon={FolderOpen}>Working tree</AreaTitle> },
  staging: { label: "Staging area", title: <AreaTitle icon={Layers}>Staging area</AreaTitle> },
  repository: { label: "Repository", title: <AreaTitle icon={GitBranch}>Repository</AreaTitle> },
};

export function HeroDemo() {
  return (
    <DemoPlayer
      title="Your first commit"
      action={
        <Link
          href="/playground"
          className="group inline-flex shrink-0 items-center gap-1 rounded-sm text-caption font-medium text-accent hover:underline"
        >
          Try it in the playground
          <ArrowRight
            className="size-3.5 transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      }
      steps={STEPS}
      intro={INTRO}
      states={STATES}
      areas={AREAS}
      icons={{
        arrow: <ArrowRight />,
        play: <Play aria-hidden="true" />,
        pause: <Pause aria-hidden="true" />,
        replay: <RotateCcw aria-hidden="true" />,
      }}
    />
  );
}
