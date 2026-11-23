// components/ui/tool-access-map.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Tool Access Map – which tools an agent can reach, and what it did with them, in a single self-contained file.
 *   · the agent sits in the middle as a small card – name, status, model and what it works on – with every tool of the
 *     run around it on both sides, always connected by thin lines
 *   · every tool the agent can use has a blue line; one it has no access to is grayed out, its line gray and dashed.
 *     The tools say how they stand – not used yet, used, failed – and while one is being called, a shimmer runs down its line
 *   · a click on a tool opens every call it got, with input and output – replay one on its own, or change its input first
 *   · tabs on top switch between the agents of the run; the tools stay, the blue runs in again over their lines and the
 *     card's content moves in from below
 * Classic style: a gray tray with the bar on it and a white card for the tabs and the map.
 * Narrow containers put the tools in a grid under the agent. The styles are injected below, so no extra files are needed.
 */

export type ToolCallStatus = "running" | "done" | "failed";

export type ToolCall = {
  id: string;
  status: ToolCallStatus;
  /** What the agent sent – an object is shown as JSON */
  input: unknown;
  /** What came back – an object is shown as JSON */
  output?: unknown;
  /** What went wrong, for a failed call */
  error?: string;
  /** When it was made, in ms from the start of the run */
  at?: number;
  /** How long it took, in ms */
  duration?: number;
  /** A call you replayed from here */
  replay?: boolean;
};

export type AccessTool = {
  id: string;
  name: string;
  /** A small mark before the name – e.g. the tool's logo */
  icon?: ReactNode;
  /** What it does, in a few words – shown in the calls view */
  description?: string;
  /** Every call the agent made to it, oldest first – leave out for a tool it can use but hasn't yet */
  calls?: ToolCall[];
};

/** A tool an agent has access to: its id and calls – name, icon and description come from the run's tools when left out */
export type AgentTool = { id: string; calls?: ToolCall[] } & Partial<Omit<AccessTool, "id" | "calls">>;

export type MapAgentStatus = "queued" | "running" | "waiting" | "done" | "failed";

export type MapAgent = {
  id: string;
  name: string;
  model?: string;
  /** A small mark, e.g. the model maker's logo – defaults to the initials */
  avatar?: ReactNode;
  status: MapAgentStatus;
  /** What it works on right now */
  task?: string;
  /** The tools it has access to – every other tool of the run shows as grayed out, with a dashed line */
  tools: AgentTool[];
};

export type ToolAccessMapProps = {
  agents: MapAgent[];
  /** Every tool of the run, in the order they're laid out – defaults to the tools of all agents together */
  tools?: AccessTool[];
  /** Controlled id of the agent on the map */
  agent?: string;
  defaultAgent?: string;
  onAgentChange?: (id: string) => void;
  /** Replay a call on its own – with its input, or the one you changed it to. Without it, calls can only be read */
  onReplay?: (call: ToolCall, input: unknown, tool: AccessTool, agent: MapAgent) => void;
  /** Formats when a call was made – defaults to 0:42 */
  formatTime?: (ms: number) => string;
  title?: string;
  className?: string;
};

/* ---------- Helpers ---------- */

/** The map's geometry: tool cards, the agent card, and the room around them */
const NODE_W = 130;
const NODE_H = 46;
const GAP = 12;
const AGENT_W = 200;
const PAD_X = 0;
const PAD_Y = 14;
/** The shimmer on a line being called: its three dashes from the same head, as a share of the line, and how strong each is */
const GLINT = [
  [0.28, 0.25],
  [0.16, 0.5],
  [0.07, 1],
] as const;
/** How round the lines' corners are */
const RADIUS = 8;
/** Below this width the lines have no room – the tools go into a grid under the agent */
const NARROW = 540;

const STATUS: Record<MapAgentStatus, string> = { queued: "Queued", running: "Running", waiting: "Needs you", done: "Done", failed: "Failed" };

const pad2 = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};
/** 340ms, 1.2s, 14s, 2m 05s */
const took = (ms: number) => {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const num = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
// Whole letters only – "🔍 Researcher" gives "R", not half an emoji
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ""))[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Input and output as text: strings stay as they are, everything else as indented JSON */
const pretty = (v: unknown) => {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
};
/** One line for the list of calls: { query: "pricing" } → query: "pricing" */
const brief = (v: unknown) => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v)
      .map(([k, x]) => `${k}: ${typeof x === "string" ? JSON.stringify(x) : (JSON.stringify(x) ?? String(x))}`)
      .join(", ");
  }
  return pretty(v).replace(/\s+/g, " ");
};

/** "blocked": the agent has no access to it */
type ToolState = "blocked" | "idle" | "used" | "running" | "failed";
const stateOf = (calls: ToolCall[]): ToolState => {
  if (calls.some((c) => c.status === "running")) return "running";
  const tail = calls[calls.length - 1];
  if (!tail) return "idle";
  return tail.status === "failed" ? "failed" : "used";
};

/** How long the calls view takes to grow out of a tool, and the curve of it */
const MORPH = 340;
const EASE = "cubic-bezier(0.32, 0.72, 0.24, 1)";
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The calls view as big as a tool's card, in its place – where the morph starts and ends. Its real edges move, so
    the card's hairline and shadow stay with it all the way */
const over = (panel: HTMLElement, tool: HTMLElement): Keyframe => {
  // From layout, not from the screen – so a tool still moving in, or the stage still growing, doesn't throw it off
  const stage = panel.offsetParent as HTMLElement | null;
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = tool; n && n !== stage; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  const w = stage?.clientWidth ?? 0;
  const h = stage?.clientHeight ?? 0;
  return { top: `${y}px`, right: `${w - x - tool.offsetWidth}px`, bottom: `${h - y - tool.offsetHeight}px`, left: `${x}px`, borderRadius: "10px" };
};
/** The calls view at its own size – the panel's inset from the CSS */
const FULL: Keyframe = { top: "8px", right: "0px", bottom: "0px", left: "0px", borderRadius: "12px" };

/* ---------- Icons ---------- */

/* The map mark, spinner, check, warning and chevron: drawn for affectUI after Hugeicons Free (MIT, © Hugeicons, hugeicons.com) */
const MapMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M5.6 8H2.8M10.4 8h2.8M8 5.6V3M8 10.4V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
    <rect x="5.2" y="5.2" width="5.6" height="5.6" rx="1.6" fill="currentColor" />
    <circle cx="2.2" cy="8" r="1.4" fill="currentColor" />
    <circle cx="13.8" cy="8" r="1.4" fill="currentColor" />
  </svg>
);
const Spinner = () => (
  <svg className="ui-tam__spin" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
  </svg>
);
const Check = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 14L8.5 17.5L19 6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
  </svg>
);
const Warning = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M13.9248 21H10.0752C5.44476 21 3.12955 21 2.27636 19.4939C1.42317 17.9879 2.60736 15.9914 4.97574 11.9985L6.90057 8.75333C9.17559 4.91778 10.3131 3 12 3C13.6869 3 14.8244 4.91777 17.0994 8.75332L19.0243 11.9985C21.3926 15.9914 22.5768 17.9879 21.7236 19.4939C20.8704 21 18.5552 21 13.9248 21Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path d="M12 9V13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    <path d="M12 16.8V17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
  </svg>
);
const Back = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 6C15 6 9 10.4189 9 12C9 13.5812 15 18 15 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);
const ReplayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.6 3.6A4 4 0 1 1 2 6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M2.2 1.6v2.4h2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CallIcon = ({ status }: { status: ToolCallStatus }) => (
  <span className="ui-tam__call-icon" data-status={status}>
    {status === "running" ? <Spinner /> : status === "failed" ? <Warning /> : <Check />}
  </span>
);

/* ---------- Component ---------- */

export function ToolAccessMap({
  agents,
  tools: given,
  agent: controlled,
  defaultAgent,
  onAgentChange,
  onReplay,
  formatTime = clock,
  title = "Tool access",
  className,
}: ToolAccessMapProps) {
  const [own, setOwn] = useState(defaultAgent ?? agents[0]?.id);
  const picked = controlled ?? own;
  const agent = agents.find((a) => a.id === picked) ?? agents[0];

  const [open, setOpen] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const reopen = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closing = useRef(false);
  // While the calls view shrinks back into its tool, the map shows again underneath
  const [shutting, setShutting] = useState(false);

  // The map's width, for the lines – it lays itself out again whenever the card is resized
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width > 0 && width < NARROW;

  // More agents than fit in a row: the tabs scroll, and their edge fades while there's more to the right
  const tabsRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const fits = () => {
    const el = tabsRef.current;
    setMore(!!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };
  useLayoutEffect(fits, [agents.length, width]);

  const choose = (id: string) => {
    if (id === agent?.id) return;
    setOwn(id);
    onAgentChange?.(id);
    setOpen(null);
    setDraft(null);
  };

  // Every tool of the run – given, or gathered from all agents in the order they first come up
  const all: AccessTool[] = given ?? [];
  if (!given) {
    const seen = new Map<string, AccessTool>();
    for (const a of agents)
      for (const item of a.tools) {
        const had = seen.get(item.id);
        seen.set(item.id, {
          id: item.id,
          name: had?.name ?? item.name ?? item.id,
          icon: had?.icon ?? item.icon,
          description: had?.description ?? item.description,
        });
      }
    all.push(...seen.values());
  }
  const tools = all.map((def) => {
    const own = agent?.tools.find((t) => t.id === def.id);
    const calls = (own?.calls ?? []).map((c) => ({ ...c, at: num(c.at), duration: num(c.duration) }));
    const tool: AccessTool = { ...def, ...own, name: own?.name ?? def.name, calls: own?.calls };
    return { tool, calls, state: own ? stateOf(calls) : ("blocked" as ToolState) };
  });
  const tool = tools.find((t) => t.tool.id === open && t.state !== "blocked");
  const activeOpen = tool ? open : null;
  const reach = tools.filter((t) => t.state !== "blocked").length;
  const callCount = tools.reduce((n, t) => n + t.calls.length, 0);
  const running = tools.filter((t) => t.state === "running").length;
  // The running tag fades out with the count it had, not with "0 running"
  const [prevRunning, setPrevRunning] = useState(running);
  const [lastRunning, setLastRunning] = useState(() => Math.max(1, running));
  if (running !== prevRunning) {
    setPrevRunning(running);
    if (running > 0) setLastRunning(running);
  }

  // Opening a tool moves focus into its view; closing it puts focus back on the tool
  useEffect(() => {
    if (activeOpen) backRef.current?.focus();
    else if (reopen.current) {
      mapRef.current?.querySelector<HTMLElement>(`[data-tool="${CSS.escape(reopen.current)}"]`)?.focus();
      reopen.current = null;
    }
  }, [activeOpen]);

  // The calls view morphs out of the tool you clicked – and back into it when you close it
  const toolEl = (id: string | null) => (id ? mapRef.current?.querySelector<HTMLElement>(`[data-tool="${CSS.escape(id)}"]`) : null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const from = toolEl(activeOpen);
    if (!activeOpen || !panel || !from || reduced()) return;
    closing.current = false;
    panel.animate([over(panel, from), FULL], { duration: MORPH, easing: EASE });
  }, [activeOpen]);

  const close = () => {
    if (closing.current) return;
    // Runs once – the shrink's end and its fallback timer both call it
    let ran = false;
    const done = () => {
      if (ran) return;
      ran = true;
      closing.current = false;
      setShutting(false);
      reopen.current = open;
      setOpen(null);
      setDraft(null);
    };
    const panel = panelRef.current;
    const to = toolEl(open);
    if (!panel || !to || reduced()) return done();
    closing.current = true;
    setShutting(true);
    // What's inside fades first, then the card shrinks back to the tool – it ends as the tool's own card
    for (const child of panel.children) child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
    const shrink = panel.animate([FULL, over(panel, to)], { duration: MORPH * 0.85, easing: EASE, fill: "forwards" });
    // Closes when the shrink ends – or after its time anyway, if the page draws no frames (a tab in the background)
    const timer = setTimeout(done, MORPH + 80);
    shrink.onfinish = () => {
      clearTimeout(timer);
      done();
    };
  };

  // Geometry: half the tools on the left, the rest on the right, each side centered on the agent
  const leftN = Math.ceil(tools.length / 2);
  const rows = Math.max(leftN, tools.length - leftN);
  const mapH = Math.max(rows * NODE_H + Math.max(0, rows - 1) * GAP + PAD_Y * 2, 148);
  const W = width || 680;
  const cx = W / 2;
  const cy = mapH / 2;
  const placed = tools.map((t, i) => {
    const left = i < leftN;
    const k = left ? i : i - leftN;
    const n = left ? leftN : tools.length - leftN;
    const top = (mapH - (n * NODE_H + (n - 1) * GAP)) / 2 + k * (NODE_H + GAP);
    const x0 = left ? PAD_X + NODE_W : W - PAD_X - NODE_W;
    const x1 = left ? cx - AGENT_W / 2 : cx + AGENT_W / 2;
    const y0 = top + NODE_H / 2;
    // Square, like Agent Tree: out of the tool, along to a shared upright halfway to the agent, then into the agent –
    // with rounded corners
    const bus = Math.round((x0 + x1) / 2);
    const sx = Math.sign(x1 - x0);
    const dy = cy - y0;
    const sy = Math.sign(dy);
    const r = Math.min(RADIUS, Math.abs(dy) / 2, Math.abs(bus - x0));
    const d = Math.abs(dy) < 1 ? `M${x0} ${y0}H${x1}` : `M${x0} ${y0}H${bus - sx * r}Q${bus} ${y0} ${bus} ${y0 + sy * r}V${cy - sy * r}Q${bus} ${cy} ${bus + sx * r} ${cy}H${x1}`;
    return { ...t, left, k, top, x: left ? PAD_X : W - PAD_X - NODE_W, d };
  });

  const calls = tool?.calls ?? [];
  const call = calls.find((c) => c.id === callId) ?? calls[calls.length - 1];
  const draftOk = (() => {
    if (draft === null || !call || typeof call.input === "string") return true;
    try {
      JSON.parse(draft);
      return true;
    } catch {
      return false;
    }
  })();
  const replay = () => {
    if (!onReplay || !call || !tool || !agent || !draftOk || call.status === "running") return;
    const input = draft === null ? call.input : typeof call.input === "string" ? draft : JSON.parse(draft);
    onReplay(call, input, tool.tool, agent);
    setDraft(null);
    setCallId(null);
  };

  // The calls view needs a little more room than a small map – narrow, the list and the call sit one above the other
  const panelH = narrow ? 460 : Math.max(mapH, 320);

  return (
    <div className={["ui-tam", className].filter(Boolean).join(" ")} data-narrow={narrow ? "" : undefined}>
      <style href="ui-tool-access-map" precedence="default">
        {css}
      </style>

      <header className="ui-tam__head">
        <span className="ui-tam__mark">
          <MapMark />
        </span>
        <span className="ui-tam__title" dir="auto">
          {title}
        </span>
        {/* Left of the counts, so they never move: a blue tag while calls run – it fades out with its last count */}
        <span className="ui-tam__live" data-on={running > 0 ? "" : undefined} aria-hidden={running > 0 ? undefined : true}>
          <Spinner />
          {Math.max(running, lastRunning)}
          <span className="ui-tam__live-word"> running</span>
        </span>
        {/* Each count keeps its own width, so going from 9 to 10 calls doesn't shift anything */}
        <span className="ui-tam__sum" aria-live="polite">
          <span className="ui-tam__sum-tools">
            {reach}/{plural(tools.length, "tool")}
          </span>
          <span className="ui-tam__sum-calls">
            <span className="ui-tam__sum-dot">· </span>
            {plural(callCount, "call")}
          </span>
        </span>
      </header>

      {/* The white card on the tray: the agents' tabs and their map */}
      <div className="ui-tam__body">
        {agents.length > 1 && (
          <div className="ui-tam__agents" role="tablist" aria-label="Agents" ref={tabsRef} data-more={more ? "" : undefined} onScroll={fits}>
            {agents.map((a) => {
              const on = a.id === agent?.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  className="ui-tam__agent-tab"
                  onClick={() => choose(a.id)}
                  onKeyDown={(e) => {
                    const i = agents.indexOf(a);
                    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? agents.length - 1 : -1;
                    if (to < 0 || to >= agents.length) return;
                    e.preventDefault();
                    const targetAgent = agents[to];
                    if (targetAgent) choose(targetAgent.id);
                    (e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus();
                  }}
                >
                  <span className="ui-tam__tab-avatar" data-logo={a.avatar ? "" : undefined}>
                    {a.avatar ?? initials(a.name)}
                  </span>
                  <span className="ui-tam__tab-name" dir="auto" title={a.name}>
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div
          ref={mapRef}
          className="ui-tam__stage"
          role="tabpanel"
          aria-label={agent ? `Tools of ${agent.name}` : undefined}
          style={{ "--ui-tam-map-h": `${activeOpen ? panelH : mapH}px` } as CSSProperties}
        >
          {!agent ? (
            <p className="ui-tam__empty">No agents yet</p>
          ) : (
            <div className="ui-tam__map" inert={activeOpen ? true : undefined} aria-hidden={activeOpen && !shutting ? true : undefined}>
              {!narrow && width > 0 && (
                <svg className="ui-tam__lines" width={W} height={mapH} aria-hidden="true">
                  {/* The ground: every tool's line, gray and dashed – it stays as it is when you switch agents */}
                  <g>
                    {placed.map((p) => (
                      <path key={p.tool.id} className="ui-tam__base" d={p.d} pathLength={1} />
                    ))}
                  </g>
                  {/* Over it, blue for every tool the agent can use – keyed by agent, so each switch runs the fill in again
                    from the agent. The lines keep their order, so nothing restarts while you hover */}
                  <g key={`${agent.id}:fill`}>
                    {placed
                      .filter((p) => p.state !== "blocked")
                      .map((p) => (
                        <path key={p.tool.id} className="ui-tam__line" d={p.d} pathLength={1} style={{ "--ui-tam-k": p.k } as CSSProperties} />
                      ))}
                    {/* Lines share their upright and the way into the agent: the ones being called are drawn once more on top,
                      so their shimmer shows whole */}
                    {placed
                      .filter((p) => p.state === "running")
                      .map((p) => (
                        <g key={p.tool.id} data-state={p.state} style={{ "--ui-tam-k": p.k } as CSSProperties}>
                          <path className="ui-tam__line ui-tam__line--top" d={p.d} pathLength={1} />
                          {/* Being called right now: a shimmer runs down the line, from the agent to the tool – three dashes from
                            one head, a short full one and longer fainter ones behind it, so its tail is soft */}
                          {p.state === "running" &&
                            GLINT.map(([l, o]) => <path key={l} className="ui-tam__glint" d={p.d} pathLength={1} style={{ "--ui-tam-l": l, opacity: o } as CSSProperties} />)}
                        </g>
                      ))}
                  </g>
                  {leftN > 0 && (
                    <circle className="ui-tam__joint" data-on={placed.some((p) => p.left && p.state !== "blocked") ? "" : undefined} cx={cx - AGENT_W / 2} cy={cy} r="3" />
                  )}
                  {tools.length > leftN && (
                    <circle className="ui-tam__joint" data-on={placed.some((p) => !p.left && p.state !== "blocked") ? "" : undefined} cx={cx + AGENT_W / 2} cy={cy} r="3" />
                  )}
                </svg>
              )}

              <div className="ui-tam__card" data-status={agent.status} style={narrow ? undefined : ({ left: cx - AGENT_W / 2, top: cy } as CSSProperties)}>
                {/* The card stays; what's on it moves in from below when you switch agents */}
                <div className="ui-tam__card-body" key={agent.id}>
                  <div className="ui-tam__card-top">
                    <span className="ui-tam__avatar" data-logo={agent.avatar ? "" : undefined}>
                      {agent.avatar ?? initials(agent.name)}
                    </span>
                    <span className="ui-tam__who">
                      <span className="ui-tam__name" dir="auto" title={agent.name}>
                        {agent.name}
                      </span>
                      {agent.model && (
                        <span className="ui-tam__model" title={agent.model}>
                          {agent.model}
                        </span>
                      )}
                    </span>
                    <span className="ui-tam__status" data-status={agent.status}>
                      {agent.status === "running" && <Spinner />}
                      {STATUS[agent.status]}
                    </span>
                  </div>
                  {agent.task && (
                    <p className="ui-tam__task" dir="auto" title={agent.task}>
                      {agent.task}
                    </p>
                  )}
                </div>
              </div>

              {tools.length === 0 && <p className="ui-tam__none">No tools</p>}

              {/* The tools stay when you switch agents – they only change how they stand, softly */}
              <div className="ui-tam__tools">
                {placed.map((p, i) => {
                  const last = p.calls[p.calls.length - 1];
                  const blocked = p.state === "blocked";
                  const style = { "--ui-tam-k": narrow ? i : p.k, "--ui-tam-from": p.left ? "-14px 0" : "14px 0", ...(narrow ? null : { left: p.x, top: p.top }) } as CSSProperties;
                  return (
                    <button
                      key={p.tool.id}
                      type="button"
                      className="ui-tam__tool"
                      data-tool={p.tool.id}
                      data-state={p.state}
                      style={style}
                      // Without access it stays the same button, so it can gray out softly – just one that does nothing
                      aria-disabled={blocked ? true : undefined}
                      tabIndex={blocked ? -1 : undefined}
                      aria-label={
                        blocked
                          ? `${p.tool.name}, no access`
                          : `${p.tool.name}, ${p.state === "idle" ? "not used yet" : p.state === "used" ? "used" : p.state}, ${plural(p.calls.length, "call")} – open its calls`
                      }
                      onClick={() => {
                        if (blocked) return;
                        setOpen(p.tool.id);
                        setCallId(null);
                        setDraft(null);
                      }}
                    >
                      <span className="ui-tam__tool-top">
                        <span className="ui-tam__tile">{p.tool.icon ?? initials(p.tool.name).slice(0, 1)}</span>
                        <span className="ui-tam__tool-name" dir="auto" title={p.tool.name}>
                          {p.tool.name}
                        </span>
                        {p.calls.length > 0 && <span className="ui-tam__count">{p.calls.length}×</span>}
                      </span>
                      <span className="ui-tam__tool-meta">
                        {p.state === "running" ? (
                          <span className="ui-tam__badge" data-kind="running">
                            Running
                          </span>
                        ) : p.state === "failed" ? (
                          <span className="ui-tam__badge" data-kind="failed">
                            Failed
                          </span>
                        ) : p.state === "used" ? (
                          `Last call ${last?.duration !== undefined ? took(last.duration) : "done"}`
                        ) : blocked ? (
                          "No access"
                        ) : (
                          "Not used yet"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Every call of one tool: the list on the left, the one you picked with its input and output on the right */}
          {tool && agent && (
            <section ref={panelRef} className="ui-tam__panel" aria-label={`Calls to ${tool.tool.name}`} onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), close())}>
              <div className="ui-tam__panel-head">
                <button ref={backRef} type="button" className="ui-tam__back" onClick={close} aria-label="Back to the map">
                  <Back />
                </button>
                <span className="ui-tam__tile">{tool.tool.icon ?? initials(tool.tool.name).slice(0, 1)}</span>
                <span className="ui-tam__panel-name" dir="auto">
                  {tool.tool.name}
                </span>
                {tool.tool.description && (
                  <span className="ui-tam__panel-desc" dir="auto" title={tool.tool.description}>
                    {tool.tool.description}
                  </span>
                )}
                <span className="ui-tam__panel-sum">{plural(calls.length, "call")}</span>
              </div>

              {calls.length === 0 ? (
                <p className="ui-tam__empty">{agent.name} hasn&apos;t called it yet</p>
              ) : (
                <div className="ui-tam__panel-body">
                  {/* One tab stop for the list, however many calls – ↑ and ↓ move through them and show each */}
                  <ol
                    className="ui-tam__calls"
                    aria-label="Calls"
                    onKeyDown={(e) => {
                      const list = calls.slice().reverse();
                      const at = list.findIndex((c) => c === call);
                      const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
                      if (to < 0 || to >= list.length) return;
                      e.preventDefault();
                      const targetCall = list[to];
                      if (targetCall) setCallId(targetCall.id);
                      setDraft(null);
                      e.currentTarget.querySelectorAll<HTMLElement>(".ui-tam__call")[to]?.focus();
                    }}
                  >
                    {calls
                      .slice()
                      .reverse()
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="ui-tam__call"
                            aria-pressed={c === call}
                            tabIndex={c === call ? 0 : -1}
                            onClick={() => {
                              setCallId(c.id);
                              setDraft(null);
                            }}
                          >
                            <CallIcon status={c.status} />
                            <span className="ui-tam__call-text" title={brief(c.input)}>
                              {brief(c.input)}
                            </span>
                            {c.replay && <span className="ui-tam__chip">Replay</span>}
                            <span className="ui-tam__call-time">
                              {c.status === "running" ? "…" : c.duration !== undefined ? took(c.duration) : c.at !== undefined ? formatTime(c.at) : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ol>

                  {call && (
                    <div className="ui-tam__detail" key={call.id}>
                      <div className="ui-tam__label">
                        Input
                        {call.at !== undefined && <span className="ui-tam__label-meta">{formatTime(call.at)}</span>}
                      </div>
                      {draft !== null ? (
                        <textarea
                          className="ui-tam__code ui-tam__edit"
                          value={draft}
                          spellCheck={false}
                          aria-label="Input to replay with"
                          aria-invalid={!draftOk}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              replay();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              setDraft(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <pre className="ui-tam__code">{pretty(call.input)}</pre>
                      )}

                      <div className="ui-tam__label">
                        {call.status === "failed" ? "Error" : "Output"}
                        {call.duration !== undefined && <span className="ui-tam__label-meta">{took(call.duration)}</span>}
                      </div>
                      {call.status === "running" ? (
                        <p className="ui-tam__code ui-tam__waiting">Waiting for the result</p>
                      ) : (
                        <pre className="ui-tam__code" data-error={call.status === "failed" ? "" : undefined}>
                          {call.status === "failed" ? (call.error ?? pretty(call.output) ?? "Failed") : pretty(call.output) || "No output"}
                        </pre>
                      )}

                      {/* A call still out can't be replayed yet – the buttons wait for it */}
                      {onReplay && (
                        <div className="ui-tam__actions">
                          {draft !== null && !draftOk && <span className="ui-tam__invalid">Not valid JSON</span>}
                          {draft === null ? (
                            <button type="button" className="ui-tam__btn" onClick={() => setDraft(pretty(call.input))} disabled={call.status === "running"}>
                              Edit input
                            </button>
                          ) : (
                            <button type="button" className="ui-tam__btn" onClick={() => setDraft(null)}>
                              Cancel
                            </button>
                          )}
                          <button type="button" className="ui-tam__btn ui-tam__btn--primary" onClick={replay} disabled={!draftOk || call.status === "running"}>
                            <ReplayIcon />
                            {draft === null ? "Replay" : "Run"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const css = /* css */ `
/* Colors, sizes and motion as variables – override them on .ui-tam */
.ui-tam {
  --ui-tam-tray: var(--aui-subtle, #f0f0f0);
  --ui-tam-card: #ffffff;
  --ui-tam-strong: var(--aui-ink, #171717);
  --ui-tam-ink: var(--aui-ink, #171717);
  --ui-tam-text: var(--aui-muted, #6b6b6b);
  --ui-tam-muted: var(--aui-muted, #8a8a8a);
  --ui-tam-faint: var(--aui-placeholder, #b8b8b8);
  --ui-tam-line: var(--aui-border, #ececec);
  --ui-tam-fill: var(--aui-subtle, #f2f2f2);
  --ui-tam-well: #f7f7f7;
  --ui-tam-accent: var(--aui-blue, #4fb0fe);
  --ui-tam-rail: var(--aui-border-strong, #d6d6d6);
  /* The lines are solid colors, never see-through – where several run together they keep their color.
     Blue for every tool the agent can use, gray and dashed for the rest; a call right now sends a deeper blue shimmer down its line */
  --ui-tam-used: #83c7fe;
  --ui-tam-glint: var(--aui-blue, #4fb0fe);
  --ui-tam-off: #d6d6d6;
  --ui-tam-brand-bg: #eaf1ff;
  --ui-tam-brand-fg: #2f6bff;
  --ui-tam-ok-bg: #e8f6ee;
  --ui-tam-ok-fg: var(--aui-success, #1e8a4f);
  --ui-tam-warn-bg: #fff1e0;
  --ui-tam-warn-fg: var(--aui-warning, #b25e00);
  --ui-tam-danger-bg: #fdecea;
  --ui-tam-danger-fg: var(--aui-danger, #c4320a);
  --ui-tam-focus: var(--aui-focus, rgba(0, 96, 226, 0.7));
  --ui-tam-solid: var(--aui-primary, #171717);
  --ui-tam-on-solid: var(--aui-on-primary, #ffffff);
  /* A 1px edge and a soft lift */
  --ui-tam-shadow: 0 0 0 1px var(--ui-tam-line), 0 1px 2px rgba(0, 0, 0, 0.04);
  --ui-tam-shadow-hover: 0 0 0 1px #e2e2e2, 0 2px 6px -2px rgba(0, 0, 0, 0.12);
  /* A tool without access: the edge only – same shape as the shadow, so it fades between them */
  --ui-tam-shadow-off: 0 0 0 1px var(--ui-tam-line), 0 1px 2px rgba(0, 0, 0, 0);
  /* How far a tool without access fades */
  --ui-tam-dim: 0.45;
  --ui-tam-mono: var(--aui-font-mono, ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace);
  --ui-tam-ease: cubic-bezier(0.32, 0.72, 0.24, 1);
  position: relative;
  box-sizing: border-box;
  width: 100%;
  padding: 4px;
  border-radius: var(--aui-radius-lg, 16px);
  background: var(--ui-tam-tray);
  font-family: var(--aui-font, "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  letter-spacing: -0.006em;
  color: var(--ui-tam-text);
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.ui-tam *, .ui-tam *::before, .ui-tam *::after { box-sizing: border-box; }
:where(.ui-tam) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ui-tam button:focus-visible { outline: 2px solid var(--ui-tam-focus); outline-offset: 2px; }
/* Typing in a field: no ring – the caret shows where you are, the edge only firms up a little */
.ui-tam textarea:focus-visible { outline: none; }
/* Inside rows that scroll, the ring sits inside the element, so the scroll edge can't cut it */
.ui-tam :is(.ui-tam__agent-tab, .ui-tam__call):focus-visible { outline-offset: -2px; }
.ui-tam p { margin: 0; }
.ui-tam svg { display: block; flex: none; }

/* ----- The bar on top, and the agents of the run as tabs ----- */
.ui-tam__head { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px 10px; }
/* The white card on the tray, with the tabs and the map */
.ui-tam__body { padding: 10px 6px 6px; border-radius: calc(var(--aui-radius-lg, 16px) - 4px); background: var(--aui-surface, var(--ui-tam-card)); box-shadow: var(--aui-shadow-card, var(--ui-tam-shadow)); }
.ui-tam__mark { display: grid; flex: none; place-items: center; width: 16px; color: var(--ui-tam-accent); }
.ui-tam__title { flex: 0 1 auto; min-width: 0; overflow: hidden; font-weight: 600; color: var(--ui-tam-strong); white-space: nowrap; text-overflow: ellipsis; }
.ui-tam__sum { display: flex; flex: none; justify-content: flex-end; font-size: 12.5px; line-height: 18px; color: var(--ui-tam-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Room for "10/10 tools" and "· 999 calls" – the numbers change, the places don't */
.ui-tam__sum-tools { min-width: 68px; text-align: right; }
.ui-tam__sum-calls { min-width: 66px; padding-left: 4px; text-align: right; white-space: pre; }
.ui-tam__live { display: inline-flex; flex: none; align-items: center; gap: 4px; height: 20px; margin-left: auto; padding: 0 8px 0 6px; border-radius: 999px; background: var(--ui-tam-brand-bg); font-size: 11.5px; font-weight: 600; line-height: 16px; color: var(--ui-tam-brand-fg); white-space: nowrap; font-variant-numeric: tabular-nums; opacity: 0; transform: scale(0.96); transition: opacity 200ms ease, transform 200ms var(--ui-tam-ease); }
.ui-tam__live[data-on] { opacity: 1; transform: none; }

.ui-tam__agents { display: flex; gap: 6px; min-width: 0; padding: 1px 1px 4px; overflow-x: auto; scrollbar-width: none; }
/* More agents than fit: they scroll sideways, and the edge fades so the cut-off tab reads as "more" */
.ui-tam__agents[data-more] { -webkit-mask: linear-gradient(90deg, #000 calc(100% - 32px), transparent); mask: linear-gradient(90deg, #000 calc(100% - 32px), transparent); }
.ui-tam__agents::-webkit-scrollbar { display: none; }
/* The other agents sit on a soft gray; the one on the map is a white chip with a hairline and a light lift */
.ui-tam__agent-tab { display: inline-flex; flex: none; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 5px; border-radius: 999px; background: var(--ui-tam-fill); font-size: 13px; font-weight: 500; color: var(--ui-tam-text); transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease; }
.ui-tam__agent-tab:hover { color: var(--ui-tam-ink); }
.ui-tam__agent-tab[aria-selected="true"] { background: var(--ui-tam-card); color: var(--ui-tam-ink); box-shadow: var(--ui-tam-shadow); }
.ui-tam__tab-avatar { display: grid; flex: none; place-items: center; width: 20px; height: 20px; border-radius: 999px; background: var(--ui-tam-card); box-shadow: var(--ui-tam-shadow); font-size: 9px; font-weight: 600; color: var(--ui-tam-text); }
.ui-tam__tab-avatar[data-logo] > svg { width: 11px; height: 11px; }
.ui-tam__tab-name { max-width: 160px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

.ui-tam__empty { margin: 0; padding: 28px 16px; text-align: center; color: var(--ui-tam-muted); }

/* ----- The map: the agent in the middle, its tools on both sides ----- */
.ui-tam__stage { position: relative; height: var(--ui-tam-map-h); transition: height 260ms var(--ui-tam-ease); }
.ui-tam__map { position: absolute; inset: 0; transition: opacity 200ms ease; }
.ui-tam__map[aria-hidden] { opacity: 0; }
.ui-tam__lines { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; }

/* The gray dashed ground under every line – blue runs in over it for the tools the agent can use */
.ui-tam__base { fill: none; stroke: var(--ui-tam-off); stroke-width: 1.5; stroke-dasharray: 0.012 0.024; animation: ui-tam-fade 300ms both; }
.ui-tam__line { fill: none; stroke: var(--ui-tam-used); stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: 1; transition: stroke 200ms ease; animation: ui-tam-grow 460ms calc(var(--ui-tam-k) * 45ms) var(--ui-tam-ease) both; }
/* Being called right now: a deeper blue shimmer runs over the line */
.ui-tam__glint { fill: none; stroke: var(--ui-tam-glint); stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: var(--ui-tam-l) 2; animation: ui-tam-glint 1300ms 460ms linear infinite both; }
/* The copy on top runs in with the rest after a switch */
.ui-tam__joint { fill: var(--ui-tam-card); stroke: var(--ui-tam-off); stroke-width: 1.5; transition: stroke 300ms ease; animation: ui-tam-fade 200ms both; }
.ui-tam__joint[data-on] { stroke: var(--ui-tam-used); }

/* The agent: a small white card, centered on the map */
.ui-tam__card { position: absolute; z-index: 1; width: ${AGENT_W}px; padding: 10px 10px 9px; border-radius: calc(var(--aui-radius-lg, 16px) - 4px); background: var(--aui-surface, var(--ui-tam-card)); box-shadow: var(--aui-shadow-card, var(--ui-tam-shadow)); overflow: hidden; transform: translateY(-50%); animation: ui-tam-in 300ms var(--ui-tam-ease) both; }
.ui-tam__card-body { display: grid; gap: 6px; animation: ui-tam-swap 340ms var(--ui-tam-ease) both; }
.ui-tam__card-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ui-tam__avatar { display: grid; flex: none; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--ui-tam-card); box-shadow: var(--ui-tam-shadow); font-size: 10px; font-weight: 500; color: var(--ui-tam-text); }
.ui-tam__avatar[data-logo] > svg { width: 13px; height: 13px; }
.ui-tam__who { display: grid; flex: 1; min-width: 0; }
.ui-tam__name { overflow: hidden; font-weight: 500; line-height: 16px; color: var(--ui-tam-strong); white-space: nowrap; text-overflow: ellipsis; }
.ui-tam__model { overflow: hidden; font-size: 11px; line-height: 14px; color: var(--ui-tam-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-tam__status { display: inline-flex; flex: none; align-self: start; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border-radius: 999px; background: var(--ui-tam-fill); font-size: 11.5px; font-weight: 600; line-height: 16px; color: var(--ui-tam-text); white-space: nowrap; }
.ui-tam__status:has(svg) { padding-left: 4px; }
.ui-tam__status[data-status="running"] { background: var(--ui-tam-brand-bg); color: var(--ui-tam-brand-fg); }
.ui-tam__status[data-status="waiting"] { background: var(--ui-tam-warn-bg); color: var(--ui-tam-warn-fg); }
.ui-tam__status[data-status="done"] { background: var(--ui-tam-ok-bg); color: var(--ui-tam-ok-fg); }
.ui-tam__status[data-status="failed"] { background: var(--ui-tam-danger-bg); color: var(--ui-tam-danger-fg); }
.ui-tam__task { display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; font-size: 12px; line-height: 16px; color: var(--ui-tam-text); -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* A tool: name and how often it was called on top, how it stands below – always the same size */
.ui-tam__tool { position: absolute; z-index: 1; display: grid; align-content: center; gap: 2px; width: ${NODE_W}px; height: ${NODE_H}px; padding: 0 10px 0 8px; border-radius: calc(var(--aui-radius-lg, 16px) - 6px); background: var(--aui-surface, var(--ui-tam-card)); box-shadow: var(--aui-shadow-card, var(--ui-tam-shadow)); transition: box-shadow 320ms ease, background-color 320ms ease; animation: ui-tam-move 440ms calc(140ms + var(--ui-tam-k) * 45ms) var(--ui-tam-ease) both; }
.ui-tam__tool:not([data-state="blocked"]):hover { box-shadow: var(--ui-tam-shadow-hover); }
/* No access: grayed out, flat, and nothing to open */
.ui-tam__tool > * { transition: opacity 320ms ease; }
/* No access: it grays out softly – the card turns flat, the words fade, the logo loses its color */
.ui-tam__tool[data-state="blocked"] { background: var(--ui-tam-well); box-shadow: var(--ui-tam-shadow-off); cursor: default; }
.ui-tam__tool[data-state="blocked"] > * { opacity: var(--ui-tam-dim); }
.ui-tam__tool[data-state="blocked"] .ui-tam__tile { filter: grayscale(1); }
.ui-tam__tool[data-state="blocked"]:active { transform: none; }
.ui-tam__tool:active { transform: scale(0.98); }
.ui-tam__tool-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ui-tam__tile { display: grid; flex: none; place-items: center; width: 16px; height: 16px; border-radius: 4px; background: var(--ui-tam-card); box-shadow: var(--ui-tam-shadow); font-size: 9px; font-weight: 600; color: var(--ui-tam-text); transition: filter 320ms ease; }
.ui-tam__tile > svg { width: 10px; height: 10px; }
.ui-tam__tool-name { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; font-weight: 500; line-height: 16px; color: var(--ui-tam-ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-tam__count { flex: none; font-size: 11px; line-height: 16px; color: var(--ui-tam-muted); font-variant-numeric: tabular-nums; }
.ui-tam__tool-meta { display: flex; align-items: center; height: 16px; padding-left: 22px; overflow: hidden; font-size: 11px; line-height: 16px; color: var(--ui-tam-muted); white-space: nowrap; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.ui-tam__badge { display: inline-flex; align-items: center; height: 16px; padding: 0 6px; border-radius: 999px; font-size: 10.5px; font-weight: 600; line-height: 16px; }
.ui-tam__badge[data-kind="running"] { background: var(--ui-tam-brand-bg); color: var(--ui-tam-brand-fg); }
.ui-tam__badge[data-kind="failed"] { background: var(--ui-tam-danger-bg); color: var(--ui-tam-danger-fg); }
.ui-tam__none { position: absolute; right: 0; bottom: 14px; left: 0; text-align: center; font-size: 12px; color: var(--ui-tam-muted); }

/* Narrow: the agent on top, its tools in a grid below – no room for lines. The bar keeps the title and the calls;
   the tool count and the word "running" give way */
.ui-tam[data-narrow] :is(.ui-tam__sum-tools, .ui-tam__sum-dot, .ui-tam__live-word) { display: none; }
.ui-tam[data-narrow] .ui-tam__sum-calls { min-width: 56px; padding-left: 0; }
.ui-tam[data-narrow] .ui-tam__live { gap: 3px; margin-right: 8px; }
.ui-tam[data-narrow] .ui-tam__stage { height: auto; min-height: var(--ui-tam-map-h); }
.ui-tam[data-narrow] .ui-tam__map { position: relative; display: grid; gap: 10px; padding: 8px 0 2px; }
.ui-tam[data-narrow] .ui-tam__card { position: relative; width: auto; transform: none; }
.ui-tam[data-narrow] .ui-tam__tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.ui-tam[data-narrow] .ui-tam__tool { position: relative; width: auto; --ui-tam-from: 0 6px !important; }
.ui-tam[data-narrow] .ui-tam__none { position: static; }
.ui-tam[data-narrow] .ui-tam__map[aria-hidden] { position: absolute; }

/* ----- The calls of one tool, over the map ----- */
.ui-tam__panel { position: absolute; inset: 8px 0 0; z-index: 2; display: flex; flex-direction: column; padding: 4px 12px 12px; border-radius: calc(var(--aui-radius-lg, 16px) - 4px); background: var(--aui-surface, var(--ui-tam-card)); box-shadow: var(--aui-shadow-card, var(--ui-tam-shadow)); overflow: hidden; }
/* While it grows out of the tool, what's inside fades in a beat later */
.ui-tam__panel > * { animation: ui-tam-fade 220ms 120ms both; }
.ui-tam__panel-head { display: flex; flex: none; align-items: center; gap: 8px; min-width: 0; height: 36px; }
.ui-tam__back { display: grid; flex: none; place-items: center; width: 24px; height: 24px; margin-left: -2px; border-radius: calc(var(--aui-radius-sm, 7px) - 1px); color: var(--ui-tam-muted); transition: background-color 160ms ease, color 160ms ease; }
.ui-tam__back:hover { background: var(--ui-tam-fill); color: var(--ui-tam-ink); }
.ui-tam__panel-name { flex: none; font-weight: 500; color: var(--ui-tam-strong); white-space: nowrap; }
.ui-tam__panel-desc { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--ui-tam-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-tam__panel-sum { flex: none; margin-left: auto; font-size: 12px; line-height: 16px; color: var(--ui-tam-muted); font-variant-numeric: tabular-nums; }
.ui-tam__panel-body { display: grid; flex: 1; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 12px; min-height: 0; }

.ui-tam__calls { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 2px; min-height: 0; margin: 0; padding: 2px; overflow-y: auto; overscroll-behavior: contain; list-style: none; scrollbar-width: thin; }
.ui-tam__call { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 8px 0 6px; border-radius: var(--aui-radius-sm, 7px); transition: background-color 150ms ease; }
.ui-tam__call:hover { background: var(--ui-tam-well); }
.ui-tam__call[aria-pressed="true"] { background: var(--ui-tam-fill); }
.ui-tam__call-icon { display: grid; flex: none; place-items: center; width: 14px; color: var(--ui-tam-muted); }
.ui-tam__call-icon[data-status="failed"] { color: var(--ui-tam-danger-fg); }
.ui-tam__call-text { flex: 1; min-width: 0; overflow: hidden; font-family: var(--ui-tam-mono); font-size: 11.5px; line-height: 16px; color: var(--ui-tam-ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-tam__chip { flex: none; height: 16px; padding: 0 6px; border-radius: 999px; background: var(--ui-tam-fill); font-size: 10.5px; font-weight: 500; line-height: 16px; color: var(--ui-tam-text); }
.ui-tam__call-time { flex: none; min-width: 34px; font-size: 11px; color: var(--ui-tam-muted); text-align: right; font-variant-numeric: tabular-nums; }

.ui-tam__detail { display: flex; flex-direction: column; gap: 6px; min-height: 0; padding-top: 2px; animation: ui-tam-fade 180ms both; }
.ui-tam__label { display: flex; flex: none; align-items: center; gap: 6px; font-size: 10px; font-weight: 500; line-height: 16px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--ui-tam-muted); }
.ui-tam__label-meta { margin-left: auto; font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--ui-tam-faint); font-variant-numeric: tabular-nums; }
/* Input and output share the height there is – each scrolls once it's longer */
.ui-tam__code { flex: 0 1 auto; min-height: 34px; margin: 0; padding: 8px 10px; overflow: auto; border: 0; border-radius: var(--aui-radius-sm, 7px); background: var(--ui-tam-well); box-shadow: inset 0 0 0 0.5px var(--ui-tam-line); font-family: var(--ui-tam-mono); font-size: 11.5px; line-height: 17px; color: var(--ui-tam-ink); white-space: pre-wrap; overflow-wrap: anywhere; scrollbar-width: thin; }
.ui-tam__code[data-error] { color: var(--ui-tam-danger-fg); }
.ui-tam__edit { width: 100%; min-height: 108px; resize: none; background: var(--aui-surface, var(--ui-tam-card)); box-shadow: inset 0 0 0 0.5px var(--ui-tam-rail); outline: none; }
.ui-tam__edit[aria-invalid="true"] { box-shadow: inset 0 0 0 0.5px var(--ui-tam-danger-fg); }
/* Still waiting: a light shimmer runs over the words */
.ui-tam__waiting {
  font-family: inherit;
  font-size: 12px;
  background: linear-gradient(90deg, var(--ui-tam-muted) 0 40%, var(--ui-tam-faint) 50%, var(--ui-tam-muted) 60% 100%) 0 0 / 250% 100%, var(--ui-tam-well);
  -webkit-background-clip: text, border-box;
  background-clip: text, border-box;
  color: transparent;
  animation: ui-tam-shine 1000ms linear infinite;
}
.ui-tam__actions { display: flex; flex: none; align-items: center; justify-content: flex-end; gap: 6px; margin-top: auto; padding-top: 4px; }
.ui-tam__invalid { margin-right: auto; font-size: 12px; color: var(--ui-tam-danger-fg); }
.ui-tam__btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; background: var(--aui-surface, var(--ui-tam-card)); box-shadow: var(--ui-tam-shadow); font-size: 13px; font-weight: 600; color: var(--ui-tam-ink); transition: background-color 160ms ease, opacity 160ms ease; }
.ui-tam__btn:hover { background: var(--ui-tam-well); }
.ui-tam__btn--primary { padding-left: 10px; background: var(--ui-tam-solid); box-shadow: none; color: var(--ui-tam-on-solid); }
.ui-tam__btn--primary:hover { background: var(--ui-tam-solid); opacity: 0.88; }
.ui-tam__btn:disabled { opacity: 0.4; cursor: default; }
.ui-tam__btn:active:not(:disabled) { transform: scale(0.97); }

/* Narrow: the list above, the call below */
.ui-tam[data-narrow] .ui-tam__panel-desc { display: none; }
.ui-tam[data-narrow] .ui-tam__panel-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
.ui-tam[data-narrow] .ui-tam__calls { max-height: 98px; }

.ui-tam__spin { animation: ui-tam-spin 900ms linear infinite; }

@media (pointer: coarse) {
  .ui-tam__agent-tab { height: 32px; }
  .ui-tam__call { height: 36px; }
  .ui-tam__back { width: 32px; height: 32px; }
}

@keyframes ui-tam-fade { from { opacity: 0; } }
/* The shimmer's head travels from the agent's end of the line to past the tool's, its tail behind it */
@keyframes ui-tam-glint { from { stroke-dashoffset: -1; } to { stroke-dashoffset: 0.3; } }
@keyframes ui-tam-grow { from { stroke-dashoffset: -1; } to { stroke-dashoffset: 0; } }
@keyframes ui-tam-move { from { opacity: 0; translate: var(--ui-tam-from); } }
@keyframes ui-tam-swap { from { opacity: 0; transform: translateY(10px); } }
@keyframes ui-tam-in { from { opacity: 0; scale: 0.96; } }
@keyframes ui-tam-spin { to { transform: rotate(360deg); } }
@keyframes ui-tam-shine { from { background-position: 100% 0, 0 0; } to { background-position: 0 0, 0 0; } }

@media (prefers-reduced-motion: reduce) {
  .ui-tam *, .ui-tam *::before, .ui-tam *::after { animation: none !important; transition: none !important; }
  .ui-tam__waiting { background: var(--ui-tam-well); color: var(--ui-tam-muted); }
  .ui-tam__glint { display: none; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-tam {
  --ui-tam-tray: var(--aui-subtle, #19191c);
  --ui-tam-card: #232326;
  --ui-tam-strong: var(--aui-ink, #ededed);
  --ui-tam-ink: var(--aui-ink, #ededed);
  --ui-tam-text: var(--aui-muted, #a1a1a6);
  --ui-tam-muted: var(--aui-muted, #7c7c82);
  --ui-tam-faint: var(--aui-placeholder, #4a4a50);
  --ui-tam-line: var(--aui-border, #2f2f34);
  --ui-tam-fill: var(--aui-subtle, #2c2c30);
  --ui-tam-well: #28282b;
  --ui-tam-accent: var(--aui-blue, #4fb0fe);
  --ui-tam-rail: var(--aui-border-strong, #3a3a40);
  --ui-tam-used: var(--aui-blue, #0190fe);
  --ui-tam-glint: #b9e0ff;
  --ui-tam-off: #3a3a40;
  --ui-tam-brand-bg: #1b2b4a;
  --ui-tam-brand-fg: #8ab4ff;
  --ui-tam-ok-bg: #163022;
  --ui-tam-ok-fg: var(--aui-green, #5fc88a);
  --ui-tam-warn-bg: #3a2712;
  --ui-tam-warn-fg: var(--aui-warning, #ffb35c);
  --ui-tam-danger-bg: #3b1c14;
  --ui-tam-danger-fg: var(--aui-danger, #ff8a7a);
  --ui-tam-focus: var(--aui-focus, rgba(77, 141, 255, 0.8));
  --ui-tam-solid: var(--aui-primary, #ededed);
  --ui-tam-on-solid: var(--aui-on-primary, #141416);
  --ui-tam-shadow: 0 0 0 1px var(--ui-tam-line), 0 1px 2px rgba(0, 0, 0, 0.3);
  --ui-tam-shadow-hover: 0 0 0 1px #3a3a40, 0 2px 6px -2px rgba(0, 0, 0, 0.5);
  --ui-tam-shadow-off: 0 0 0 1px var(--ui-tam-line), 0 1px 2px rgba(0, 0, 0, 0);
}
`;
