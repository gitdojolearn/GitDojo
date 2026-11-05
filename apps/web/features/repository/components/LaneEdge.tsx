"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";
import { COMMIT_ROW_HEIGHT } from "../services/build-commit-graph";
import { laneEdgePath } from "../services/lanes";

/**
 * Parent link drawn along the lanes (see `laneEdgePath`). A link the latest command created
 * draws itself in, from the new commit towards its parent; a merge's second link follows just
 * after, so both parents of a merge visibly join.
 */
export function LaneEdge({ id, sourceX, sourceY, targetX, targetY, style, data }: EdgeProps) {
  const path = laneEdgePath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    COMMIT_ROW_HEIGHT,
    data?.bend === "child" ? "child" : "parent",
  );
  if (data?.fresh !== true) return <BaseEdge id={id} path={path} style={style} />;
  return (
    <path
      id={id}
      d={path}
      fill="none"
      pathLength={1}
      className="react-flow__edge-path animate-gd-draw"
      data-testid="fresh-edge"
      style={{
        ...style,
        strokeDasharray: 1,
        animationDelay: `${String(typeof data.delay === "number" ? data.delay : 0)}ms`,
      }}
    />
  );
}
