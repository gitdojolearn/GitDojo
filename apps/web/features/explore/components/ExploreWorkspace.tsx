"use client";

import { Badge, Button, cn, Panel, PanelHeader } from "@gitdojo/ui";
import { FolderGit2, FolderOpen, GitBranch, History, ShieldCheck } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { RepositoryGraphPanel, useRepositoryStore } from "@/features/repository";
import { useOpenRepository } from "../hooks/use-explore";
import { canPickDirectory } from "../services/folder-tree";
import { useExploreStore } from "../state/use-explore-store";
import { CommitInspector } from "./CommitInspector";
import { Timeline } from "./Timeline";

const subscribeNothing = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/** Opens a folder: the browser's folder picker where there is one, a directory input elsewhere. */
function OpenButton({
  children,
  variant = "primary",
}: {
  children: string;
  variant?: "primary" | "secondary";
}) {
  const { openPicked, openFiles } = useOpenRepository();
  const picker = useSyncExternalStore(subscribeNothing, canPickDirectory, () => false);
  const hydrated = useSyncExternalStore(subscribeNothing, onClient, onServer);
  const input = useRef<HTMLInputElement>(null);
  const loading = useExploreStore((state) => state.status === "loading");

  return (
    <>
      <Button
        variant={variant}
        size="lg"
        disabled={loading}
        onClick={() => {
          if (picker) void openPicked();
          else input.current?.click();
        }}
        data-testid="explore-open"
      >
        <FolderOpen aria-hidden="true" />
        {children}
      </Button>
      {/* Only once interactive: before hydration a picked folder would have no handler. */}
      {hydrated ? (
        <input
          ref={input}
          type="file"
          multiple
          hidden
          // Not in React's types: lets the learner pick a folder in every browser.
          {...{ webkitdirectory: "" }}
          data-testid="explore-folder-input"
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            void openFiles(files);
          }}
        />
      ) : null}
    </>
  );
}

function Intro() {
  const status = useExploreStore((state) => state.status);
  const error = useExploreStore((state) => state.error);
  return (
    <div className="mx-auto max-w-2xl py-10 text-center sm:py-16">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border-strong bg-elevated text-accent">
        <History aria-hidden="true" className="size-6" />
      </span>
      <h1 className="mt-5 text-h2 font-semibold tracking-tight text-fg sm:text-h1">
        See what really happened in your repository
      </h1>
      <p className="mt-3 text-body-lg text-fg-secondary">
        Open a project from your computer. GitDojo draws its branches and commits, replays what was
        done in it from the reflog (every commit, switch, merge, reset and rebase), and explains
        each commit in plain words with its exact changes.
      </p>
      <div className="mt-8 flex justify-center">
        <OpenButton>{status === "loading" ? "Reading history…" : "Open a repository"}</OpenButton>
      </div>
      {error ? (
        <p
          role="alert"
          className="mx-auto mt-4 max-w-lg rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-small text-fg"
        >
          {error}
        </p>
      ) : null}
      <div className="mx-auto mt-10 max-w-lg space-y-3 text-left text-small text-fg-secondary">
        <p className="flex gap-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            <strong className="font-semibold text-fg">Read in place, never uploaded.</strong> The
            repository is read by your browser only. Nothing is copied, saved or sent anywhere, and
            GitDojo cannot change it: every write is refused.
          </span>
        </p>
        <p className="flex gap-2">
          <FolderGit2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <span>
            Pick the project folder, the one you ran <code className="gd-code">git init</code> or{" "}
            <code className="gd-code">git clone</code> in. Only its{" "}
            <code className="gd-code">.git</code> folder is read. In Firefox and Safari the browser
            lists every file first, which can take a moment in large projects.
          </span>
        </p>
      </div>
    </div>
  );
}

type SideTab = "timeline" | "commit";

function Explorer() {
  const repository = useExploreStore((state) => state.repository);
  const timeline = useExploreStore((state) => state.timeline);
  const error = useExploreStore((state) => state.error);
  const loading = useExploreStore((state) => state.status === "loading");
  const selectedOid = useRepositoryStore((state) => state.selectedCommit);
  const selectCommit = useRepositoryStore((state) => state.selectCommit);
  const [tab, setTab] = useState<SideTab>("timeline");
  // Selecting a commit (in the graph or the timeline) opens it beside the graph.
  const [shownOid, setShownOid] = useState(selectedOid);
  if (selectedOid !== shownOid) {
    setShownOid(selectedOid);
    if (selectedOid !== null) setTab("commit");
  }

  if (!repository) return null;
  const { state, truncated } = repository;
  const selected = state.allCommits.find((commit) => commit.oid === selectedOid);

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-7rem)]">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex min-w-0 items-center gap-2 text-h3 font-semibold text-fg">
          <FolderGit2 aria-hidden="true" className="size-5 shrink-0 text-accent" />
          <span className="truncate" data-testid="explore-name">
            {repository.name}
          </span>
        </h1>
        {state.currentBranch ? (
          <Badge tone="branch" mono>
            <GitBranch aria-hidden="true" />
            {state.currentBranch}
          </Badge>
        ) : null}
        <Badge tone="neutral">
          {truncated
            ? `newest ${String(state.allCommits.length)} commits`
            : `${String(state.allCommits.length)} commits`}
        </Badge>
        <Badge tone="neutral">
          {state.branches.length} branch{state.branches.length === 1 ? "" : "es"}
        </Badge>
        <div className="ml-auto">
          <OpenButton variant="secondary">
            {loading ? "Reading history…" : "Open another"}
          </OpenButton>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-small text-fg"
        >
          {error}
        </p>
      ) : null}
      {truncated ? (
        <p className="text-caption text-fg-muted">
          Showing the newest {state.allCommits.length} commits across all branches. Older history is
          still in your repository; it is left out to keep the graph quick.
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <RepositoryGraphPanel
          className="h-[60vh] lg:h-auto"
          description="Scroll to travel back in time. Click a commit to see what it did."
          details={false}
          scrollable
        />
        <Panel aria-label="History" className="flex min-h-[60vh] flex-col lg:min-h-0">
          <PanelHeader>
            <div role="tablist" aria-label="History views" className="flex gap-1">
              {(
                [
                  ["timeline", "Timeline"],
                  ["commit", "Commit"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-small font-medium transition-colors",
                    tab === id ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </PanelHeader>
          {/* Both views stay mounted, so going back to the timeline keeps its scroll position. */}
          <div
            role="tabpanel"
            aria-label="Timeline"
            hidden={tab !== "timeline"}
            className="min-h-0 flex-1 overflow-y-auto p-3"
          >
            <Timeline
              events={timeline}
              selectedOid={selectedOid}
              onSelect={(oid) => {
                selectCommit(oid);
                setTab("commit");
              }}
            />
          </div>
          <div
            role="tabpanel"
            aria-label="Commit"
            hidden={tab !== "commit"}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {selected ? (
              <CommitInspector
                commit={selected}
                state={state}
                truncated={truncated}
                onClose={() => {
                  selectCommit(null);
                  setTab("timeline");
                }}
              />
            ) : (
              <p className="text-small text-fg-muted">
                Click a commit in the graph, or a step in the timeline, to see what it did.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/**
 * The repository explorer: a real repository from the learner's computer, as a graph, a timeline
 * of what was done in it, and each commit explained.
 */
export function ExploreWorkspace() {
  const hasRepository = useExploreStore((state) => state.repository !== null);
  return hasRepository ? <Explorer /> : <Intro />;
}
