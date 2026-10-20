import Image from "next/image";
import { type CSSProperties } from "react";
import mark from "@/public/brand/gitdojo-mark.png";
import { SplashController } from "./splash-controller";
import "./splash.css";

/*
 * The first-visit intro: a commit appears, a branch grows and merges, and the graph resolves into
 * the GitDojo mark before the hero is revealed. Everything is drawn here, on the server, in the
 * mark's own 512-unit space, so each commit can travel exactly onto one of the mark's nodes.
 * Timing lives in splash.css; SplashController only handles skipping and cleanup.
 */

/** The mark's own colors, so the commits hand over to its nodes without a color jump. */
const BLUE = "#4f8ef7";
const ORANGE = "#f59e3b";

interface Node {
  x: number;
  y: number;
  color: "blue" | "orange" | "purple";
  /** When it pops in (ms). */
  at: number;
  /** Where it travels when the graph resolves into the mark, and how it scales. */
  to: { x: number; y: number; scale: number };
  /** The mark has nowhere for this one: it fades out as it travels. */
  dissolve?: boolean;
}

const RADIUS = 13;

const NODES: Node[] = [
  // The first commit on main, then the one the branch starts from.
  { x: 36, y: 300, color: "blue", at: 120, to: { x: 183, y: 300, scale: 2.3 } },
  { x: 156, y: 300, color: "blue", at: 420, to: { x: 235, y: 180, scale: 2.3 } },
  // Two commits on the branch.
  { x: 236, y: 196, color: "orange", at: 700, to: { x: 320, y: 150, scale: 1 }, dissolve: true },
  { x: 336, y: 196, color: "orange", at: 900, to: { x: 405, y: 120, scale: 2.45 } },
  // The merge commit gathers into the middle of the mark.
  {
    x: 456,
    y: 300,
    color: "purple",
    at: 1160,
    to: { x: 256, y: 256, scale: 0.5 },
    dissolve: true,
  },
];

const LINES = [
  { d: "M36 300 H156", tone: "main", at: 220, length: 260 },
  { d: "M156 300 C196 300 200 196 236 196", tone: "branch", at: 480, length: 280 },
  { d: "M156 300 H456", tone: "main", at: 520, length: 560 },
  { d: "M236 196 H336", tone: "branch", at: 740, length: 220 },
  { d: "M336 196 C372 196 416 300 456 300", tone: "branch", at: 940, length: 260 },
] as const;

const FILL = { blue: BLUE, orange: ORANGE, purple: "var(--purple)" };

function vars(values: Record<string, string | number>): CSSProperties {
  return values;
}

function Graph() {
  return (
    <svg className="gd-splash-graph" viewBox="0 0 512 512" fill="none">
      <defs>
        {(["blue", "orange", "purple"] as const).map((color) => (
          <radialGradient key={color} id={`gd-splash-halo-${color}`}>
            <stop offset="0" stopColor={FILL[color]} stopOpacity="0.55" />
            <stop offset="1" stopColor={FILL[color]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <g className="gd-splash-lines" strokeWidth="6" strokeLinecap="round">
        {LINES.map((line) => (
          <path
            key={line.d}
            d={line.d}
            pathLength={1}
            stroke={line.tone === "main" ? BLUE : ORANGE}
            strokeOpacity={line.tone === "main" ? 0.6 : 0.9}
            className="gd-splash-line"
            style={vars({ "--at": `${String(line.at)}ms`, "--len": `${String(line.length)}ms` })}
          />
        ))}
      </g>
      <circle
        className="gd-splash-flash"
        cx="456"
        cy="300"
        r="24"
        stroke="var(--purple)"
        strokeWidth="3"
      />
      {NODES.map((node) => (
        <g
          key={`${String(node.x)}-${String(node.y)}`}
          className="gd-splash-node"
          data-dissolve={node.dissolve ? "" : undefined}
          style={vars({
            "--dx": `${String(node.to.x - node.x)}px`,
            "--dy": `${String(node.to.y - node.y)}px`,
            "--s": node.to.scale,
            "--at": `${String(node.at)}ms`,
          })}
        >
          <g className="gd-splash-pop">
            <circle
              className="gd-splash-halo"
              cx={node.x}
              cy={node.y}
              r={RADIUS * 3}
              fill={`url(#gd-splash-halo-${node.color})`}
            />
            <circle cx={node.x} cy={node.y} r={RADIUS} fill={FILL[node.color]} />
          </g>
        </g>
      ))}
    </svg>
  );
}

export function Splash() {
  return (
    <SplashController>
      <div className="gd-splash-light" aria-hidden="true" />
      <div className="gd-splash-scene" aria-hidden="true">
        <div className="gd-splash-stage">
          <div className="gd-splash-floor" />
          {/* Lazy: hidden (display: none) for everyone but first-time visitors, who fetch it at
              first paint, well before the graph resolves into it. */}
          <Image
            src={mark}
            alt=""
            loading="lazy"
            sizes="(min-width: 640px) 240px, 58vw"
            className="gd-splash-mark"
          />
          <Graph />
        </div>
        <p className="gd-splash-word">
          Git<span>Dojo</span>
        </p>
        <p className="gd-splash-tagline">Learn it. Break it. Fix it. Master it.</p>
      </div>
    </SplashController>
  );
}
