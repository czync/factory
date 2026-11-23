// components/ui/approval-gates.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

/*
 * Approval Gates – every point in an agent run that waits for a person, in a single self-contained file.
 * The open requests lie as a stack of cards, like toasts: the one to decide now on top, the others peeking out
 * behind it. Above it a quiet block with the run in numbers, below it what it holds up and what's been decided – all
 * one width, straight on the page: no layer of its own around it, so it sits in a dashboard's panel as it is.
 * Classic style: every block is a white card on its own gray layer – the bar, who asks and the buttons on the gray.
 *   · the card on top says who asks, what exactly it wants to do – a tool call, a file change, a sub-agent it wants to
 *     start, a message – and why, with the arguments, the prompt or the diff right on it
 *   · approve, reject, or change it first and approve that – the card drops into the list below and the next one rises
 *   · open gates hold the steps behind them; a rejected one stays in the list as the point where the run stopped
 *   · open a card or a decided row for the full context: the steps before it, the files it touches, all of the data
 *   · live runs: a new request slides in behind the stack while you decide
 * The styles are injected below, so no extra files are needed.
 */

export type GateKind = "tool" | "file" | "agent" | "message";
export type GateStatus = "open" | "approved" | "edited" | "rejected";
export type GateDecision = "approved" | "edited" | "rejected";

export type DiffLine = { type: "add" | "del" | "ctx"; text: string };

export type ApprovalGate = {
  id: string;
  /** Who asks – the agent or step that wants the approval */
  agent: string;
  /** A small mark for the agent, e.g. the model maker's logo – defaults to its initials */
  avatar?: ReactNode;
  kind: GateKind;
  /** The concrete action, e.g. "Send email to 1,284 customers" */
  action: string;
  /** Why it needs a person – one short line */
  reason: string;
  status: GateStatus;
  /** When it came up or was decided, already formatted – e.g. "2m ago" */
  at?: string;
  /** The tool's arguments, the sub-agent's prompt or the message – shown as it is, editable before approving */
  input?: string;
  /** A file change, line by line */
  diff?: { file: string; lines: DiffLine[] }[];
  /** Files or resources the action touches */
  files?: string[];
  /** What happened before it – the agent's last steps */
  context?: string[];
  /** The steps that wait for this gate */
  holds?: string[];
  /** After a decision: what the person changed or said */
  note?: string;
};

export type ApprovalGatesProps = {
  /** Every gate of the run, in the order they came up */
  gates: ApprovalGate[];
  /** What the run is about – shown muted next to the title */
  task?: string;
  /** The run is still going, so new requests may come */
  live?: boolean;
  /** Decide a gate. With "edited", `value` is the changed input (or, for a diff, what should change) */
  onDecide?: (id: string, decision: GateDecision, value?: string) => void;
  title?: string;
  className?: string;
};

/* ---------- Helpers ---------- */

const KIND: Record<GateKind, string> = { tool: "Tool call", file: "File change", agent: "Sub-agent", message: "Message" };
/** What the data of each kind is called */
const DATA: Record<GateKind, string> = { tool: "Arguments", file: "Changes", agent: "Prompt", message: "Message" };
const DONE: Record<GateDecision, string> = { approved: "Approved", edited: "Approved with changes", rejected: "Rejected" };
/** How many cards peek out behind the one on top */
const PEEK = 2;
/** How long a decided card takes to drop out of the stack */
const LEAVE = 360;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
// Whole letters only – "🔍 Researcher" gives "R", not half an emoji
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ""))[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

/* ---------- Icons: Hugeicons Free (MIT, © Hugeicons, hugeicons.com) ---------- */

const Mark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3.4" y="1.6" width="9.2" height="3" rx="1.2" fill="currentColor" opacity="0.3" />
    <rect x="2.2" y="3.6" width="11.6" height="3.4" rx="1.3" fill="currentColor" opacity="0.55" />
    <rect x="1" y="6.2" width="14" height="8.2" rx="2" fill="currentColor" />
  </svg>
);
const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4.27 18.84C4.49 20.52 5.88 21.82 7.56 21.9C8.98 21.97 10.42 22 12 22C13.58 22 15.02 21.97 16.44 21.9C18.12 21.82 19.51 20.52 19.73 18.84C19.88 17.75 20 16.64 20 15.5C20 14.36 19.88 13.25 19.73 12.16C19.51 10.49 18.12 9.18 16.44 9.1C15.02 9.03 13.58 9 12 9C10.42 9 8.98 9.03 7.56 9.1C5.88 9.18 4.49 10.49 4.27 12.16C4.12 13.25 4 14.36 4 15.5C4 16.64 4.12 17.75 4.27 18.84Z"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M7.5 9V6.5C7.5 4.01 9.51 2 12 2C14.49 2 16.5 4.01 16.5 6.5V9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);
const Check = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 14.5C5 14.5 6.5 14.5 8.5 18C8.5 18 14.06 8.83 19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
  </svg>
);
const Cross = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
  </svg>
);
const Chevron = ({ dir = "down" }: { dir?: "down" | "left" | "right" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={dir === "down" ? undefined : { transform: `rotate(${dir === "left" ? 90 : -90}deg)` }}>
    <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>
);
const Pen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M14.07 3.89C14.82 3.08 15.19 2.67 15.59 2.44C16.54 1.87 17.72 1.85 18.69 2.39C19.09 2.62 19.48 3.01 20.25 3.79C21.01 4.58 21.4 4.97 21.62 5.38C22.14 6.37 22.13 7.57 21.57 8.55C21.34 8.96 20.94 9.34 20.15 10.1L10.75 19.15C9.25 20.6 8.5 21.32 7.57 21.68C6.63 22.05 5.6 22.02 3.55 21.97L3.27 21.96C2.64 21.94 2.33 21.94 2.14 21.73C1.96 21.52 1.99 21.2 2.04 20.57L2.06 20.22C2.2 18.42 2.27 17.53 2.62 16.72C2.97 15.91 3.58 15.26 4.79 13.94L14.07 3.89Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M13 4L20 11" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

/* ---------- The data of a gate: a diff, or the arguments, prompt or message as they are ---------- */

function GateData({ gate: g, full }: { gate: ApprovalGate; full: boolean }) {
  if (g.diff)
    return (
      <div className="ui-gate__diff" data-full={full ? "" : undefined} tabIndex={0} aria-label="Changes">
        {g.diff.map((f) => (
          <div key={f.file} className="ui-gate__file">
            <span className="ui-gate__file-name" dir="auto" title={f.file}>
              {f.file}
            </span>
            <pre>
              {f.lines.map((l, i) => (
                <span key={i} className="ui-gate__dl" data-type={l.type}>
                  <span aria-hidden="true">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
                  {l.type !== "ctx" && <span className="ui-gate__sr">{l.type === "add" ? "Added: " : "Removed: "}</span>}
                  {l.text}
                  {"\n"}
                </span>
              ))}
            </pre>
          </div>
        ))}
      </div>
    );
  if (!g.input) return null;
  return (
    <pre className="ui-gate__data" data-full={full ? "" : undefined} data-mono={g.kind === "tool" ? "" : undefined} dir="auto" tabIndex={0}>
      {g.input}
    </pre>
  );
}

/** The rest of a gate's context: the steps before it and the files it touches */
function GateContext({ gate: g }: { gate: ApprovalGate }) {
  return (
    <>
      {g.context && g.context.length > 0 && (
        <div className="ui-gate__section">
          <span className="ui-gate__label">Before this</span>
          <ol className="ui-gate__context" tabIndex={0} aria-label="Steps before this">
            {g.context.map((c, i) => (
              <li key={i} dir="auto">
                {c}
              </li>
            ))}
          </ol>
        </div>
      )}
      {g.files && g.files.length > 0 && (
        <div className="ui-gate__section">
          <span className="ui-gate__label">Touches</span>
          <ul className="ui-gate__files">
            {g.files.map((f) => (
              <li key={f} dir="auto" title={f}>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* ---------- The component ---------- */

export function ApprovalGates({ gates: given, task, live = false, onDecide, title = "Approvals", className }: ApprovalGatesProps) {
  /* ---------- Decisions: shown at once, then handed to the app ---------- */

  const [decided, setDecided] = useState<Record<string, { status: GateDecision; note?: string; order: number }>>({});
  const gates = given.map((g) => {
    const d = decided[g.id];
    // The app's own status wins once it moves on from "open"
    return d && g.status === "open" ? { ...g, status: d.status as GateStatus, note: d.note ?? g.note, at: "just now" } : g;
  });
  const open = gates.filter((g) => g.status === "open");
  // Newest decision first – the ones decided here on top, in the order they were made
  const done = gates
    .filter((g) => g.status !== "open")
    .map((g, i) => {
      const entry = decided[g.id];
      return { g, rank: entry ? 10_000 + entry.order : i };
    })
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.g);

  // Which open request is on top – the oldest by default; the arrows move through them
  const [frontId, setFrontId] = useState<string | null>(null);
  const front = open.find((g) => g.id === frontId) ?? open[0];
  const index = front ? open.indexOf(front) : -1;
  const stack = front ? [...open.slice(index), ...open.slice(0, index)] : [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [more, setMore] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const frontRef = useRef<HTMLElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  // A switch to another request ends editing and folds its extras
  const lastFront = useRef(front?.id);
  if (lastFront.current !== front?.id) {
    lastFront.current = front?.id;
    if (editing) setEditing(false);
    if (more) setMore(false);
  }

  // The card that just got decided drops out where it was, a beat before it's gone
  const [leaving, setLeaving] = useState<{ gate: ApprovalGate; decision: GateDecision } | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), reduced() ? 0 : LEAVE);
    return () => window.clearTimeout(t);
  }, [leaving]);

  // Decided elsewhere – by the app, another person – the card on top drops out the same way
  const lastTop = useRef<ApprovalGate | undefined>(undefined);
  useLayoutEffect(() => {
    const was = lastTop.current;
    lastTop.current = front;
    if (!was || was.id === front?.id || decided[was.id]) return;
    const now = gates.find((g) => g.id === was.id);
    if (now && now.status !== "open") setLeaving({ gate: was, decision: now.status as GateDecision });
  }, [front, decided, gates]);

  // The stack is as tall as the card on top – the ones behind take its height, like a pile of toasts
  const [frontH, setFrontH] = useState(0);
  useLayoutEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrontH(el.offsetHeight));
    ro.observe(el);
    setFrontH(el.offsetHeight);
    return () => ro.disconnect();
  }, [front?.id]);

  // The stack keeps the height of the tallest card it has shown, so a shorter one – or one card fewer behind it – never
  // moves what's below. Measured when a card comes on top, before Full context or Edit open it further
  const [floor, setFloor] = useState(0);
  useLayoutEffect(() => {
    const el = frontRef.current;
    if (el) setFloor((f) => Math.max(f, el.offsetHeight));
  }, [front?.id]);

  const decide = (g: ApprovalGate, decision: GateDecision, value?: string) => {
    const note = decision === "edited" ? (g.kind === "file" ? `Asked for: ${value}` : `Changed to: ${value}`) : undefined;
    setDecided((d) => ({ ...d, [g.id]: { status: decision, note, order: Object.keys(d).length } }));
    setLeaving({ gate: g, decision });
    setEditing(false);
    setFrontId(null);
    onDecide?.(g.id, decision, value);
    const rest = open.length - 1;
    setAnnounce(`${DONE[decision]}: ${g.action}. ${rest ? `${plural(rest, "request")} left` : "Nothing waits any more"}`);
    // Focus stays in the stack – on the next card's Approve, or the stack itself when it's empty
    requestAnimationFrame(() => (stackRef.current?.querySelector<HTMLElement>("[data-approve]") ?? stackRef.current)?.focus({ preventScroll: true }));
  };
  // Leaving Edit without deciding: the field goes away, so the focus goes back to Edit
  const stopEditing = () => {
    setEditing(false);
    requestAnimationFrame(() => stackRef.current?.querySelector<HTMLElement>("[data-edit]")?.focus({ preventScroll: true }));
  };
  const go = (step: number) => {
    if (open.length < 2) return;
    // The card under the focus is replaced – the focus moves on to the new one's Approve instead of falling to the page
    const inside = !!stackRef.current?.contains(document.activeElement);
    const nextGate = open[(index + step + open.length) % open.length];
    if (nextGate) setFrontId(nextGate.id);
    if (inside) requestAnimationFrame(() => stackRef.current?.querySelector<HTMLElement>("[data-approve]")?.focus({ preventScroll: true }));
  };
  const onStackKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("textarea")) return;
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else return;
    e.preventDefault();
  };

  /* ---------- The run in numbers ---------- */

  const stopped = done.find((g) => g.status === "rejected");
  const state = stopped ? "stopped" : open.length ? "waiting" : live ? "running" : "done";
  const STATE = { stopped: "Stopped", waiting: "Waiting on you", running: "Running", done: "Done" } as const;
  const holds = open.flatMap((g) => g.holds ?? []);
  const runText = stopped
    ? `Stopped at “${stopped.action}”`
    : open.length
      ? `Paused – ${holds.length ? `${plural(holds.length, "step")} ${holds.length === 1 ? "waits" : "wait"}` : "the run waits"} on ${plural(open.length, "gate")}`
      : live
        ? "Running – nothing waits"
        : gates.length
          ? "Every gate is through"
          : "No approvals in this run";

  // Requests that come in while you decide slide in behind the stack
  const [seenIds, setSeenIds] = useState<string[]>(() => gates.map((g) => g.id));
  const fresh = new Set(open.filter((g) => !seenIds.includes(g.id)).map((g) => g.id));
  useEffect(() => {
    const missing = gates.map((g) => g.id).filter((id) => !seenIds.includes(id));
    if (missing.length === 0) return;
    const t = window.setTimeout(() => {
      setSeenIds((prev) => [...prev, ...missing]);
    }, 0);
    return () => window.clearTimeout(t);
  }, [gates, seenIds]);

  return (
    <div className={["ui-gate", className].filter(Boolean).join(" ")} data-state={state}>
      <style href="ui-approval-gates" precedence="default">
        {css}
      </style>

      {/* The run at a glance: a quiet block of its own, as wide as the cards */}
      <div className="ui-gate__summary">
        <header className="ui-gate__bar">
          <span className="ui-gate__mark">
            <Mark />
          </span>
          <span className="ui-gate__title">{title}</span>
          {task && (
            <span className="ui-gate__task" dir="auto" title={task}>
              {task}
            </span>
          )}
          <span className="ui-gate__pill" data-state={state}>
            {(state === "waiting" || state === "running") && <span className="ui-gate__pulse" aria-hidden="true" />}
            {STATE[state]}
          </span>
        </header>

        <dl className="ui-gate__stats">
          <div className="ui-gate__stat">
            <dt>Waiting on you</dt>
            <dd>{open.length.toLocaleString("en-US")}</dd>
          </div>
          <div className="ui-gate__stat">
            <dt>Decided</dt>
            <dd>
              {done.length}/{gates.length}
            </dd>
          </div>
          <div className="ui-gate__stat" data-wide="">
            <dt>Run</dt>
            <dd>
              <span className="ui-gate__run" dir="auto" title={runText}>
                {runText}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="ui-gate__body">
        {/* The stack: the request to decide now on top, the others peeking out behind it */}
        <div
          ref={stackRef}
          className="ui-gate__stack"
          tabIndex={-1}
          role="group"
          aria-roledescription="stack"
          aria-label={open.length ? `${plural(open.length, "request")} waiting – ${front ? `${index + 1} of ${open.length}` : ""}` : "Nothing waits"}
          data-count={Math.min(stack.length, PEEK + 1)}
          style={{ "--ui-gate-front-h": `${frontH}px`, "--ui-gate-floor": `${floor}px` } as CSSProperties}
          onKeyDown={onStackKey}
        >
          <div className="ui-gate__pile">
            {/* The cards behind: only their top edge shows, a step smaller each – a click brings one forward */}
            {stack.slice(1, PEEK + 1).map((g, i) => (
              <button
                key={g.id}
                type="button"
                className="ui-gate__back"
                data-fresh={fresh.has(g.id) ? "" : undefined}
                style={{ "--ui-gate-k": i + 1 } as CSSProperties}
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => setFrontId(g.id)}
              >
                <span className="ui-gate__back-text" dir="auto">
                  {g.action}
                </span>
              </button>
            ))}

            {leaving && (
              <div className="ui-gate__card ui-gate__card--leaving" data-decision={leaving.decision} aria-hidden="true" key={`${leaving.gate.id}~out`}>
                <div className="ui-gate__card-top">
                  <span className="ui-gate__avatar">{leaving.gate.avatar ?? initials(leaving.gate.agent)}</span>
                  <span className="ui-gate__card-who">{leaving.gate.agent}</span>
                  <span className="ui-gate__badge" data-status={leaving.decision}>
                    {DONE[leaving.decision]}
                  </span>
                </div>
                <div className="ui-gate__card-body">
                  <p className="ui-gate__card-action">{leaving.gate.action}</p>
                </div>
              </div>
            )}

            {front ? (
              <section ref={frontRef} key={front.id} className="ui-gate__card" data-fresh={fresh.has(front.id) ? "" : undefined} aria-label={`${front.action} – waiting for you`}>
                <div className="ui-gate__card-top">
                  <span className="ui-gate__avatar" data-logo={front.avatar ? "" : undefined}>
                    {front.avatar ?? initials(front.agent)}
                  </span>
                  <span className="ui-gate__card-who" dir="auto">
                    <span className="ui-gate__card-agent">{front.agent}</span> · {KIND[front.kind]}
                    {front.at ? ` · ${front.at}` : ""}
                  </span>
                  <span className="ui-gate__badge" data-status="open">
                    <Lock />
                    Blocking
                  </span>
                </div>
                {/* What it wants and its data – one piece in this style, its own white card in the classic one */}
                <div className="ui-gate__card-body">
                  <h3 className="ui-gate__card-action" dir="auto">
                    {front.action}
                  </h3>
                  <p className="ui-gate__card-why" dir="auto">
                    {front.reason}
                  </p>

                  {(front.input || front.diff || editing) && (
                    <div className="ui-gate__section">
                      <span className="ui-gate__label">{editing && front.kind === "file" ? "What should change?" : DATA[front.kind]}</span>
                      {editing ? (
                        <textarea
                          className="ui-gate__edit"
                          data-mono={front.kind === "tool" ? "" : undefined}
                          value={draft}
                          rows={front.kind === "file" ? 3 : Math.min(9, Math.max(3, draft.split("\n").length + 1))}
                          spellCheck={front.kind !== "tool"}
                          placeholder={front.kind === "file" ? "e.g. Keep the old price for existing customers" : undefined}
                          aria-label={front.kind === "file" ? "What should change" : `Edit ${DATA[front.kind].toLowerCase()}`}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              stopEditing();
                            }
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
                              e.preventDefault();
                              decide(front, "edited", draft);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <GateData gate={front} full={more} />
                      )}
                    </div>
                  )}

                  {/* The rest folds: the steps before and the files it touches */}
                  {(front.context?.length || front.files?.length) && (
                    <div className="ui-gate__extra">
                      <button type="button" className="ui-gate__more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                        {more ? "Less context" : "Full context"}
                        <span className="ui-gate__more-chev" data-open={more ? "" : undefined}>
                          <Chevron />
                        </span>
                      </button>
                      <div className="ui-gate__fold" data-open={more ? "" : undefined} inert={more ? undefined : true}>
                        <div className="ui-gate__fold-in">
                          <GateContext gate={front} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="ui-gate__actions">
                  {editing ? (
                    <>
                      <button type="button" className="ui-gate__btn" data-quiet="" onClick={stopEditing}>
                        Cancel
                      </button>
                      <button type="button" className="ui-gate__btn" data-primary="" disabled={!draft.trim()} onClick={() => decide(front, "edited", draft)}>
                        Approve with changes
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ui-gate__btn"
                        data-quiet=""
                        data-edit=""
                        onClick={() => {
                          setDraft(front.kind === "file" ? "" : (front.input ?? ""));
                          setEditing(true);
                        }}
                      >
                        <Pen />
                        {front.kind === "file" ? "Ask for changes" : "Edit"}
                      </button>
                      <span className="ui-gate__spacer" />
                      <button type="button" className="ui-gate__btn" onClick={() => decide(front, "rejected")}>
                        Reject
                      </button>
                      <button type="button" className="ui-gate__btn" data-primary="" data-approve="" onClick={() => decide(front, "approved")}>
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <div className="ui-gate__card ui-gate__card--empty" key="empty">
                <span className="ui-gate__empty-mark" data-state={state} aria-hidden="true">
                  {stopped ? <Cross /> : <Check />}
                </span>
                <p className="ui-gate__empty-title">
                  {stopped ? "The run stopped" : live ? "Nothing waits for you" : gates.length ? "Every gate is through" : "No approvals in this run"}
                </p>
                <p className="ui-gate__empty-sub">
                  {stopped
                    ? `“${stopped.action}” was rejected – nothing after it runs`
                    : live
                      ? "New requests show up here as the agents ask"
                      : "The run needed you for nothing else"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Under the card: what it holds up, and – with more than one waiting – the way through them; always there, so
            nothing below moves when one comes or goes */}
        <div className="ui-gate__after">
          <div className="ui-gate__pager" data-off={open.length > 1 ? undefined : ""} inert={open.length > 1 ? undefined : true}>
            <button type="button" className="ui-gate__page" aria-label="Previous request" onClick={() => go(-1)}>
              <Chevron dir="left" />
            </button>
            <span className="ui-gate__page-n" aria-hidden="true">
              {index + 1} of {open.length}
            </span>
            <button type="button" className="ui-gate__page" aria-label="Next request" onClick={() => go(1)}>
              <Chevron dir="right" />
            </button>
          </div>
          {front?.holds?.length ? (
            <p className="ui-gate__holds" key={front.id} title={front.holds.join(", ")}>
              <Lock />
              <span>
                Holds {plural(front.holds.length, "step")}: <span className="ui-gate__held">{front.holds.join(", ")}</span>
              </span>
            </p>
          ) : null}
        </div>

        {/* And what's been decided – newest first; a rejected gate stays as the point where the run stopped */}
        {done.length > 0 && (
          <div className="ui-gate__done">
            <span className="ui-gate__label">Decided</span>
            <ol className="ui-gate__rows">
              {done.map((g) => {
                const isOpen = openRow === g.id;
                return (
                  <li key={g.id} className="ui-gate__row" data-status={g.status} data-fresh={decided[g.id] ? "" : undefined} data-open={isOpen ? "" : undefined}>
                    <button type="button" className="ui-gate__row-head" aria-expanded={isOpen} onClick={() => setOpenRow(isOpen ? null : g.id)}>
                      <span className="ui-gate__row-mark" data-status={g.status} aria-hidden="true">
                        {g.status === "rejected" ? <Cross /> : <Check />}
                      </span>
                      <span className="ui-gate__row-action" dir="auto" title={g.action}>
                        {g.action}
                      </span>
                      <span className="ui-gate__row-who" dir="auto">
                        {g.agent}
                      </span>
                      <span className="ui-gate__row-outcome" data-status={g.status}>
                        {/* Where the run stopped: a light red tag – the row itself stays as clean as the others */}
                        {g.status === "rejected" ? <span className="ui-gate__row-tag">Stopped the run</span> : DONE[g.status as GateDecision]}
                        {g.at && <span className="ui-gate__row-at"> · {g.at}</span>}
                      </span>
                      <span className="ui-gate__row-chev" data-open={isOpen ? "" : undefined}>
                        <Chevron />
                      </span>
                    </button>
                    <div className="ui-gate__fold" data-open={isOpen ? "" : undefined} inert={isOpen ? undefined : true}>
                      <div className="ui-gate__fold-in ui-gate__row-body">
                        <p className="ui-gate__card-why" dir="auto">
                          {g.reason}
                        </p>
                        {g.note && (
                          <p className="ui-gate__note" data-status={g.status} dir="auto">
                            {g.note}
                          </p>
                        )}
                        {(g.input || g.diff) && (
                          <div className="ui-gate__section">
                            <span className="ui-gate__label">{DATA[g.kind]}</span>
                            <GateData gate={g} full={false} />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      <span className="ui-gate__sr" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

const css = /* css */ `
/* Colors, sizes and motion as variables – override them on .ui-gate */
.ui-gate {
  --ui-gate-tray: var(--aui-subtle, #f0f0f0);
  --ui-gate-card: #ffffff;
  --ui-gate-strong: var(--aui-ink, #171717);
  --ui-gate-ink: var(--aui-ink, #171717);
  --ui-gate-text: var(--aui-muted, #6b6b6b);
  --ui-gate-muted: var(--aui-muted, #8a8a8a);
  --ui-gate-faint: var(--aui-placeholder, #b8b8b8);
  --ui-gate-line: var(--aui-border, #ececec);
  --ui-gate-fill: var(--aui-subtle, #f2f2f2);
  --ui-gate-well: #f7f7f7;
  --ui-gate-rail: #d6d6d6;
  --ui-gate-wait-bg: #fff1e0;
  --ui-gate-wait-fg: var(--aui-warning, #b25e00);
  --ui-gate-ok-bg: #e8f6ee;
  --ui-gate-ok-fg: var(--aui-success, #1e8a4f);
  --ui-gate-danger-bg: #fdecea;
  --ui-gate-danger-fg: var(--aui-danger, #c4320a);
  --ui-gate-brand-bg: #eaf1ff;
  --ui-gate-brand-fg: #2f6bff;
  --ui-gate-add-bg: #eaf7ef;
  --ui-gate-add-fg: var(--aui-success, #1e8a4f);
  --ui-gate-del-bg: #fdeeec;
  --ui-gate-del-fg: var(--aui-danger, #c4320a);
  --ui-gate-focus: var(--aui-focus, rgba(0, 96, 226, 0.7));
  --ui-gate-solid: var(--aui-primary, #171717);
  --ui-gate-on-solid: var(--aui-on-primary, #ffffff);
  /* A 1px edge and a soft lift; the card on top floats a little higher */
  --ui-gate-shadow: 0 0 0 1px var(--ui-gate-line), 0 1px 2px rgba(0, 0, 0, 0.04);
  --ui-gate-float: 0 0 0 1px var(--ui-gate-line), 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 28px -12px rgba(0, 0, 0, 0.14);
  --ui-gate-mono: var(--aui-font-mono, ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace);
  --ui-gate-ease: cubic-bezier(0.32, 0.72, 0.24, 1);
  /* How wide the block, the cards and the list are – all the same */
  --ui-gate-w: 560px;
  /* The stack: how far each card behind peeks out, and how much smaller it is */
  --ui-gate-peek: 11px;
  --ui-gate-shrink: 0.05;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  container: ui-gate / inline-size;
  font-family: var(--aui-font, "Inter", "InterVariable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  color: var(--ui-gate-text);
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.ui-gate *, .ui-gate *::before, .ui-gate *::after { box-sizing: border-box; }
:where(.ui-gate) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ui-gate button:focus-visible { outline: 2px solid var(--ui-gate-focus); outline-offset: 2px; }
/* Typing in a field: no ring – the caret shows where you are, the edge only firms up a little */
.ui-gate textarea:focus-visible { outline: none; }
.ui-gate :is(p, dl, dd, ol, ul, pre, h3) { margin: 0; }
.ui-gate :is(ol, ul) { padding: 0; list-style: none; }
.ui-gate svg { display: block; flex: none; }
.ui-gate__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* ----- The run at a glance: title, task and state over the numbers – a quiet block, as wide as the cards ----- */
.ui-gate__summary { width: min(100%, var(--ui-gate-w)); margin: 0 auto 14px; padding: 4px; border-radius: var(--aui-radius-lg, 16px); background: var(--ui-gate-tray); }
.ui-gate__bar { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 6px 8px 8px; }
.ui-gate__mark { display: grid; flex: none; place-items: center; width: 16px; color: var(--ui-gate-muted); }
.ui-gate__title { flex: none; font-weight: 500; color: var(--ui-gate-strong); white-space: nowrap; }
.ui-gate__task { flex: 1; min-width: 0; overflow: hidden; color: var(--ui-gate-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__pill { display: inline-flex; flex: none; align-items: center; gap: 5px; height: 20px; margin-left: auto; padding: 0 7px; border-radius: calc(var(--aui-radius-sm, 7px) - 2px); background: var(--ui-gate-fill); font-size: 11.5px; font-weight: 500; line-height: 16px; color: var(--ui-gate-text); white-space: nowrap; }
.ui-gate__pill[data-state="waiting"] { background: var(--ui-gate-wait-bg); color: var(--ui-gate-wait-fg); }
.ui-gate__pill[data-state="running"] { background: var(--ui-gate-brand-bg); color: var(--ui-gate-brand-fg); }
.ui-gate__pill[data-state="done"] { background: var(--ui-gate-ok-bg); color: var(--ui-gate-ok-fg); }
.ui-gate__pill[data-state="stopped"] { background: var(--ui-gate-danger-bg); color: var(--ui-gate-danger-fg); }
.ui-gate__pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: ui-gate-pulse 1400ms ease-in-out infinite; }

/* ----- The run in numbers ----- */
.ui-gate__stats { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 0.6fr) minmax(0, 2fr); padding: 9px 0 10px;  border-radius: calc(var(--aui-radius-lg, 16px) - 4px); background: var(--aui-surface, var(--ui-gate-card)); box-shadow: var(--aui-shadow-card, var(--ui-gate-shadow)); }
.ui-gate__stat { display: grid; gap: 1px; min-width: 0; padding: 0 12px; }
.ui-gate__stat:first-child { padding-left: 12px; }
.ui-gate__stat + .ui-gate__stat { border-left: 1px solid var(--ui-gate-line); }
.ui-gate__stat dt { overflow: hidden; font-size: 10px; font-weight: 500; line-height: 16px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--ui-gate-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__stat dd { display: flex; min-width: 0; overflow: hidden; font-size: 13px; font-weight: 500; line-height: 20px; color: var(--ui-gate-ink); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ui-gate__run { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* ----- The middle: the steps before, the stack, what it holds, what's decided ----- */
/* One column that never grows past the width it has – a long title ends in … instead of pushing everything aside */
.ui-gate__body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; }


/* The stack: centered, as wide as reads well */
.ui-gate__stack { position: relative; display: grid; justify-items: center; gap: 8px; width: min(100%, var(--ui-gate-w)); margin: 0 auto; outline: none; }
.ui-gate__pager { display: flex; flex: none; align-items: center; gap: 2px; order: 2; margin: -4px -2px -4px 0; transition: opacity 200ms ease; }
.ui-gate__pager[data-off] { opacity: 0; }
.ui-gate__page { display: grid; place-items: center; width: 24px; height: 24px; border-radius: calc(var(--aui-radius-sm, 7px) - 1px); color: var(--ui-gate-muted); transition: background-color 140ms ease, color 140ms ease; }
.ui-gate__page:hover { background: var(--ui-gate-fill); color: var(--ui-gate-ink); }
.ui-gate__page-n { min-width: 44px; font-size: 12px; line-height: 16px; text-align: center; color: var(--ui-gate-muted); font-variant-numeric: tabular-nums; }
/* Room above the card on top for the ones peeking out behind it – always for two, and never less than the tallest card
   so far, so what's below stays where it is */
.ui-gate__pile { position: relative; display: grid; align-content: start; width: 100%; min-height: calc(var(--ui-gate-floor, 0px) + var(--ui-gate-peek) * ${PEEK}); padding-top: calc(var(--ui-gate-peek) * ${PEEK}); }

.ui-gate__back {
  position: absolute;
  top: calc(var(--ui-gate-peek) * ${PEEK});
  left: 0;
  right: 0;
  height: var(--ui-gate-front-h);
  border-radius: var(--aui-radius-lg, 16px);
  background: var(--ui-gate-tray);
  box-shadow: var(--aui-shadow-card, var(--ui-gate-shadow));
  transform: translateY(calc(var(--ui-gate-k) * var(--ui-gate-peek) * -1)) scale(calc(1 - var(--ui-gate-k) * var(--ui-gate-shrink)));
  transform-origin: top center;
  opacity: calc(1 - var(--ui-gate-k) * 0.22);
  transition: transform 360ms var(--ui-gate-ease), opacity 300ms ease;
  z-index: calc(3 - var(--ui-gate-k));
}
.ui-gate__back:hover { opacity: 1; }
.ui-gate__back[data-fresh] { animation: ui-gate-behind 420ms var(--ui-gate-ease) both; }
/* Only the top edge shows – the action, faint, so you can tell what's next */
.ui-gate__back-text { position: absolute; top: 0; right: 16px; left: 16px; height: var(--ui-gate-peek); overflow: hidden; font-size: 0; }

.ui-gate__card { position: relative; z-index: 4; display: flex; flex-direction: column; gap: 0; min-width: 0; padding: 4px; border-radius: var(--aui-radius-lg, 16px); background: var(--ui-gate-tray); box-shadow: var(--ui-gate-float); animation: ui-gate-rise 380ms var(--ui-gate-ease) both; }
/* Every card fills the room of the tallest so far – a shorter one keeps its buttons at the bottom, so nothing jumps */
.ui-gate__card:not(.ui-gate__card--leaving) { min-height: var(--ui-gate-floor, 0px); }
.ui-gate__card > .ui-gate__actions { padding: 6px 2px 2px; }
.ui-gate__card[data-fresh] { animation: ui-gate-in 420ms var(--ui-gate-ease) both; }
/* Decided: it drops out of the stack, down towards the list where it lands */
.ui-gate__card--leaving { position: absolute; top: calc(var(--ui-gate-peek) * ${PEEK}); right: 0; left: 0; z-index: 5; pointer-events: none; animation: ui-gate-leave ${LEAVE}ms var(--ui-gate-ease) both; }
.ui-gate__card--leaving[data-decision="rejected"] { animation-name: ui-gate-leave-no; }
.ui-gate__card-body { display: flex; flex: 1; flex-direction: column; gap: 10px; min-width: 0; padding: 12px; border-radius: calc(var(--aui-radius-lg, 16px) - 4px); background: var(--aui-surface, var(--ui-gate-card)); box-shadow: var(--aui-shadow-card, var(--ui-gate-shadow)); }
.ui-gate__card-top { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 4px 8px 6px; }
.ui-gate__avatar { display: grid; flex: none; place-items: center; width: 20px; height: 20px; border-radius: 5px; background: var(--ui-gate-card); box-shadow: var(--ui-gate-shadow); font-size: 9px; font-weight: 600; line-height: 1; color: var(--ui-gate-text); }
.ui-gate__avatar[data-logo] > svg { width: 12px; height: 12px; }
.ui-gate__card-who { flex: 1; min-width: 0; overflow: hidden; font-size: 12px; line-height: 16px; color: var(--ui-gate-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__card-agent { color: var(--ui-gate-text); }
.ui-gate__badge { display: inline-flex; flex: none; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: calc(var(--aui-radius-sm, 7px) - 2px); background: var(--ui-gate-fill); font-size: 11.5px; font-weight: 500; line-height: 16px; color: var(--ui-gate-text); white-space: nowrap; }
.ui-gate__badge[data-status="open"] { background: var(--ui-gate-wait-bg); color: var(--ui-gate-wait-fg); }
.ui-gate__badge:is([data-status="approved"], [data-status="edited"]) { background: var(--ui-gate-ok-bg); color: var(--ui-gate-ok-fg); }
.ui-gate__badge[data-status="rejected"] { background: var(--ui-gate-danger-bg); color: var(--ui-gate-danger-fg); }
.ui-gate__card-action { overflow-wrap: anywhere; font-size: 15px; font-weight: 500; line-height: 22px; color: var(--ui-gate-strong); }
.ui-gate__card-why { margin-top: -6px; overflow-wrap: anywhere; font-size: 12.5px; line-height: 18px; color: var(--ui-gate-text); }
.ui-gate__section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; }
.ui-gate__label { font-size: 10px; font-weight: 500; line-height: 16px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--ui-gate-muted); }

/* The data: short on the card, all of it with the full context */
.ui-gate__data,
.ui-gate__diff { max-height: 128px; overflow: auto; overscroll-behavior: contain; border-radius: calc(var(--aui-radius-lg, 16px) - 8px); background: var(--ui-gate-well); box-shadow: inset 0 0 0 1px var(--ui-gate-line); scrollbar-width: thin; outline: none; transition: max-height 300ms var(--ui-gate-ease); }
.ui-gate :is(.ui-gate__data, .ui-gate__diff)[data-full] { max-height: 260px; }
.ui-gate__data { padding: 8px 10px; font: inherit; font-size: 12px; line-height: 18px; color: var(--ui-gate-ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.ui-gate .ui-gate__context:focus-visible { outline: 2px solid var(--ui-gate-focus); outline-offset: -2px; }
.ui-gate :is(.ui-gate__data, .ui-gate__diff):focus-visible { outline: 2px solid var(--ui-gate-focus); outline-offset: -2px; }
.ui-gate__data[data-mono], .ui-gate__edit[data-mono] { font-family: var(--ui-gate-mono); font-size: 11.5px; }
.ui-gate__diff { display: grid; gap: 8px; padding: 6px 0; }
.ui-gate__file { display: grid; gap: 4px; min-width: 0; }
.ui-gate__file-name { min-width: 0; overflow: hidden; padding: 0 10px; font-family: var(--ui-gate-mono); font-size: 11px; line-height: 16px; color: var(--ui-gate-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__file pre { font-family: var(--ui-gate-mono); font-size: 11.5px; line-height: 18px; color: var(--ui-gate-ink); white-space: pre-wrap; overflow-wrap: anywhere; }
/* Wrapped lines hang under the text, not under the +/− */
.ui-gate__dl { display: block; padding: 0 10px 0 22px; text-indent: -14px; }
.ui-gate__dl > span:first-child { display: inline-block; width: 14px; text-indent: 0; color: var(--ui-gate-faint); }
.ui-gate__dl[data-type="add"] { background: var(--ui-gate-add-bg); color: var(--ui-gate-add-fg); }
.ui-gate__dl[data-type="del"] { background: var(--ui-gate-del-bg); color: var(--ui-gate-del-fg); }
.ui-gate__dl:not([data-type="ctx"]) > span:first-child { color: inherit; }
.ui-gate__edit { width: 100%; min-height: 72px; padding: 8px 10px; border: 0; border-radius: calc(var(--aui-radius, 10px) - 2px); background: var(--aui-surface, var(--ui-gate-card)); box-shadow: inset 0 0 0 1px var(--ui-gate-faint); font: inherit; font-size: 12px; line-height: 18px; color: var(--ui-gate-ink); resize: vertical; outline: none; }
.ui-gate__edit::placeholder { color: var(--ui-gate-faint); }

.ui-gate__extra { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; }
.ui-gate__fold[data-open] > .ui-gate__fold-in:not(.ui-gate__row-body) { padding-top: 10px; }
.ui-gate__more { display: inline-flex; align-items: center; justify-self: start; gap: 4px; height: 22px; margin: -2px 0 -4px -6px; padding: 0 6px; border-radius: calc(var(--aui-radius-sm, 7px) - 2px); font-size: 12px; font-weight: 500; line-height: 16px; color: var(--ui-gate-text); transition: background-color 140ms ease, color 140ms ease; }
.ui-gate__more:hover { background: var(--ui-gate-fill); color: var(--ui-gate-ink); }
.ui-gate__more-chev, .ui-gate__row-chev { display: grid; color: var(--ui-gate-faint); transition: transform 240ms var(--ui-gate-ease); }
:is(.ui-gate__more-chev, .ui-gate__row-chev)[data-open] { transform: rotate(180deg); }
.ui-gate__fold { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 0fr; transition: grid-template-rows 300ms var(--ui-gate-ease); }
.ui-gate__fold[data-open] { grid-template-rows: 1fr; }
.ui-gate__fold-in { display: grid; gap: 10px; min-height: 0; overflow: hidden; opacity: 0; transition: opacity 200ms ease; }
.ui-gate__fold[data-open] .ui-gate__fold-in { opacity: 1; }
/* A long history scrolls in its own box, so the card stays a card */
.ui-gate__context { display: grid; gap: 2px; max-height: 168px; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; outline: none; border-radius: 6px; counter-reset: ui-gate-step; }
.ui-gate__context > li { position: relative; min-width: 0; padding-left: 20px; font-size: 12px; line-height: 18px; color: var(--ui-gate-text); overflow-wrap: anywhere; counter-increment: ui-gate-step; }
.ui-gate__context > li::before { content: counter(ui-gate-step); position: absolute; left: 0; width: 14px; font-size: 11px; color: var(--ui-gate-faint); text-align: right; font-variant-numeric: tabular-nums; }
.ui-gate__files { display: flex; flex-wrap: wrap; gap: 6px; }
.ui-gate__files > li { max-width: 100%; overflow: hidden; padding: 2px 7px; border-radius: calc(var(--aui-radius-sm, 7px) - 2px); background: var(--ui-gate-fill); font-family: var(--ui-gate-mono); font-size: 11.5px; line-height: 16px; color: var(--ui-gate-text); white-space: nowrap; text-overflow: ellipsis; }

.ui-gate__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 4px; }
.ui-gate__spacer { flex: 1; }
.ui-gate__actions > .ui-gate__btn[data-quiet]:first-child:nth-last-child(2) { margin-left: auto; }
.ui-gate__btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: calc(var(--aui-radius, 10px) - 3px); background: var(--aui-surface, var(--ui-gate-card)); box-shadow: var(--aui-shadow-card, var(--ui-gate-shadow)); font-size: 13px; font-weight: 500; line-height: 16px; color: var(--ui-gate-ink); white-space: nowrap; transition: background-color 140ms ease, opacity 140ms ease; }
.ui-gate__btn:hover { background: var(--ui-gate-well); }
.ui-gate__btn:active:not(:disabled) { transform: scale(0.97); }
.ui-gate__btn[data-primary] { background: var(--ui-gate-solid); box-shadow: none; color: var(--ui-gate-on-solid); }
.ui-gate__btn[data-primary]:hover { background: var(--ui-gate-solid); opacity: 0.88; }
.ui-gate__btn[data-quiet] { padding: 0 8px 0 6px; background: none; box-shadow: none; color: var(--ui-gate-text); }
.ui-gate__btn[data-quiet]:hover { background: var(--ui-gate-fill); color: var(--ui-gate-ink); }
.ui-gate__btn:disabled { opacity: 0.4; cursor: default; }
.ui-gate__btn > svg { color: var(--ui-gate-muted); }

/* Nothing waits – the run is through, stopped or idle: a flat gray area in the stack's place, no edge, no lift */
.ui-gate__card--empty { align-items: center; justify-content: center; gap: 4px; padding: 22px 16px; background: var(--ui-gate-well); box-shadow: none; text-align: center; }
.ui-gate__empty-mark { display: grid; place-items: center; width: 26px; height: 26px; margin-bottom: 4px; border-radius: 50%; background: var(--ui-gate-ok-bg); color: var(--ui-gate-ok-fg); }
.ui-gate__empty-mark[data-state="stopped"] { background: var(--ui-gate-danger-bg); color: var(--ui-gate-danger-fg); }
.ui-gate__empty-mark > svg { width: 12px; height: 12px; }
.ui-gate__empty-title { font-weight: 500; color: var(--ui-gate-ink); }
.ui-gate__empty-sub { font-size: 12px; line-height: 18px; color: var(--ui-gate-muted); overflow-wrap: anywhere; }

/* What the card on top holds up */
.ui-gate__after { display: flex; align-items: center; gap: 12px; width: min(100%, var(--ui-gate-w)); min-height: 36px; margin: 0 auto; padding: 10px 2px 0; }
.ui-gate__holds { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; font-size: 12px; line-height: 16px; color: var(--ui-gate-wait-fg); animation: ui-gate-fade 300ms ease both; }
.ui-gate__holds > span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__held { color: var(--ui-gate-muted); }

/* What's been decided: quiet rows; a rejected one stays marked as where the run stopped */
.ui-gate__done { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; width: min(100%, var(--ui-gate-w)); padding: 4px; border-radius: calc(var(--aui-radius-lg, 16px) - 2px); background: var(--ui-gate-tray); margin: 6px auto 0; }
.ui-gate__done > .ui-gate__label { padding: 2px 8px 0; }
.ui-gate__rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px; }
.ui-gate__row { border-radius: calc(var(--aui-radius-sm, 7px) + 2px); background: var(--aui-surface, var(--ui-gate-card)); box-shadow: var(--aui-shadow-card, var(--ui-gate-shadow)); }
.ui-gate__row[data-fresh] { animation: ui-gate-land 420ms 120ms var(--ui-gate-ease) both; }
.ui-gate__row-head { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; height: 32px; padding: 0 9px; border-radius: calc(var(--aui-radius-sm, 7px) + 2px); transition: background-color 140ms ease; }
.ui-gate__row-head:hover { background: var(--ui-gate-well); }
.ui-gate .ui-gate__row-head:focus-visible { outline: 2px solid var(--ui-gate-focus); outline-offset: -2px; }
.ui-gate__row-mark { display: grid; flex: none; place-items: center; width: 14px; height: 14px; border-radius: 50%; background: var(--ui-gate-fill); color: var(--ui-gate-muted); }
.ui-gate__row-mark[data-status="rejected"] { background: var(--ui-gate-danger-bg); color: var(--ui-gate-danger-fg); }
.ui-gate__row-action { flex: 1 1 auto; min-width: 0; overflow: hidden; font-size: 12px; font-weight: 500; color: var(--ui-gate-ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__row-who { flex: 0 1 auto; min-width: 0; overflow: hidden; font-size: 11.5px; color: var(--ui-gate-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-gate__row-outcome { display: inline-flex; flex: none; align-items: center; font-size: 11.5px; line-height: 16px; color: var(--ui-gate-text); white-space: pre; }
.ui-gate__row-tag { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: calc(var(--aui-radius-sm, 7px) - 2px); background: var(--ui-gate-danger-bg); font-size: 11px; font-weight: 500; line-height: 16px; color: var(--ui-gate-danger-fg); }
.ui-gate__row-at { color: var(--ui-gate-faint); }
.ui-gate__row-body { gap: 6px; padding: 0 10px 0 31px; }
.ui-gate__row[data-open] .ui-gate__row-body { padding: 0 10px 10px 31px; }
/* Open, a row stays short: why, what was said, and a few lines of the data – the rest scrolls */
.ui-gate__row-body :is(.ui-gate__data, .ui-gate__diff) { max-height: 88px; }
.ui-gate__row-body .ui-gate__card-why { font-size: 12px; }
.ui-gate__row-body .ui-gate__card-why { margin-top: 0; }
.ui-gate__note { padding: 8px 10px; border-radius: calc(var(--aui-radius-lg, 16px) - 8px); background: var(--ui-gate-well); font-size: 12px; line-height: 18px; color: var(--ui-gate-text); overflow-wrap: anywhere; }
.ui-gate__note[data-status="rejected"] { background: var(--ui-gate-danger-bg); color: var(--ui-gate-danger-fg); }

/* ----- Narrow: the numbers wrap, the rows lose the agent ----- */
@container ui-gate (max-width: 560px) {
  .ui-gate__task { display: none; }
  .ui-gate__stats { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 8px; }
  .ui-gate__stat[data-wide] { grid-column: 1 / -1; padding-left: 12px; border-left: 0; }
  .ui-gate__card-body { padding: 10px; }
  .ui-gate__row-who { display: none; }
}
@media (pointer: coarse) {
  .ui-gate__btn { height: 36px; padding: 0 14px; }
  .ui-gate__page { width: 32px; height: 32px; }
  .ui-gate__more { height: 32px; }
}

@keyframes ui-gate-fade { from { opacity: 0; } }
@keyframes ui-gate-rise { from { opacity: 0.6; transform: translateY(calc(var(--ui-gate-peek) * -1)) scale(0.96); } }
@keyframes ui-gate-in { from { opacity: 0; transform: translateY(-14px) scale(0.97); } }
@keyframes ui-gate-behind { from { opacity: 0; transform: translateY(calc(var(--ui-gate-k) * var(--ui-gate-peek) * -1 - 12px)) scale(0.9); } }
@keyframes ui-gate-leave { to { opacity: 0; transform: translateY(36px) scale(0.96); } }
@keyframes ui-gate-leave-no { 20% { transform: translateX(-4px); } 40% { transform: translateX(3px); } to { opacity: 0; transform: translateY(36px) scale(0.96); } }
@keyframes ui-gate-land { from { opacity: 0; transform: translateY(-10px) scale(0.98); } }
@keyframes ui-gate-pulse { 50% { opacity: 0.35; } }

@media (prefers-reduced-motion: reduce) {
  .ui-gate *, .ui-gate *::before, .ui-gate *::after { animation: none !important; transition: none !important; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-gate {
  --ui-gate-tray: var(--aui-subtle, #19191c);
  --ui-gate-card: #232326;
  --ui-gate-strong: var(--aui-ink, #ededed);
  --ui-gate-ink: var(--aui-ink, #ededed);
  --ui-gate-text: var(--aui-muted, #a1a1a6);
  --ui-gate-muted: var(--aui-muted, #7c7c82);
  --ui-gate-faint: var(--aui-placeholder, #4a4a50);
  --ui-gate-line: var(--aui-border, #2f2f34);
  --ui-gate-fill: var(--aui-subtle, #2c2c30);
  --ui-gate-well: #28282b;
  --ui-gate-rail: #3a3a40;
  --ui-gate-wait-bg: #3a2712;
  --ui-gate-wait-fg: var(--aui-warning, #ffb35c);
  --ui-gate-ok-bg: #163022;
  --ui-gate-ok-fg: var(--aui-green, #5fc88a);
  --ui-gate-danger-bg: #3b1c14;
  --ui-gate-danger-fg: var(--aui-danger, #ff8a7a);
  --ui-gate-brand-bg: #1b2b4a;
  --ui-gate-brand-fg: #8ab4ff;
  --ui-gate-add-bg: #163022;
  --ui-gate-add-fg: var(--aui-green, #5fc88a);
  --ui-gate-del-bg: #3b1c14;
  --ui-gate-del-fg: var(--aui-danger, #ff8a7a);
  --ui-gate-focus: var(--aui-focus, rgba(77, 141, 255, 0.8));
  --ui-gate-solid: var(--aui-primary, #ededed);
  --ui-gate-on-solid: var(--aui-on-primary, #141416);
  --ui-gate-shadow: 0 0 0 1px var(--ui-gate-line), 0 1px 2px rgba(0, 0, 0, 0.3);
  --ui-gate-float: 0 0 0 1px var(--ui-gate-line), 0 12px 28px -10px rgba(0, 0, 0, 0.6);
}
`;
