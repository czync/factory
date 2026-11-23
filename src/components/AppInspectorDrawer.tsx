import { useId, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Database,
  ExternalLink,
  FileCode2,
  GitBranch,
  Lock,
  RefreshCw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { useFactory } from '@/data/store';
import {
  PROGRAM_TOTALS,
  STAGE_LABELS,
  STAGE_ORDER,
  WP_LABELS,
  type AgentCorePrReview,
  type DependencyFact,
  type InspectorTab,
  type MigrationUnit,
  type OnboardingStep,
  type TracePrItem,
} from '@/data/types';
import { shortHash } from '@/lib/crypto';
import {
  Badge,
  Button,
  CopyCommandBar,
  EmptyState,
  HairlineTabs,
  StatusDot,
  Tooltip,
  type SignalTone,
} from './ui/Primitives';
import { SlideDrawer } from './ui/SlideDrawer';
import { BlurCrossfade } from './uipros/blur-crossfade';
import { ProgressTracker, type ProgressStep } from './uipros/progress-tracker-clean';
import { ShimmerText } from './uipros/shimmer-loader';
import { TraceWaterfall, type TraceSpan } from './uipros/trace-waterfall-clean';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    return true;
  } catch {
    return false;
  }
}

function getReviewTone(state: TracePrItem['reviewState']): { tone: SignalTone; label: string } {
  switch (state) {
    case 'APPROVED':
      return { tone: 'ok', label: '已批准' };
    case 'MERGED':
      return { tone: 'ok', label: '已合并' };
    case 'CHANGES_REQUESTED':
      return { tone: 'danger', label: '需修改' };
    case 'PENDING':
      return { tone: 'warn', label: '待评审' };
  }
}

function getWp00Tone(status: MigrationUnit['wp00']['status']): { tone: SignalTone; label: string } {
  switch (status) {
    case 'PARITY_VERIFIED':
      return { tone: 'ok', label: '等价双跑通过' };
    case 'SEALED':
      return { tone: 'ok', label: '基线已封存' };
    case 'DUAL_RUN_DIFF':
      return { tone: 'danger', label: '双跑存在差异' };
    case 'CAPTURING':
      return { tone: 'warn', label: '采集中' };
    case 'NOT_STARTED':
      return { tone: 'neutral', label: '未建立基线' };
  }
}

function getDepSourceMeta(dep: DependencyFact): { label: string; tone: SignalTone } {
  switch (dep.source) {
    case 'CODE_STATIC':
      return { label: 'Static Code', tone: 'neutral' };
    case 'DB_RUNTIME_LOG':
      return {
        label: 'DB Runtime Audit Log',
        tone: dep.unregisteredImplicit ? 'danger' : 'warn',
      };
    case 'BOTH':
      return { label: 'Static + Runtime', tone: 'accent' };
    case 'HUMAN_CONFIRMED':
      return { label: 'Human Confirmed', tone: 'ok' };
  }
}

function getOnboardingStepIcon(status: OnboardingStep['status']) {
  switch (status) {
    case 'DONE':
      return <CheckCircle2 aria-hidden="true" />;
    case 'BLOCKED':
      return <Lock aria-hidden="true" />;
    case 'WAITING_APPROVAL':
      return <Clock aria-hidden="true" />;
    case 'READY':
      return <Bookmark aria-hidden="true" />;
  }
}

function buildAutoReviewTrace(
  pr: TracePrItem,
  autoReview: AgentCorePrReview,
  isRerunning: boolean,
): { root: TraceSpan; now: number } {
  const totalMs = Math.max(4000, autoReview.durationSec * 1000);
  const liveMs = Math.round(totalMs * 0.68);
  const toolCount = autoReview.gatewayToolsUsed.length;

  const toolSpans: TraceSpan[] = autoReview.gatewayToolsUsed.map((toolName, idx) => {
    const start = Math.round(totalMs * (0.04 + idx * 0.045));
    const spanDur = Math.round(totalMs * (0.16 + ((idx * 5 + toolName.length) % 4) * 0.03));
    const end = Math.min(Math.round(totalMs * 0.38), start + spanDur);
    return {
      id: `${pr.prNumber}-mcp-${toolName}-${idx}`,
      name: toolName,
      kind: 'tool',
      status: 'done',
      start,
      end,
      detail: 'Gateway MCP · READ_ONLY',
      input: `Cedar ${autoReview.cedarPolicy} · ${pr.prNumber} (${pr.branch})`,
      output: `200 OK · ${toolName} read-only context loaded`,
    };
  });

  const reviewerSpans: TraceSpan[] = autoReview.findings.map((finding, idx) => {
    const start = Math.round(totalMs * (0.32 + idx * 0.06));
    const weight =
      finding.reviewer === 'Migration-Semantics'
        ? 0.44
        : finding.reviewer === 'Blast-Radius'
          ? 0.36
          : 0.28;
    const plannedEnd = Math.min(Math.round(totalMs * 0.86), start + Math.round(totalMs * weight));
    const running = isRerunning && (idx > 0 || autoReview.findings.length === 1);
    const tokensIn =
      1280 + finding.summary.length * 16 + (finding.graphImpactNodes ?? 0) * 14;
    const tokensOut = 240 + finding.summary.length * 4;
    const cost = Number((tokensIn * 0.000003 + tokensOut * 0.000015).toFixed(4));

    return {
      id: `${pr.prNumber}-rev-${finding.reviewer}`,
      name: `${finding.reviewer} Reviewer`,
      kind: 'llm',
      status: running ? 'running' : finding.severity === 'BLOCK' ? 'failed' : 'done',
      start,
      end: running ? undefined : plannedEnd,
      detail:
        finding.graphImpactNodes !== undefined
          ? `${finding.graphImpactNodes} nodes · ${finding.severity}`
          : finding.severity,
      model: autoReview.bedrockModel,
      tokensIn,
      tokensOut,
      cost,
      input: `Evaluate ${pr.prNumber} (${pr.wpCode}) across ${toolCount} Gateway MCP tools`,
      output: running ? undefined : finding.summary,
      error: !running && finding.severity === 'BLOCK' ? finding.summary : undefined,
    };
  });

  const blockingMessages = autoReview.findings
    .filter((f) => f.severity === 'BLOCK')
    .map((f) => `[${f.reviewer}] ${f.summary}`)
    .join('；');

  const verdictSpan: TraceSpan = {
    id: `${pr.prNumber}-verdict`,
    name: 'Findings Verdict & PR Comment',
    kind: 'subagent',
    status: isRerunning
      ? 'running'
      : autoReview.verdict === 'CHANGES_REQUESTED'
        ? 'failed'
        : 'done',
    start: isRerunning ? Math.round(totalMs * 0.62) : Math.round(totalMs * 0.86),
    end: isRerunning ? undefined : totalMs,
    detail: isRerunning ? 'Synthesizing verdict…' : `${autoReview.verdict} · ${autoReview.reviewedAt}`,
    input: `${autoReview.findings.length} Bedrock reviewer findings · Cedar ${autoReview.cedarPolicy}`,
    output: isRerunning
      ? undefined
      : autoReview.verdict === 'PASS'
        ? 'PASS · 预审放行人工独立 Review'
        : 'CHANGES_REQUESTED · 只读回写阻断评论',
    error:
      !isRerunning && autoReview.verdict === 'CHANGES_REQUESTED'
        ? blockingMessages || 'AgentCore 预审拦截'
        : undefined,
  };

  const root: TraceSpan = {
    id: `${pr.prNumber}-${autoReview.sessionId}`,
    name: 'AgentCore MicroVM Orchestrator',
    kind: 'agent',
    status: isRerunning
      ? 'running'
      : autoReview.verdict === 'CHANGES_REQUESTED'
        ? 'failed'
        : 'done',
    start: 0,
    end: isRerunning ? undefined : totalMs,
    detail: `${autoReview.sessionId} · ${autoReview.cedarPolicy}`,
    model: autoReview.bedrockModel,
    input: `${pr.prNumber} · ${pr.branch} · ${autoReview.runtime}`,
    output: isRerunning
      ? 'Running read-only MicroVM pre-review…'
      : `Verdict: ${autoReview.verdict} (${autoReview.findings.length} reviewers)`,
    error:
      !isRerunning && autoReview.verdict === 'CHANGES_REQUESTED'
        ? blockingMessages || 'AgentCore 预审未通过'
        : undefined,
    children: [...toolSpans, ...reviewerSpans, verdictSpan],
  };

  return {
    root,
    now: isRerunning ? liveMs : totalMs,
  };
}

export function AppInspectorDrawer() {
  const {
    units,
    dependencies,
    inspectorUnitId,
    inspectorTab,
    openInspector,
    closeInspector,
    confirmDependencyFact,
    markKnowledgeSynced,
    triggerAgentCorePrReview,
    evaluateCutoverDbLock,
    notifyCopied,
  } = useFactory();

  const tabPrefix = useId();
  const [syncingWiki, setSyncingWiki] = useState(false);
  const [reviewingPr, setReviewingPr] = useState<string | null>(null);
  const [confirmingDepId, setConfirmingDepId] = useState<string | null>(null);
  const [lastUnitId, setLastUnitId] = useState<string | null>(inspectorUnitId);

  if (inspectorUnitId !== null && inspectorUnitId !== lastUnitId) {
    setLastUnitId(inspectorUnitId);
  }

  const activeUnitId = inspectorUnitId ?? lastUnitId;
  const unit = activeUnitId ? units.find((u) => u.id === activeUnitId) ?? null : null;
  const isDrawerOpen = Boolean(inspectorUnitId && unit);

  const unitDeps = unit ? dependencies.filter((d) => d.unitId === unit.id) : [];
  const unconfirmedDepsCount = unitDeps.filter((d) => !d.confirmed || d.unregisteredImplicit).length;
  const dbLock = unit ? evaluateCutoverDbLock(unit.id) : { locked: false, blockingTables: [] };

  const plannedIdx = unit ? STAGE_ORDER.indexOf(unit.plannedStage) : 0;
  const observedIdx = unit ? STAGE_ORDER.indexOf(unit.observedStage) : 0;
  const controlledIdx = unit ? STAGE_ORDER.indexOf(unit.controlledStage) : 0;

  const observedLag = observedIdx < plannedIdx;
  const controlledLag = controlledIdx < plannedIdx;

  const handleMarkSynced = async () => {
    if (!unit || syncingWiki) return;
    setSyncingWiki(true);
    try {
      await markKnowledgeSynced(unit.id, 'agentcore');
    } finally {
      setSyncingWiki(false);
    }
  };

  const handleRerunAutoReview = async (prNumber: string) => {
    if (!unit || reviewingPr) return;
    setReviewingPr(prNumber);
    try {
      await triggerAgentCorePrReview(unit.id, prNumber);
    } finally {
      setReviewingPr(null);
    }
  };

  const handleConfirmDep = async (depId: string) => {
    setConfirmingDepId(depId);
    try {
      await confirmDependencyFact(depId);
    } finally {
      setConfirmingDepId(null);
    }
  };

  const handleCopySnippet = async (text: string, label: string) => {
    const ok = await copyText(text);
    if (ok) {
      notifyCopied(label);
    }
  };

  const tabOptions = unit
    ? [
        {
          id: `${tabPrefix}-tab-trace`,
          value: 'trace' as const,
          label: '追踪与基线',
          count: unit.activePrs.length,
          dotTone: unit.activePrs.some(
            (p) => !p.lintPassed || !p.schemaPassed || !p.commitTrailerComplete || !p.wp00Passed,
          )
            ? ('danger' as const)
            : undefined,
        },
        {
          id: `${tabPrefix}-tab-knowledge`,
          value: 'knowledge' as const,
          label: '知识仓',
          dotTone:
            unit.knowledge.openwikiStatus === 'STALE'
              ? ('warn' as const)
              : unit.knowledge.openwikiStatus === 'MISSING' && unit.disposition !== 'Retire'
                ? ('warn' as const)
                : undefined,
        },
        {
          id: `${tabPrefix}-tab-deps`,
          value: 'deps' as const,
          label: '依赖与入云',
          count: unitDeps.length,
          dotTone:
            unconfirmedDepsCount > 0 || dbLock.locked
              ? ('danger' as const)
              : unit.onboardingSummary.p90Exceeded
                ? ('warn' as const)
                : undefined,
        },
        {
          id: `${tabPrefix}-tab-commands`,
          value: 'commands' as const,
          label: '本地命令',
          dotTone: unit.agentKitOutdated ? ('warn' as const) : undefined,
        },
      ]
    : [];

  return (
    <SlideDrawer
      open={isDrawerOpen}
      onClose={closeInspector}
      width="lg"
      title={unit ? `${unit.code} · ${unit.name}` : '应用详情'}
      badge={
        unit ? (
          <div className="flex items-center gap-1.5">
            <Badge mono>{unit.wave}</Badge>
            <Badge tone={unit.disposition === 'Modernize' ? 'accent' : 'neutral'}>
              {unit.disposition}
            </Badge>
            {unit.riskLevel === 'HIGH' && <Badge tone="danger">阻塞</Badge>}
            {unit.riskLevel === 'WATCH' && <Badge tone="warn">关注</Badge>}
          </div>
        ) : undefined
      }
      subtitle={
        unit ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{unit.domain}</span>
            <span aria-hidden="true">·</span>
            <span>{unit.owner}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{unit.techStack}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">目标 {unit.targetCutover}</span>
          </div>
        ) : undefined
      }
      tabs={
        unit ? (
          <div className="space-y-2.5">
            {/* Three-State Progress Summary Strip */}
            <div
              className="grid grid-cols-3 rounded-[6px] overflow-hidden"
              style={{
                border: '1px solid var(--line)',
                backgroundColor: 'var(--bg-sidebar)',
              }}
            >
              <div className="px-2.5 py-1.5" style={{ borderRight: '1px solid var(--line)' }}>
                <div className="text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>
                  计划 Planned
                </div>
                <div className="text-[12px] font-medium truncate" style={{ color: 'var(--ink)' }}>
                  {STAGE_LABELS[unit.plannedStage]}
                </div>
              </div>
              <div className="px-2.5 py-1.5" style={{ borderRight: '1px solid var(--line)' }}>
                <div className="text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>
                  观测 Observed
                </div>
                <div
                  className="text-[12px] font-medium truncate"
                  style={{ color: observedLag ? 'var(--signal-danger)' : 'var(--ink)' }}
                >
                  {STAGE_LABELS[unit.observedStage]}
                </div>
              </div>
              <div className="px-2.5 py-1.5">
                <div className="text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>
                  受控 Controlled
                </div>
                <div
                  className="text-[12px] font-medium truncate"
                  style={{ color: controlledLag ? 'var(--signal-danger)' : 'var(--ink)' }}
                >
                  {STAGE_LABELS[unit.controlledStage]}
                </div>
              </div>
            </div>

            <HairlineTabs<InspectorTab>
              ariaLabel="应用详情视图切换"
              size="sm"
              value={inspectorTab}
              onChange={(nextTab) => openInspector(unit.id, nextTab)}
              options={tabOptions}
            />
          </div>
        ) : undefined
      }
      footer={
        unit ? (
          <>
            <div
              className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono-tabular text-[11.5px]"
              style={{ color: 'var(--ink-muted)' }}
            >
              <span>{unit.appId}</span>
              <span aria-hidden="true">·</span>
              <span>Jira {unit.jiraKey}</span>
              <span aria-hidden="true">·</span>
              <span>agent-kit {unit.agentKitVersion}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {inspectorTab !== 'commands' && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => openInspector(unit.id, 'commands')}
                >
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                  本地命令
                </Button>
              )}
              <Button variant="ghost" size="xs" onClick={closeInspector}>
                关闭
              </Button>
            </div>
          </>
        ) : undefined
      }
    >
      {unit && (
        <div className="space-y-4">
          {/* Concise Blocker Banner (only when blocked or watch-flagged) */}
          {unit.blockerSummary && (
            <div
              className="flex items-start gap-2.5 rounded-[6px] px-3 py-2.5 text-[12px]"
              style={{
                backgroundColor:
                  unit.riskLevel === 'HIGH' ? 'var(--signal-danger-soft)' : 'var(--signal-warn-soft)',
                border: `1px solid ${
                  unit.riskLevel === 'HIGH'
                    ? 'var(--signal-danger-line)'
                    : 'var(--signal-warn-line)'
                }`,
              }}
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{
                  color:
                    unit.riskLevel === 'HIGH' ? 'var(--signal-danger)' : 'var(--signal-warn)',
                }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div
                  className="font-medium"
                  style={{
                    color:
                      unit.riskLevel === 'HIGH' ? 'var(--signal-danger)' : 'var(--signal-warn)',
                  }}
                >
                  当前阻塞 / 风险摘要
                </div>
                <p className="mt-0.5 text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                  {unit.blockerSummary}
                </p>
              </div>
            </div>
          )}

          {/* TAB 1..4 BODY WITH BLUR CROSSFADE */}
          <BlurCrossfade
            id={`${unit.id}:${inspectorTab}`}
            duration={160}
            blur={3}
            morph="none"
          >
            {/* TAB 1: TRACE */}
            {inspectorTab === 'trace' && (
            <div
              role="tabpanel"
              aria-labelledby={`${tabPrefix}-tab-trace`}
              className="space-y-4"
            >
              {/* PR Traceability Cards */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    Jira ↔ Branch / PR ↔ Verification Loop
                  </h3>
                  <span
                    className="font-mono-tabular text-[11px]"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {unit.activePrs.length} 条活跃 PR
                  </span>
                </div>

                {unit.activePrs.length === 0 ? (
                  <div className="mcp-surface">
                    <EmptyState
                      icon={<GitBranch className="h-4 w-4" />}
                      title="当前无进行中迁移 PR"
                      description={unit.observedActivity}
                    />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {unit.activePrs.map((pr) => {
                      const review = getReviewTone(pr.reviewState);
                      const isBlitzy = pr.aiExecutor === 'Blitzy (Blackbox)';
                      const checks: Array<{ label: string; ok: boolean }> = [
                        { label: 'Trailer', ok: pr.commitTrailerComplete },
                        { label: 'Lint', ok: pr.lintPassed },
                        { label: 'Schema', ok: pr.schemaPassed },
                        { label: 'WP-00', ok: pr.wp00Passed },
                        { label: '独立审', ok: pr.independentReview },
                      ];

                      return (
                        <article
                          key={pr.prNumber}
                          className="mcp-surface p-3.5 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="font-mono-tabular text-[12.5px] font-semibold"
                                style={{ color: 'var(--ink)' }}
                              >
                                {pr.prNumber}
                              </span>
                              <Badge mono>{pr.wpCode}</Badge>
                              <Badge mono tone="neutral">
                                {pr.jiraKey}
                              </Badge>
                              <Badge tone={isBlitzy ? 'accent' : 'neutral'}>
                                {pr.aiExecutor}
                              </Badge>
                            </div>
                            <StatusDot tone={review.tone} label={review.label} />
                          </div>

                          <div>
                            <p
                              className="text-[12.5px] font-medium text-pretty"
                              style={{ color: 'var(--ink)' }}
                            >
                              {pr.title}
                            </p>
                            <div
                              className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono-tabular text-[11px]"
                              style={{ color: 'var(--ink-muted)' }}
                            >
                              <span>{pr.branch}</span>
                              <span aria-hidden="true">·</span>
                              <span>{WP_LABELS[pr.wpCode]}</span>
                            </div>
                          </div>

                          {isBlitzy && (
                            <div
                              className="flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-[11.5px]"
                              style={{
                                backgroundColor: 'var(--accent-soft)',
                                border: '1px solid var(--accent-line)',
                                color: 'var(--accent)',
                              }}
                            >
                              <span>
                                Blitzy 黑盒出口强门禁：入口锁定 SME Spec，出口强验 WP-00 双跑与独立 Review
                              </span>
                            </div>
                          )}

                          {/* 5-Check Deterministic Matrix */}
                          <div
                            className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 rounded-[6px] p-2"
                            style={{
                              backgroundColor: 'var(--bg-well)',
                              border: '1px solid var(--line-subtle)',
                            }}
                          >
                            {checks.map((chk) => (
                              <div key={chk.label} className="flex items-center">
                                <StatusDot
                                  tone={chk.ok ? 'ok' : 'danger'}
                                  label={chk.label}
                                  mono
                                />
                              </div>
                            ))}
                          </div>

                          {/* AWS AgentCore PR Auto Review (Stage 2 Read-Only MicroVM) */}
                          {pr.autoReview &&
                            (() => {
                              const isRerunning = reviewingPr === pr.prNumber;
                              const traceData = buildAutoReviewTrace(
                                pr,
                                pr.autoReview,
                                isRerunning,
                              );
                              return (
                                <div
                                  className="rounded-[6px] p-2.5 space-y-2.5"
                                  style={{
                                    backgroundColor: 'var(--bg-well)',
                                    border: `1px solid ${
                                      pr.autoReview.verdict === 'CHANGES_REQUESTED'
                                        ? 'var(--signal-danger-line)'
                                        : 'var(--line)'
                                    }`,
                                  }}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <StatusDot
                                        tone={
                                          pr.autoReview.verdict === 'PASS'
                                            ? 'ok'
                                            : pr.autoReview.verdict === 'CHANGES_REQUESTED'
                                              ? 'danger'
                                              : 'accent'
                                        }
                                        pulse={isRerunning}
                                        label={
                                          pr.autoReview.verdict === 'PASS'
                                            ? 'AgentCore 预审放行'
                                            : 'AgentCore 预审拦截'
                                        }
                                      />
                                      <Badge mono tone="neutral">
                                        Cedar: {pr.autoReview.cedarPolicy}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="font-mono-tabular text-[10.5px]"
                                        style={{ color: 'var(--ink-faint)' }}
                                      >
                                        {pr.autoReview.sessionId} · {pr.autoReview.durationSec}s
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        disabled={isRerunning}
                                        onClick={() => void handleRerunAutoReview(pr.prNumber)}
                                      >
                                        <RefreshCw
                                          className={`h-3 w-3 ${isRerunning ? 'animate-spin' : ''}`}
                                          aria-hidden="true"
                                        />
                                        {isRerunning ? (
                                          <ShimmerText duration={1.4}>预审运行中…</ShimmerText>
                                        ) : (
                                          '重跑预审'
                                        )}
                                      </Button>
                                    </div>
                                  </div>

                                  {isRerunning && (
                                    <div className="px-0.5">
                                      <ShimmerText duration={1.4} className="text-[11.5px]">
                                        AgentCore MicroVM 正在重新拉取 Gateway MCP 并调度 Bedrock 审校…
                                      </ShimmerText>
                                    </div>
                                  )}

                                  <TraceWaterfall
                                    key={pr.prNumber}
                                    title="AgentCore MicroVM Trace"
                                    root={traceData.root}
                                    now={traceData.now}
                                    markSlowest
                                  />

                                  <ul className="space-y-1">
                                    {pr.autoReview.findings.map((finding) => {
                                      const fTone: SignalTone =
                                        finding.severity === 'BLOCK'
                                          ? 'danger'
                                          : finding.severity === 'WARN'
                                            ? 'warn'
                                            : 'ok';
                                      return (
                                        <li
                                          key={finding.reviewer}
                                          className="flex items-start gap-2 text-[11.5px] leading-[1.45]"
                                        >
                                          <span
                                            className="font-mono-tabular text-[10.5px] font-medium shrink-0 pt-[1px]"
                                            style={{
                                              color:
                                                fTone === 'danger'
                                                  ? 'var(--signal-danger)'
                                                  : fTone === 'warn'
                                                    ? 'var(--signal-warn)'
                                                    : 'var(--ink-muted)',
                                            }}
                                          >
                                            [{finding.reviewer}]
                                          </span>
                                          <span
                                            className="text-pretty"
                                            style={{ color: 'var(--ink-secondary)' }}
                                          >
                                            {finding.summary}
                                            {finding.graphImpactNodes !== undefined && (
                                              <span
                                                className="ml-1 font-mono-tabular text-[10.5px]"
                                                style={{ color: 'var(--ink-faint)' }}
                                              >
                                                ({finding.graphImpactNodes} nodes)
                                              </span>
                                            )}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>

                                  <div
                                    className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 font-mono-tabular text-[10.5px]"
                                    style={{
                                      borderTop: '1px solid var(--line-subtle)',
                                      color: 'var(--ink-faint)',
                                    }}
                                  >
                                    <span className="truncate">
                                      Gateway MCP: {pr.autoReview.gatewayToolsUsed.join(' · ')}
                                    </span>
                                    <span className="shrink-0">{pr.autoReview.reviewedAt}</span>
                                  </div>
                                </div>
                              );
                            })()}

                          {/* Metadata footer */}
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                              <span>{pr.aiModel}</span>
                              <span>kit {pr.agentKitVersion}</span>
                              <span>
                                Jira WorkLog:{' '}
                                <span
                                  style={{
                                    color: pr.jiraWorkLogSynced
                                      ? 'var(--ink-secondary)'
                                      : 'var(--signal-warn)',
                                  }}
                                >
                                  {pr.jiraWorkLogSynced ? '已同步' : '待回写'}
                                </span>
                              </span>
                              {pr.dirtyFilesCount > 0 && (
                                <span style={{ color: 'var(--signal-danger)' }}>
                                  脏文件 {pr.dirtyFilesCount}
                                </span>
                              )}
                            </div>
                            <a
                              href={pr.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 no-underline hover:underline"
                              style={{ color: 'var(--accent)' }}
                            >
                              <span>GHE PR</span>
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          </div>

                          {pr.failingCheckSummary && (
                            <div
                              className="rounded-[6px] px-2.5 py-1.5 text-[11.5px] text-pretty"
                              style={{
                                backgroundColor: 'var(--signal-danger-soft)',
                                border: '1px solid var(--signal-danger-line)',
                                color: 'var(--signal-danger)',
                              }}
                            >
                              {pr.failingCheckSummary}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* WP-00 Baseline Summary */}
              <section className="mcp-surface p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    WP-00 黄金基线与等价双跑
                  </h3>
                  <StatusDot
                    tone={getWp00Tone(unit.wp00.status).tone}
                    label={getWp00Tone(unit.wp00.status).label}
                  />
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11.5px]">
                  <div>
                    <dt style={{ color: 'var(--ink-faint)' }}>基线模式</dt>
                    <dd className="mt-0.5 font-medium" style={{ color: 'var(--ink)' }}>
                      {unit.wp00.mode}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--ink-faint)' }}>可复现构建</dt>
                    <dd className="mt-0.5">
                      <StatusDot
                        tone={unit.wp00.reproducibleBuildOk ? 'ok' : 'danger'}
                        label={unit.wp00.reproducibleBuildOk ? '已冻结依赖' : '未冻结'}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--ink-faint)' }}>构建耗时对比</dt>
                    <dd className="mt-0.5 font-mono-tabular" style={{ color: 'var(--ink)' }}>
                      {unit.wp00.legacyBuildMinutes}m
                      {unit.wp00.harnessBuildMinutes !== undefined
                        ? ` → ${unit.wp00.harnessBuildMinutes}m`
                        : ' (待接入 Harness)'}
                    </dd>
                  </div>
                  {unit.wp00.sampleRows !== undefined && (
                    <div>
                      <dt style={{ color: 'var(--ink-faint)' }}>脱敏黄金样本</dt>
                      <dd className="mt-0.5 font-mono-tabular" style={{ color: 'var(--ink)' }}>
                        {unit.wp00.sampleRows.toLocaleString()} 行
                      </dd>
                    </div>
                  )}
                  {unit.wp00.sha256 && (
                    <div className="col-span-2">
                      <dt style={{ color: 'var(--ink-faint)' }}>S3 Object Lock SHA-256</dt>
                      <dd className="mt-0.5 font-mono-tabular truncate">
                        <Tooltip content={unit.wp00.sha256} side="top">
                          <span
                            tabIndex={0}
                            className="cursor-help"
                            style={{ color: 'var(--ink-secondary)' }}
                          >
                            {shortHash(unit.wp00.sha256, 24)}
                          </span>
                        </Tooltip>
                      </dd>
                    </div>
                  )}
                </dl>

                {unit.wp00.diffClusters.length > 0 && (
                  <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                    <div className="text-[11.5px] font-medium" style={{ color: 'var(--signal-danger)' }}>
                      双跑差异簇 ({unit.wp00.diffClusters.length})
                    </div>
                    {unit.wp00.diffClusters.map((diff) => (
                      <div
                        key={diff.id}
                        className="mcp-well p-2.5 space-y-1.5 text-[11.5px]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tabular font-medium" style={{ color: 'var(--ink)' }}>
                            {diff.tableName}.{diff.field} · {diff.affectedRows} 行
                          </span>
                          <Badge
                            mono
                            tone={
                              diff.status === 'SME_ACCEPTED'
                                ? 'ok'
                                : diff.status === 'FIX_PR_CREATED'
                                  ? 'accent'
                                  : 'danger'
                            }
                          >
                            {diff.status}
                          </Badge>
                        </div>
                        <div className="font-mono-tabular text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                          Legacy: {diff.legacySample} → AWS: {diff.awsSample}
                        </div>
                        <p className="text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                          {diff.rootCauseSummary} ({diff.suspectedFile})
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Release & UAT/PROD SHA-256 Reconciliation */}
              <section className="mcp-surface p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    发布与 UAT / PROD 同制品 SHA-256 对账
                  </h3>
                  <StatusDot
                    tone={unit.releaseSummary.sha256Reconciled ? 'ok' : 'neutral'}
                    label={unit.releaseSummary.sha256Reconciled ? '三端对账一致' : unit.releaseSummary.branchState}
                    mono
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px]">
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>Harness CI</div>
                    <div className="mt-0.5">
                      <StatusDot
                        tone={
                          unit.releaseSummary.harnessStatus === 'GREEN'
                            ? 'ok'
                            : unit.releaseSummary.harnessStatus === 'FAILED'
                              ? 'danger'
                              : unit.releaseSummary.harnessStatus === 'RUNNING'
                                ? 'accent'
                                : 'neutral'
                        }
                        label={unit.releaseSummary.harnessStatus}
                        mono
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>TFE 零漂移</div>
                    <div className="mt-0.5">
                      <StatusDot
                        tone={unit.releaseSummary.tfeZeroDrift ? 'ok' : 'warn'}
                        label={unit.releaseSummary.tfeZeroDrift ? 'Zero Drift' : '有漂移'}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>安全扫描</div>
                    <div className="mt-0.5">
                      <StatusDot
                        tone={unit.releaseSummary.securityScanPass ? 'ok' : 'danger'}
                        label={unit.releaseSummary.securityScanPass ? '通过' : '拦截'}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>变更单 / PR</div>
                    <div className="mt-0.5 font-mono-tabular" style={{ color: 'var(--ink)' }}>
                      {unit.releaseSummary.changeTicketId ?? unit.releaseSummary.releasePrNumber ?? '—'}
                    </div>
                  </div>
                </div>

                {(unit.releaseSummary.artifactSha256 ||
                  unit.releaseSummary.uatSha256 ||
                  unit.releaseSummary.prodSha256) && (
                  <div className="mcp-well p-2.5 space-y-1 font-mono-tabular text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: 'var(--ink-faint)' }}>Artifact</span>
                      <span style={{ color: 'var(--ink-secondary)' }}>
                        {unit.releaseSummary.artifactSha256
                          ? shortHash(unit.releaseSummary.artifactSha256, 20)
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: 'var(--ink-faint)' }}>UAT</span>
                      <span style={{ color: 'var(--ink-secondary)' }}>
                        {unit.releaseSummary.uatSha256
                          ? shortHash(unit.releaseSummary.uatSha256, 20)
                          : '待部署'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: 'var(--ink-faint)' }}>PROD</span>
                      <span
                        style={{
                          color: unit.releaseSummary.sha256Reconciled
                            ? 'var(--signal-ok)'
                            : 'var(--ink-faint)',
                        }}
                      >
                        {unit.releaseSummary.prodSha256
                          ? shortHash(unit.releaseSummary.prodSha256, 20)
                          : '待切换'}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: KNOWLEDGE */}
          {inspectorTab === 'knowledge' && (
            <div
              role="tabpanel"
              aria-labelledby={`${tabPrefix}-tab-knowledge`}
              className="space-y-4"
            >
              {/* Central Knowledge Repo + OpenWiki Status */}
              <section className="mcp-surface p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                      中央知识仓 · OpenWiki (OKF v0.2)
                    </h3>
                    <div
                      className="mt-0.5 font-mono-tabular text-[11.5px]"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      {unit.knowledge.centralRepoPath}
                    </div>
                  </div>
                  <StatusDot
                    tone={
                      unit.knowledge.openwikiStatus === 'FRESH'
                        ? 'ok'
                        : unit.knowledge.openwikiStatus === 'STALE'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={
                      unit.knowledge.openwikiStatus === 'FRESH'
                        ? 'Claims 全部新鲜'
                        : unit.knowledge.openwikiStatus === 'STALE'
                          ? `${unit.knowledge.staleClaimsCount} 条 Claim 过期`
                          : '尚未建库'
                    }
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11.5px]">
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>有效 Claims</div>
                    <div className="mt-0.5 font-mono-tabular font-medium" style={{ color: 'var(--ink)' }}>
                      {unit.knowledge.totalClaimsCount - unit.knowledge.staleClaimsCount} /{' '}
                      {unit.knowledge.totalClaimsCount}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>最近同步 PR</div>
                    <div className="mt-0.5 font-mono-tabular" style={{ color: 'var(--ink-secondary)' }}>
                      {unit.knowledge.lastPrSynced}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--ink-faint)' }}>同步触发与调度运行时</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Badge mono>{unit.knowledge.syncTrigger}</Badge>
                      {unit.knowledge.dispatchRuntime && (
                        <Badge
                          tone={
                            unit.knowledge.dispatchRuntime === 'AgentCore Runtime (Bedrock)'
                              ? 'accent'
                              : 'neutral'
                          }
                          mono
                        >
                          {unit.knowledge.dispatchRuntime === 'AgentCore Runtime (Bedrock)'
                            ? 'AgentCore · Bedrock'
                            : 'Local CLI'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {unit.knowledge.staleClaimFiles && unit.knowledge.staleClaimFiles.length > 0 && (
                  <div
                    className="rounded-[6px] p-2.5 space-y-1.5"
                    style={{
                      backgroundColor: 'var(--signal-warn-soft)',
                      border: '1px solid var(--signal-warn-line)',
                    }}
                  >
                    <div className="text-[11.5px] font-medium" style={{ color: 'var(--signal-warn)' }}>
                      SHA-256 哈希失配的过期 Claim 文件
                    </div>
                    <ul className="space-y-0.5 font-mono-tabular text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                      {unit.knowledge.staleClaimFiles.map((file) => (
                        <li key={file} className="truncate">
                          {file}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-1 text-[11px] font-mono-tabular" style={{ color: 'var(--ink-faint)' }}>
                  Remote: {PROGRAM_TOTALS.centralKnowledgeRepo}
                </div>
              </section>

              {/* Graphify AST Breakdown */}
              <section className="mcp-surface p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    Graphify 代码结构图 (tree-sitter AST)
                  </h3>
                  <StatusDot
                    tone={
                      unit.knowledge.graphifyStatus === 'INDEXED'
                        ? 'ok'
                        : unit.knowledge.graphifyStatus === 'PARTIAL_LEGACY'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={
                      unit.knowledge.graphifyStatus === 'INDEXED'
                        ? `已索引 · ${unit.knowledge.graphNodes} 节点`
                        : unit.knowledge.graphifyStatus === 'PARTIAL_LEGACY'
                          ? `部分遗留栈 · ${unit.knowledge.graphNodes} 节点`
                          : '未建图'
                    }
                    mono
                  />
                </div>

                <div
                  className="grid grid-cols-3 rounded-[6px] overflow-hidden"
                  style={{
                    border: '1px solid var(--line)',
                    backgroundColor: 'var(--bg-well)',
                  }}
                >
                  <div className="px-3 py-2" style={{ borderRight: '1px solid var(--line)' }}>
                    <div className="font-mono-tabular text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>
                      EXTRACTED
                    </div>
                    <div className="font-mono-tabular text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                      {unit.knowledge.graphEdgesExtracted}
                    </div>
                  </div>
                  <div className="px-3 py-2" style={{ borderRight: '1px solid var(--line)' }}>
                    <div className="font-mono-tabular text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>
                      INFERRED
                    </div>
                    <div
                      className="font-mono-tabular text-[14px] font-semibold"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      {unit.knowledge.graphEdgesInferred}
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <div className="font-mono-tabular text-[10.5px]" style={{ color: 'var(--ink-faint)' }}>
                      AMBIGUOUS
                    </div>
                    <div
                      className="font-mono-tabular text-[14px] font-semibold"
                      style={{
                        color:
                          unit.knowledge.graphEdgesAmbiguous > 20
                            ? 'var(--signal-warn)'
                            : 'var(--ink-secondary)',
                      }}
                    >
                      {unit.knowledge.graphEdgesAmbiguous}
                    </div>
                  </div>
                </div>

                <p className="text-[12px] text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                  {unit.knowledge.legacyCoverageNote}
                </p>
              </section>

              {/* Monospace Preview Blocks */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: 'var(--ink)' }}>
                  <FileCode2 className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
                  <span className="font-mono-tabular">openwiki/index.md</span>
                </div>
                <pre
                  className="mcp-well p-3 font-mono-tabular text-[11.5px] leading-[1.55] overflow-x-auto whitespace-pre-wrap"
                  style={{ color: 'var(--ink-secondary)' }}
                >
                  {unit.knowledge.indexPreviewMd}
                </pre>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: 'var(--ink)' }}>
                  <FileCode2 className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
                  <span className="font-mono-tabular">GRAPH_REPORT.md</span>
                </div>
                <pre
                  className="mcp-well p-3 font-mono-tabular text-[11.5px] leading-[1.55] overflow-x-auto whitespace-pre-wrap"
                  style={{ color: 'var(--ink-secondary)' }}
                >
                  {unit.knowledge.graphReportPreviewMd}
                </pre>
              </section>

              {/* Sync Command & Action */}
              <section className="mcp-surface p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>
                      AWS AgentCore Runtime 增量刷新中央知识仓
                    </div>
                    <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                      隔离 MicroVM（VPC Mode · Bedrock）跑 Graphify + OpenWiki 增量更新并写入{' '}
                      <code className="font-mono-tabular">migration-knowledge</code> 及 Gateway MCP。
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleMarkSynced()}
                    disabled={syncingWiki}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncingWiki ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    {syncingWiki ? 'Dispatch 中…' : 'AgentCore 增量刷新'}
                  </Button>
                </div>
                {syncingWiki && (
                  <div className="mcp-well flex items-center gap-2 px-3 py-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--accent)' }}
                      aria-hidden="true"
                    />
                    <ShimmerText duration={1.4} className="text-[11.5px] font-medium">
                      AgentCore MicroVM (VPC Mode · Bedrock) 正在增量刷新 Graphify AST 与 OpenWiki Claims…
                    </ShimmerText>
                  </div>
                )}
                <CopyCommandBar
                  label="本机兜底同步命令（可选离线 / Copilot CLI 通道）"
                  description="跳过云端调度时，可于本机执行并回写中央仓 · 禁用遥测"
                  command={unit.localCommands.wikiSync}
                  onCopy={() => notifyCopied(`${unit.code} wiki sync`)}
                />
              </section>
            </div>
          )}

          {/* TAB 3: DEPS & ONBOARDING */}
          {inspectorTab === 'deps' && (
            <div
              role="tabpanel"
              aria-labelledby={`${tabPrefix}-tab-deps`}
              className="space-y-4"
            >
              {/* Cutover DB Wave Lock Evaluation */}
              <section
                className="rounded-[8px] p-3.5 space-y-2.5"
                style={{
                  backgroundColor: dbLock.locked ? 'var(--signal-danger-soft)' : 'var(--bg-well)',
                  border: `1px solid ${dbLock.locked ? 'var(--signal-danger-line)' : 'var(--line)'}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {dbLock.locked ? (
                      <Lock
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--signal-danger)' }}
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--signal-ok)' }}
                        aria-hidden="true"
                      />
                    )}
                    <h3
                      className="text-[12px] font-semibold"
                      style={{ color: dbLock.locked ? 'var(--signal-danger)' : 'var(--ink)' }}
                    >
                      Cutover 共享库“数据先到”波次锁
                    </h3>
                  </div>
                  <Badge tone={dbLock.locked ? 'danger' : 'ok'} mono>
                    {dbLock.locked ? `LOCKED · ${dbLock.blockingTables.length} 表未就绪` : 'UNLOCKED'}
                  </Badge>
                </div>

                {dbLock.locked ? (
                  <div className="space-y-1.5">
                    {dbLock.blockingTables.map((tbl) => (
                      <div
                        key={tbl.name}
                        className="rounded-[6px] px-2.5 py-2 text-[11.5px]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--signal-danger-line)',
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tabular font-semibold" style={{ color: 'var(--ink)' }}>
                            {tbl.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Badge mono>{tbl.targetWave}</Badge>
                            <Badge tone={tbl.status === 'WAVE_UNKNOWN' ? 'danger' : 'warn'} mono>
                              {tbl.status}
                            </Badge>
                          </div>
                        </div>
                        {tbl.bridgeStrategy && (
                          <p className="mt-1 text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                            {tbl.bridgeStrategy}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                    当前应用关联的 Sybase 共享表已全部达到 Oracle Ready 状态或无共享表阻塞。
                  </p>
                )}
              </section>

              {/* Dependency Facts */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    跨应用依赖事实（Static Code vs DB Runtime Audit Log）
                  </h3>
                  <span className="font-mono-tabular text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                    {unitDeps.length} 条记录
                  </span>
                </div>

                {unitDeps.length === 0 ? (
                  <div className="mcp-surface">
                    <EmptyState
                      icon={<Database className="h-4 w-4" />}
                      title="暂无跨应用外部依赖事实"
                      description="静态代码扫描与 Sybase MDA 运行时审计日志均未检出跨应用依赖。"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unitDeps.map((dep) => {
                      const srcMeta = getDepSourceMeta(dep);
                      const needsConfirm = !dep.confirmed || dep.unregisteredImplicit;

                      return (
                        <article key={dep.id} className="mcp-surface p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="font-mono-tabular text-[12.5px] font-semibold"
                                style={{ color: 'var(--ink)' }}
                              >
                                {dep.targetName}
                              </span>
                              <Badge mono>{dep.kind}</Badge>
                              {dep.targetWave && (
                                <Badge
                                  mono
                                  tone={dep.targetWave === 'Wave-Unknown' ? 'danger' : 'neutral'}
                                >
                                  {dep.targetWave}
                                </Badge>
                              )}
                            </div>
                            <Badge tone={srcMeta.tone} mono>
                              {srcMeta.label}
                            </Badge>
                          </div>

                          {(dep.dbAccount || dep.runtimeHits30d !== undefined) && (
                            <div
                              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono-tabular text-[11px]"
                              style={{ color: 'var(--ink-muted)' }}
                            >
                              {dep.dbAccount && <span>账号: {dep.dbAccount}</span>}
                              {dep.runtimeHits30d !== undefined && (
                                <span>30d 命中: {dep.runtimeHits30d.toLocaleString()}</span>
                              )}
                            </div>
                          )}

                          {dep.note && (
                            <p className="text-[12px] text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                              {dep.note}
                            </p>
                          )}

                          <div
                            className="flex items-center justify-between gap-2 pt-2"
                            style={{ borderTop: '1px solid var(--line-subtle)' }}
                          >
                            {needsConfirm ? (
                              <>
                                <StatusDot
                                  tone="danger"
                                  label="未登记隐式读取（静态盲区）"
                                />
                                <Button
                                  variant="primary"
                                  size="xs"
                                  disabled={confirmingDepId === dep.id}
                                  onClick={() => void handleConfirmDep(dep.id)}
                                >
                                  {confirmingDepId === dep.id ? '写入中…' : '确认依赖'}
                                </Button>
                              </>
                            ) : (
                              <StatusDot tone="ok" label="已纳入双源依赖账本" />
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Compact Onboarding Steps & Bookmarklets */}
              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    入云 Onboarding 工单与 Bookmarklet 参数包
                  </h3>
                  <div className="flex items-center gap-1.5 font-mono-tabular text-[11px]">
                    <span style={{ color: 'var(--ink-muted)' }}>
                      {unit.onboardingSummary.completedSteps}/{unit.onboardingSummary.totalSteps} 完成
                    </span>
                    {unit.onboardingSummary.p90Exceeded && (
                      <Badge tone="danger" mono>
                        排队 {unit.onboardingSummary.maxWaitDays}d · 超 P90
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                  {unit.onboardingSummary.nextActionLabel} · 坚持本机 Bookmarklet / 本地 Playwright（复用笔记本 SSO 与设备证书，不走云端 Browser Tool）
                </p>

                <ProgressTracker
                  key={`${unit.id}:${unit.onboardingSteps.map((s) => `${s.id}:${s.status}`).join(',')}`}
                  title={`${unit.code} 入云 Onboarding 进度`}
                  steps={unit.onboardingSteps.map(
                    (step): ProgressStep => ({
                      id: step.id,
                      label: `#${step.order} ${step.title} · ${step.system}${step.ticketId ? ` (${step.ticketId})` : ''}`,
                      done: step.status === 'DONE',
                      icon: getOnboardingStepIcon(step.status),
                    }),
                  )}
                  className="max-w-none!"
                />

                <div className="space-y-2">
                  {unit.onboardingSteps.map((step) => {
                    const stepTone: SignalTone =
                      step.status === 'DONE'
                        ? 'ok'
                        : step.status === 'BLOCKED'
                          ? 'danger'
                          : step.status === 'WAITING_APPROVAL'
                            ? 'warn'
                            : 'accent';
                    const stepLabel =
                      step.status === 'DONE'
                        ? '已完成'
                        : step.status === 'WAITING_APPROVAL'
                          ? `排队 ${step.waitDays}d / P90 ${step.p90Days}d`
                          : step.status === 'BLOCKED'
                            ? '阻塞'
                            : '待提交';

                    const derivedEntries = Object.entries(step.derivedFields);

                    return (
                      <article key={step.id} className="mcp-surface p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="font-mono-tabular text-[11px]"
                              style={{ color: 'var(--ink-faint)' }}
                            >
                              #{step.order}
                            </span>
                            <span
                              className="text-[12.5px] font-medium truncate"
                              style={{ color: 'var(--ink)' }}
                            >
                              {step.title}
                            </span>
                            <Badge mono>{step.system}</Badge>
                          </div>
                          <StatusDot tone={stepTone} label={stepLabel} mono />
                        </div>

                        {step.ticketId && (
                          <div
                            className="font-mono-tabular text-[11px]"
                            style={{ color: 'var(--ink-muted)' }}
                          >
                            Ticket: {step.ticketId}
                          </div>
                        )}

                        {derivedEntries.length > 0 && (
                          <div className="mcp-well px-2.5 py-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 font-mono-tabular text-[11px]">
                            {derivedEntries.map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between gap-2 min-w-0">
                                <span className="shrink-0" style={{ color: 'var(--ink-faint)' }}>
                                  {k}
                                </span>
                                <Tooltip content={v} side="top">
                                  <span
                                    tabIndex={0}
                                    className="truncate cursor-help"
                                    style={{ color: 'var(--ink-secondary)' }}
                                  >
                                    {v}
                                  </span>
                                </Tooltip>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() =>
                              void handleCopySnippet(
                                step.bookmarkletPayload,
                                `${step.system} Bookmarklet (${unit.code})`,
                              )
                            }
                          >
                            <Bookmark className="h-3 w-3" aria-hidden="true" />
                            复制 Bookmarklet
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              void handleCopySnippet(
                                JSON.stringify(step.derivedFields, null, 2),
                                `${step.system} 衍生字段 JSON`,
                              )
                            }
                          >
                            <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
                            复制衍生字段
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: LOCAL COMMANDS */}
          {inspectorTab === 'commands' && (
            <div
              role="tabpanel"
              aria-labelledby={`${tabPrefix}-tab-commands`}
              className="space-y-4"
            >
              {/* agent-kit Version Status & Upgrade Hint */}
              <section
                className="rounded-[8px] p-3.5 space-y-2.5"
                style={{
                  backgroundColor: unit.agentKitOutdated
                    ? 'var(--signal-warn-soft)'
                    : 'var(--bg-surface)',
                  border: `1px solid ${
                    unit.agentKitOutdated ? 'var(--signal-warn-line)' : 'var(--line)'
                  }`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className="h-3.5 w-3.5 shrink-0"
                      style={{
                        color: unit.agentKitOutdated ? 'var(--signal-warn)' : 'var(--signal-ok)',
                      }}
                      aria-hidden="true"
                    />
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                      本地 agent-kit 规范包版本
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={unit.agentKitOutdated ? 'warn' : 'ok'} mono>
                      当前 {unit.agentKitVersion}
                    </Badge>
                    <Badge mono>最新 {PROGRAM_TOTALS.latestAgentKitVersion}</Badge>
                  </div>
                </div>

                {unit.agentKitOutdated ? (
                  <>
                    <p className="text-[12px] text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                      当前仓库引用的规范包落后于最新 Artifactory 发版，可能导致 Evidence Schema 或规则漂移，建议先在本机同步升级：
                    </p>
                    <CopyCommandBar
                      label="升级至最新 agent-kit"
                      description="Artifactory 内部源"
                      command={
                        unit.localCommands.kitUpgrade ??
                        `pnpm dlx @custody/agent-kit@${PROGRAM_TOTALS.latestAgentKitVersion.replace(/^v/, '')} sync --registry artifactory`
                      }
                      onCopy={() => notifyCopied(`${unit.code} agent-kit upgrade`)}
                    />
                  </>
                ) : (
                  <StatusDot
                    tone="ok"
                    label="已与最新 Artifactory agent-kit 发版保持一致"
                  />
                )}
              </section>

              {/* Local Command Hub */}
              <section className="mcp-surface p-3.5 space-y-3.5">
                <div className="space-y-0.5">
                  <h3 className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                    本机 CLI 执行命令中心（Copilot Squad + agent-kit）
                  </h3>
                  <p className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                    本控制台不代执行远程代码修改；所有验证、知识同步与图谱提取均由工程师在本地工作站执行，结果通过 Git Trailer / PR CI 回流。
                  </p>
                </div>

                <CopyCommandBar
                  label="1. 本地确定性验证环 (verify)"
                  description="Lint · Schema · Trailer · WP-00"
                  command={unit.localCommands.verify}
                  onCopy={() => notifyCopied(`${unit.code} verify`)}
                />

                <CopyCommandBar
                  label="2. PR 阶段刷新中央知识仓 (wiki sync)"
                  description="OpenWiki · 禁用遥测"
                  command={unit.localCommands.wikiSync}
                  onCopy={() => notifyCopied(`${unit.code} wiki sync`)}
                />

                <CopyCommandBar
                  label="3. 零 LLM 代码结构图提取 (graphify)"
                  description="tree-sitter AST"
                  command={unit.localCommands.graphExtract}
                  onCopy={() => notifyCopied(`${unit.code} graphify extract`)}
                />

                <CopyCommandBar
                  label="4. 本地三态进度与工作树自检 (status)"
                  description="对照 Jira 与 PR CI 状态"
                  command={`agent-kit status --app ${unit.code} --jira ${unit.jiraKey}`}
                  onCopy={() => notifyCopied(`${unit.code} status`)}
                />

                {unit.disposition === 'Modernize' ? (
                  <CopyCommandBar
                    label="5. 导出 Blitzy 入口权威规格 (blitzy spec-export)"
                    description="仅导出已获 SME 签字锁定规则"
                    command={`agent-kit blitzy spec-export --app ${unit.code} --locked-sme --out ./specs/${unit.code.toLowerCase()}.spec.md`}
                    onCopy={() => notifyCopied(`${unit.code} blitzy spec-export`)}
                  />
                ) : (
                  <CopyCommandBar
                    label="5. 生成波次任务清单与依赖锁预检 (batch plan)"
                    description={`Wave ${unit.wave} · ${unit.disposition}`}
                    command={`agent-kit batch plan --wave ${unit.wave} --app ${unit.code}`}
                    onCopy={() => notifyCopied(`${unit.code} batch plan`)}
                  />
                )}
              </section>
            </div>
          )}
          </BlurCrossfade>
        </div>
      )}
    </SlideDrawer>
  );
}
