"use client";

import "@xyflow/react/dist/style.css";

import { Badge } from "@gitdojo/ui";
import { ReactFlow, type EdgeTypes, type NodeTypes, type ReactFlowInstance } from "@xyflow/react";
import { FolderGit2, GitBranch } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/features/theme";
import {
  buildCommitGraph,
  COMMIT_CARD_WIDTH,
  COMMIT_ROW_HEIGHT,
  type CommitFlowNode,
} from "../services/build-commit-graph";
import { isRecent } from "../services/transitions";
import { useRepositoryStore } from "../state/use-repository-store";
import { CommitDetails } from "./CommitDetails";
import { CommitNode } from "./CommitNode";
import { EmptyState } from "./EmptyState";
import { LaneEdge } from "./LaneEdge";

const nodeTypes = { commit: CommitNode } satisfies NodeTypes;
const edgeTypes = { lane: LaneEdge } satisfies EdgeTypes;
const FIT_VIEW_OPTIONS = { padding: 0.3, maxZoom: 1, minZoom: 0.4 };

function EmptyGraph() {
  const repository = useRepositoryStore((state) => state.repositoryState);
  if (!repository.initialized) {
    return (
      <EmptyState icon={FolderGit2} title="Not a Git repository">
        Run <code className="gd-code">git init</code> to create one.
      </EmptyState>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      {repository.currentBranch ? (
        <Badge tone="branch" mono>
          <GitBranch aria-hidden="true" />
          {repository.currentBranch}
        </Badge>
      ) : null}
      <span
        aria-hidden="true"
        className="size-3.5 rounded-full border-2 border-dashed border-fg-faint"
      />
      <div>
        <p className="text-small font-medium text-fg-secondary">No commits yet</p>
        <p className="mt-1 max-w-60 text-caption text-fg-muted">
          <span className="font-mono">{repository.currentBranch ?? "main"}</span> will point to your
          first commit.
        </p>
      </div>
    </div>
  );
}

/**
 * True while the element is laid out (has a width). On phones the graph lives in a tab hidden with
 * `display: none`; React Flow must not fit its view then, or it frames an empty canvas.
 */
function useHasSize<T extends HTMLElement>() {
  // A callback ref: the canvas only mounts once there are commits to show.
  const [element, setElement] = useState<T | null>(null);
  const [hasSize, setHasSize] = useState(false);
  useEffect(() => {
    if (!element) return;
    const update = () => {
      setHasSize(element.clientWidth > 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return [setElement, hasSize] as const;
}

/** More commits than this, in a scrollable graph, open at the top instead of all fitted in. */
const LONG_HISTORY = 8;
/** Space around a long history's graph, in px. */
const LONG_HISTORY_PADDING = 24;

export interface RepositoryGraphProps {
  /** Show the selected commit's details under the graph. Off when the page shows them itself. */
  details?: boolean;
  /**
   * For long histories (a real repository): frame the newest commits instead of all of them, and
   * scroll through the rest with the wheel or trackpad.
   */
  scrollable?: boolean;
}

/**
 * Vertical commit graph (React Flow) of every branch, with branch and HEAD labels. Clicking a
 * commit shows its details.
 */
export function RepositoryGraph({ details = true, scrollable = false }: RepositoryGraphProps) {
  const repository = useRepositoryStore((state) => state.repositoryState);
  const selectedOid = useRepositoryStore((state) => state.selectedCommit);
  const selectCommit = useRepositoryStore((state) => state.selectCommit);
  const transition = useRepositoryStore((state) => state.transition);
  // Only a command that just ran animates: re-rendering later (selecting a commit remounts the
  // canvas) shows the graph still.
  const graph = useMemo(
    () =>
      buildCommitGraph(repository, selectedOid, isRecent(transition) ? transition : null, {
        compactLanes: scrollable,
      }),
    [repository, selectedOid, transition, scrollable],
  );
  const selected = details
    ? repository.allCommits.find((commit) => commit.oid === selectedOid)
    : undefined;
  // A long history opens at its newest commits, as wide as the panel allows, rather than fitted.
  const long = scrollable && graph.nodes.length > LONG_HISTORY;
  const contentWidth = (graph.nodes[0]?.data.railWidth ?? 0) + COMMIT_CARD_WIDTH;
  const [canvasRef, visible] = useHasSize<HTMLDivElement>();
  const theme = useTheme();
  const flow = useRef<ReactFlowInstance<CommitFlowNode> | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const setCanvas = useCallback(
    (element: HTMLDivElement | null) => {
      canvas.current = element;
      canvasRef(element);
    },
    [canvasRef],
  );

  // In a long history, a commit selected from elsewhere (a timeline) may be off screen: bring it in.
  useEffect(() => {
    const instance = flow.current;
    const element = canvas.current;
    const node = graph.nodes.find((candidate) => candidate.id === selectedOid);
    if (!scrollable || !instance || !element || !node) return;
    const { x, y, zoom } = instance.getViewport();
    const top = node.position.y * zoom + y;
    if (top >= 0 && top + COMMIT_ROW_HEIGHT * zoom <= element.clientHeight) return;
    void instance.setViewport(
      { x, y: element.clientHeight / 3 - node.position.y * zoom, zoom },
      { duration: 300 },
    );
  }, [scrollable, selectedOid, graph.nodes]);

  if (graph.nodes.length === 0) return <EmptyGraph />;

  return (
    <div className="flex h-full flex-col" data-testid="commit-graph">
      <div ref={setCanvas} className="min-h-0 flex-1">
        {visible ? (
          <ReactFlow
            // Re-fit when commits are added or the details pane changes the canvas size;
            // remounting is cheaper than tracking viewport state.
            key={`${String(graph.nodes.length)}:${String(graph.laneCount)}:${selected ? "details" : "full"}`}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flow.current = instance;
              const width = canvas.current?.clientWidth ?? 0;
              if (long && width > 0) {
                const zoom = Math.min(
                  1,
                  Math.max(0.6, width / (contentWidth + 2 * LONG_HISTORY_PADDING)),
                );
                void instance.setViewport({
                  x: LONG_HISTORY_PADDING,
                  y: LONG_HISTORY_PADDING,
                  zoom,
                });
              }
            }}
            onNodeClick={(_event, node) => {
              selectCommit(node.id === selectedOid ? null : node.id);
            }}
            colorMode={theme}
            fitView={!long}
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={0.4}
            maxZoom={1.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            panOnScroll={scrollable}
            preventScrolling={scrollable}
            proOptions={{ hideAttribution: false }}
            aria-label="Commit graph"
          />
        ) : null}
      </div>
      {selected ? (
        <div className="max-h-[60%] shrink-0 overflow-auto border-t border-border-subtle p-3">
          <CommitDetails
            commit={selected}
            onClose={() => {
              selectCommit(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
