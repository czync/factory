import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Bot,
  GitBranch,
  GitPullRequest,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import { DataTable, type DataTableColumn, type SortingState } from '@/components/ui/DataTable';
import {
  Badge,
  Button,
  CopyCommandBar,
  HairlineTabs,
  SelectField,
  StatusDot,
  Tooltip,
  type HairlineTabOption,
  type SelectFieldOption,
  type SignalTone,
} from '@/components/ui/Primitives';
import {
  AgentFindings,
  type Finding,
  type FindingAgent,
} from '@/components/uipros/agent-findings-clean';
import { BlurCrossfade } from '@/components/uipros/blur-crossfade';
import { NumberTicker } from '@/components/uipros/number-ticker';
import { TRANSITION_FAST } from '@/lib/motion';
import { useFactory } from '@/data/store';
import {
  CURRENT_ENGINEER,
  WP_LABELS,
  type AiExecutorKind,
  type BatchTraceRecord,
  type TracePrItem,
  type WaveId,
  type WorkPackageCode,
} from '@/data/types';

type QuickFilter = 'ALL' | 'FAILED_CI' | 'NEEDS_REVIEW' | 'TRAILER_INCOMPLETE';
type ExecutorFilter = 'ALL' | Exclude<AiExecutorKind, 'Manual'>;

const WP_OPTIONS: readonly WorkPackageCode[] = [
  'WP-00',
  'WP-01',
  'WP-02',
  'WP-03',
  'WP-04',
  'WP-05',
  'WP-06',
  'WP-07',
];

const WAVE_OPTIONS: readonly WaveId[] = ['W0', 'W1', 'W2', 'W3', 'W4'];

const EXECUTOR_OPTIONS: readonly SelectFieldOption<ExecutorFilter>[] = [
  { value: 'ALL', label: '全部 AI 来源' },
  { value: 'Copilot Squad', label: 'Copilot Squad' },
  { value: 'Blitzy (Blackbox)', label: 'Blitzy (Blackbox)' },
  { value: 'Deterministic Script', label: 'Deterministic Script' },
];

const FINDING_CLOCK_NOW = Date.UTC(2027, 2, 22, 12, 0, 0);

const WP_SHORT_LABELS: Record<WorkPackageCode, string> = {
  'WP-00': '黄金基线与双跑',
  'WP-01': '密钥托管',
  'WP-02': 'CI/CD Harness',
  'WP-03': '容器化 / TFE',
  'WP-04': '统一文件传输',
  'WP-05': 'AutoSys 调度',
  'WP-06': 'Sybase → Oracle',
  'WP-07': 'OS 迁 Linux',
};

const JIRA_STATUS_META: Record<
  TracePrItem['jiraStatus'],
  { label: string; color: string }
> = {
  DONE: { label: 'Done', color: 'var(--ink-faint)' },
  IN_REVIEW: { label: 'In Review', color: 'var(--accent)' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--ink-muted)' },
  BLOCKED: { label: 'Blocked', color: 'var(--signal-danger)' },
};

const REVIEW_STATE_META: Record<
  TracePrItem['reviewState'],
  { label: string; tone: SignalTone; rank: number }
> = {
  CHANGES_REQUESTED: { label: '退回修改', tone: 'danger', rank: 0 },
  PENDING: { label: '待 Review', tone: 'warn', rank: 1 },
  APPROVED: { label: 'Approved', tone: 'ok', rank: 2 },
  MERGED: { label: 'Merged', tone: 'ok', rank: 3 },
};

function isCiPassed(pr: TracePrItem): boolean {
  return pr.lintPassed && pr.schemaPassed && pr.wp00Passed;
}

function ciPassScore(pr: TracePrItem): number {
  return Number(pr.lintPassed) + Number(pr.schemaPassed) + Number(pr.wp00Passed);
}

function isNeedsReview(pr: TracePrItem): boolean {
  return pr.reviewState === 'PENDING' || pr.reviewState === 'CHANGES_REQUESTED';
}

function VerificationTriad({ pr }: { pr: TracePrItem }) {
  const checks = [
    { key: 'Lint', passed: pr.lintPassed },
    { key: 'Schema', passed: pr.schemaPassed },
    { key: 'WP-00', passed: pr.wp00Passed },
  ] as const;

  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-2.5">
        {checks.map((check) => (
          <span
            key={check.key}
            className="inline-flex items-center gap-1 font-mono-tabular text-[11.5px]"
            style={{
              color: check.passed ? 'var(--ink-secondary)' : 'var(--signal-danger)',
              fontWeight: check.passed ? 400 : 600,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: check.passed ? 'var(--signal-ok)' : 'var(--signal-danger)',
              }}
              aria-hidden="true"
            />
            {check.key}
          </span>
        ))}
      </div>
      {pr.failingCheckSummary && (
        <p
          className="max-w-[260px] truncate text-[11px] leading-[1.35]"
          style={{ color: 'var(--signal-danger)' }}
          title={pr.failingCheckSummary}
        >
          {pr.failingCheckSummary}
        </p>
      )}
    </div>
  );
}

export function BatchTracePage() {
  const { scopedBatchTraces, scope, inspectorUnitId, openInspector, notifyCopied } = useFactory();
  const prefersReducedMotion = Boolean(useReducedMotion());

  const quickTabIdPrefix = useId();
  const [wpFilter, setWpFilter] = useState<'ALL' | WorkPackageCode>('ALL');
  const [waveFilter, setWaveFilter] = useState<'ALL' | WaveId>('ALL');
  const [executorFilter, setExecutorFilter] = useState<ExecutorFilter>('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'verification', desc: false }]);

  const summary = useMemo(() => {
    let ciPassed = 0;
    let ciFailed = 0;
    let awaitingReview = 0;
    let agentCoreBlocked = 0;
    let blitzyCount = 0;
    for (const row of scopedBatchTraces) {
      if (isCiPassed(row.pr)) ciPassed += 1;
      else ciFailed += 1;
      if (isNeedsReview(row.pr)) awaitingReview += 1;
      if (row.pr.autoReview?.verdict === 'CHANGES_REQUESTED') agentCoreBlocked += 1;
      if (row.pr.aiExecutor === 'Blitzy (Blackbox)') blitzyCount += 1;
    }
    return {
      total: scopedBatchTraces.length,
      ciPassed,
      ciFailed,
      awaitingReview,
      agentCoreBlocked,
      blitzyCount,
    };
  }, [scopedBatchTraces]);

  // Base traces after dropdown filters (used for accurate quick-filter tab counts)
  const baseFilteredTraces = useMemo(() => {
    return scopedBatchTraces.filter((row) => {
      if (wpFilter !== 'ALL' && row.wpCode !== wpFilter) return false;
      if (waveFilter !== 'ALL' && row.wave !== waveFilter) return false;
      if (executorFilter !== 'ALL' && row.pr.aiExecutor !== executorFilter) return false;
      return true;
    });
  }, [executorFilter, scopedBatchTraces, waveFilter, wpFilter]);

  const quickTabOptions = useMemo<HairlineTabOption<QuickFilter>[]>(() => {
    const failedCount = baseFilteredTraces.filter((r) => !isCiPassed(r.pr)).length;
    const reviewCount = baseFilteredTraces.filter((r) => isNeedsReview(r.pr)).length;
    const trailerCount = baseFilteredTraces.filter((r) => !r.pr.commitTrailerComplete).length;

    return [
      {
        id: `${quickTabIdPrefix}-ALL`,
        value: 'ALL',
        label: '全部 PR',
        count: baseFilteredTraces.length,
      },
      {
        id: `${quickTabIdPrefix}-FAILED_CI`,
        value: 'FAILED_CI',
        label: 'CI 拦截',
        count: failedCount,
        dotTone: failedCount > 0 ? 'danger' : undefined,
      },
      {
        id: `${quickTabIdPrefix}-NEEDS_REVIEW`,
        value: 'NEEDS_REVIEW',
        label: '待 Review',
        count: reviewCount,
        dotTone: reviewCount > 0 ? 'warn' : undefined,
      },
      {
        id: `${quickTabIdPrefix}-TRAILER_INCOMPLETE`,
        value: 'TRAILER_INCOMPLETE',
        label: 'Trailer 缺失',
        count: trailerCount,
        dotTone: trailerCount > 0 ? 'danger' : undefined,
      },
    ];
  }, [baseFilteredTraces, quickTabIdPrefix]);

  const filteredTraces = useMemo(() => {
    return baseFilteredTraces.filter((row) => {
      if (quickFilter === 'FAILED_CI') return !isCiPassed(row.pr);
      if (quickFilter === 'NEEDS_REVIEW') return isNeedsReview(row.pr);
      if (quickFilter === 'TRAILER_INCOMPLETE') return !row.pr.commitTrailerComplete;
      return true;
    });
  }, [baseFilteredTraces, quickFilter]);

  const hasActiveFilters =
    wpFilter !== 'ALL' ||
    waveFilter !== 'ALL' ||
    executorFilter !== 'ALL' ||
    quickFilter !== 'ALL';

  const resetFilters = () => {
    setWpFilter('ALL');
    setWaveFilter('ALL');
    setExecutorFilter('ALL');
    setQuickFilter('ALL');
  };

  const batchCliCommand = useMemo(() => {
    const parts = ['agent-kit batch-plan'];
    if (waveFilter !== 'ALL') parts.push(`--wave ${waveFilter}`);
    if (wpFilter !== 'ALL') parts.push(`--wp ${wpFilter}`);
    if (executorFilter === 'Blitzy (Blackbox)') {
      parts.push('--executor blitzy --strict-exit-gate');
    } else if (executorFilter === 'Copilot Squad') {
      parts.push('--executor copilot');
    } else if (executorFilter === 'Deterministic Script') {
      parts.push('--executor deterministic');
    }
    if (quickFilter === 'FAILED_CI') parts.push('--only-failed-ci');
    else if (quickFilter === 'NEEDS_REVIEW') parts.push('--awaiting-review');
    else if (quickFilter === 'TRAILER_INCOMPLETE') parts.push('--audit-trailers');
    parts.push(`--scope ${scope === 'MINE' ? 'mine' : 'all'}`);
    return parts.join(' ');
  }, [executorFilter, quickFilter, scope, waveFilter, wpFilter]);

  const wpSelectOptions = useMemo<SelectFieldOption<'ALL' | WorkPackageCode>[]>(
    () => [
      { value: 'ALL', label: '全部 (WP-00~07)' },
      ...WP_OPTIONS.map((wp) => ({ value: wp, label: `${wp} · ${WP_SHORT_LABELS[wp]}` })),
    ],
    [],
  );

  const waveSelectOptions = useMemo<SelectFieldOption<'ALL' | WaveId>[]>(
    () => [
      { value: 'ALL', label: '全部 (W0~W4)' },
      ...WAVE_OPTIONS.map((wave) => ({ value: wave, label: wave })),
    ],
    [],
  );

  // Aggregate AgentCore PR Auto Review findings live from baseFilteredTraces
  const { findingAgents, findingItems, findingUnitMap } = useMemo(() => {
    const reviewerMeta: Record<
      'Blast-Radius' | 'Migration-Semantics' | 'Contract & Blitzy-Gate',
      { id: string; model: string; step: string }
    > = {
      'Blast-Radius': {
        id: 'Blast-Radius',
        model: 'Graphify AST · MicroVM',
        step: '检查变更文件爆炸半径与跨表耦合',
      },
      'Migration-Semantics': {
        id: 'Migration-Semantics',
        model: 'OpenWiki OKF · Bedrock',
        step: '核对业务规则语义与 Sybase 逻辑等价',
      },
      'Contract & Blitzy-Gate': {
        id: 'Contract & Blitzy-Gate',
        model: 'WP-00 & Cedar Policy',
        step: '校验 Commit Trailer、脏文件与 Blitzy 双跑门禁',
      },
    };

    const counts: Record<keyof typeof reviewerMeta, number> = {
      'Blast-Radius': 0,
      'Migration-Semantics': 0,
      'Contract & Blitzy-Gate': 0,
    };
    const items: Finding[] = [];
    const unitLookup = new Map<string, string>();
    let totalAutoReviews = 0;

    baseFilteredTraces.forEach((row, rowIdx) => {
      const ac = row.pr.autoReview;
      if (!ac) return;
      totalAutoReviews += 1;
      ac.findings.forEach((f, fIdx) => {
        counts[f.reviewer] += 1;
        if (f.severity === 'PASS') return;
        const fid = `${row.id}-${f.reviewer}-${fIdx}`;
        unitLookup.set(fid, row.unitId);
        items.push({
          id: fid,
          agentId: f.reviewer,
          title: `${row.unitCode} ${row.pr.prNumber}: ${f.summary}`,
          severity: f.severity === 'BLOCK' ? 'critical' : 'warning',
          location: f.graphImpactNodes
            ? `${row.wpCode} · Graph ${f.graphImpactNodes} nodes`
            : `${row.wpCode} · ${row.pr.branch}`,
          at: FINDING_CLOCK_NOW - (rowIdx * 4 + fIdx + 1) * 180_000,
        });
      });
    });

    const denominator = Math.max(1, totalAutoReviews);
    const agents: FindingAgent[] = (
      Object.keys(reviewerMeta) as Array<keyof typeof reviewerMeta>
    ).map((key) => {
      const done = Math.max(counts[key], totalAutoReviews);
      const hasRunning = baseFilteredTraces.some((r) => r.pr.autoReview?.verdict === 'RUNNING');
      return {
        id: reviewerMeta[key].id,
        name: key,
        model: reviewerMeta[key].model,
        step: reviewerMeta[key].step,
        done: hasRunning ? Math.max(0, done - 1) : done,
        total: Math.max(done, denominator),
        status: hasRunning ? 'running' : 'done',
      };
    });

    // Put critical findings first for immediate operator attention
    items.sort((a, b) => {
      const rank = { critical: 0, warning: 1, note: 2 } as const;
      return rank[a.severity] - rank[b.severity];
    });

    return { findingAgents: agents, findingItems: items, findingUnitMap: unitLookup };
  }, [baseFilteredTraces]);

  const activeRowId = useMemo(() => {
    if (!inspectorUnitId) return null;
    return filteredTraces.find((t) => t.unitId === inspectorUnitId)?.id ?? null;
  }, [filteredTraces, inspectorUnitId]);

  const columns = useMemo<DataTableColumn<BatchTraceRecord>[]>(
    () => [
      {
        id: 'app',
        header: '应用',
        isRowHeader: true,
        width: '190px',
        accessor: (row) => `${row.unitCode} ${row.unitName}`,
        cell: (row) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="font-mono-tabular text-[12.5px] font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                {row.unitCode}
              </span>
              <Badge mono>{row.wave}</Badge>
              {row.disposition === 'Modernize' && (
                <span
                  className="font-mono-tabular text-[10.5px]"
                  style={{ color: 'var(--accent)' }}
                >
                  Mod
                </span>
              )}
            </div>
            <div
              className="mt-0.5 max-w-[175px] truncate text-[11.5px] font-normal"
              style={{ color: 'var(--ink-muted)' }}
              title={`${row.unitName} · ${row.owner}`}
            >
              {row.unitName} · {row.owner.split(' ')[0]}
            </div>
          </div>
        ),
      },
      {
        id: 'wp',
        header: '工作包',
        width: '126px',
        accessor: (row) => row.wpCode,
        cell: (row) => (
          <div className="min-w-0">
            <div
              className="font-mono-tabular text-[12px] font-medium"
              style={{ color: 'var(--ink)' }}
            >
              {row.wpCode}
            </div>
            <div
              className="mt-0.5 max-w-[116px] truncate text-[11px]"
              style={{ color: 'var(--ink-muted)' }}
              title={WP_LABELS[row.wpCode]}
            >
              {WP_SHORT_LABELS[row.wpCode]}
            </div>
          </div>
        ),
      },
      {
        id: 'jira',
        header: 'Jira & Work Log',
        width: '150px',
        accessor: (row) => row.jiraKey,
        cell: (row) => {
          const jMeta = JIRA_STATUS_META[row.pr.jiraStatus];
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="font-mono-tabular text-[12px] font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  {row.jiraKey}
                </span>
                <span
                  className="font-mono-tabular text-[11px]"
                  style={{ color: jMeta.color }}
                >
                  {jMeta.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: row.pr.jiraWorkLogSynced
                      ? 'var(--signal-ok)'
                      : 'var(--signal-warn)',
                  }}
                  aria-hidden="true"
                />
                <span
                  className="text-[11px]"
                  style={{
                    color: row.pr.jiraWorkLogSynced ? 'var(--ink-muted)' : 'var(--signal-warn)',
                  }}
                >
                  {row.pr.jiraWorkLogSynced ? 'Work Log 已同步' : 'Work Log 未回写'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'pr',
        header: 'PR & Branch',
        width: '290px',
        accessor: (row) => row.pr.prNumber,
        cell: (row) => (
          <div className="min-w-0 max-w-[280px] space-y-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <GitPullRequest
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--ink-faint)' }}
                aria-hidden="true"
              />
              <span
                className="font-mono-tabular text-[12px] font-medium shrink-0"
                style={{ color: 'var(--ink)' }}
              >
                {row.pr.prNumber}
              </span>
              <span
                className="truncate text-[12px]"
                style={{ color: 'var(--ink-secondary)' }}
                title={row.pr.title}
              >
                {row.pr.title}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="inline-flex items-center gap-1 truncate font-mono-tabular text-[11px]"
                style={{ color: 'var(--ink-faint)' }}
                title={row.pr.branch}
              >
                <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{row.pr.branch}</span>
              </span>
              {row.pr.commitTrailerComplete ? (
                <span
                  className="font-mono-tabular text-[10.5px] shrink-0"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  Trailer ✓
                </span>
              ) : (
                <Badge tone="danger" mono>
                  Trailer 缺失
                </Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'executor',
        header: 'AI 来源',
        width: '185px',
        accessor: (row) => row.pr.aiExecutor,
        cell: (row) => {
          const isBlitzy = row.pr.aiExecutor === 'Blitzy (Blackbox)';
          const isDeprecatedKit = row.pr.agentKitVersion === 'v1.2.4';
          return (
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5">
                {isBlitzy ? (
                  <Badge tone="accent">
                    <Bot className="h-3 w-3" aria-hidden="true" />
                    Blitzy (Blackbox)
                  </Badge>
                ) : (
                  <span
                    className="text-[12px] font-medium"
                    style={{
                      color:
                        row.pr.aiExecutor === 'Deterministic Script'
                          ? 'var(--ink-muted)'
                          : 'var(--ink)',
                    }}
                  >
                    {row.pr.aiExecutor}
                  </span>
                )}
              </div>
              <div
                className="flex items-center gap-1.5 font-mono-tabular text-[11px] truncate"
                style={{ color: 'var(--ink-faint)' }}
                title={`${row.pr.aiModel} · agent-kit ${row.pr.agentKitVersion}`}
              >
                <span className="truncate max-w-[120px]">{row.pr.aiModel}</span>
                <span>·</span>
                <span
                  style={{
                    color: isDeprecatedKit ? 'var(--signal-danger)' : 'var(--ink-muted)',
                    fontWeight: isDeprecatedKit ? 600 : 400,
                  }}
                >
                  {row.pr.agentKitVersion}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'verification',
        header: 'Verification Loop',
        width: '215px',
        accessor: (row) => ciPassScore(row.pr),
        cell: (row) => <VerificationTriad pr={row.pr} />,
      },
      {
        id: 'review',
        header: 'Review & 状态',
        width: '165px',
        accessor: (row) => REVIEW_STATE_META[row.pr.reviewState].rank,
        cell: (row) => {
          const rMeta = REVIEW_STATE_META[row.pr.reviewState];
          const ac = row.pr.autoReview;
          const blockCount =
            ac?.findings.filter((f) => f.severity === 'BLOCK').length ?? 0;
          return (
            <div className="space-y-1">
              <StatusDot tone={rMeta.tone} label={rMeta.label} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className="text-[11px]"
                  style={{
                    color: row.pr.independentReview
                      ? 'var(--ink-faint)'
                      : 'var(--signal-warn)',
                  }}
                >
                  {row.pr.independentReview ? '独立审 ✓' : '缺独立审'}
                </span>
                {ac && (
                  <Tooltip
                    content={`AWS AgentCore ${ac.sessionId} · Cedar ${ac.cedarPolicy} · ${ac.bedrockModel}`}
                    side="top"
                  >
                    <span
                      tabIndex={0}
                      className="font-mono-tabular text-[10.5px] cursor-help"
                      style={{
                        color:
                          ac.verdict === 'CHANGES_REQUESTED'
                            ? 'var(--signal-danger)'
                            : 'var(--ink-faint)',
                      }}
                    >
                      {ac.verdict === 'CHANGES_REQUESTED'
                        ? `AgentCore 拦截(${Math.max(1, blockCount)})`
                        : 'AgentCore 预审 ✓'}
                    </span>
                  </Tooltip>
                )}
                {row.pr.dirtyFilesCount > 0 && (
                  <Badge tone="danger" mono>
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {row.pr.dirtyFilesCount} 脏文件
                  </Badge>
                )}
              </div>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {/* Compact Header Bar + Inline Summary Counters */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="text-[16px] font-semibold tracking-[-0.015em]"
              style={{ color: 'var(--ink)' }}
            >
              批次追踪 · Batch Traceability
            </h1>
            <Badge mono>
              {scope === 'MINE' ? `我的应用 · ${CURRENT_ENGINEER.handle}` : '全项目聚合视图'}
            </Badge>
          </div>
          <p className="text-[12.5px]" style={{ color: 'var(--ink-muted)' }}>
            跨应用水平聚合 Jira ↔ Branch/PR ↔ AI 来源 ↔ Verification Loop ↔ AWS AgentCore 预审与独立 Review；点击任意行打开右侧详情抽屉。
          </p>
        </div>

        {/* Inline Tabular Summary Strip */}
        <div
          className="mcp-surface flex flex-wrap items-center divide-x px-1 py-1.5"
          style={{ borderColor: 'var(--line)' }}
          aria-label="批次追踪汇总指标"
        >
          <div className="px-3 flex items-center gap-1.5">
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              PR 追踪
            </span>
            <span
              className="font-mono-tabular text-[13px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              <NumberTicker value={summary.total} duration={400} />
            </span>
          </div>
          <div className="px-3 flex items-center gap-1.5" style={{ borderColor: 'var(--line)' }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'var(--signal-ok)' }}
              aria-hidden="true"
            />
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              CI 通过
            </span>
            <span
              className="font-mono-tabular text-[13px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              <NumberTicker value={summary.ciPassed} duration={400} />
            </span>
          </div>
          <div className="px-3 flex items-center gap-1.5" style={{ borderColor: 'var(--line)' }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  summary.ciFailed > 0 ? 'var(--signal-danger)' : 'var(--ink-faint)',
              }}
              aria-hidden="true"
            />
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              CI 失败
            </span>
            <span
              className="font-mono-tabular text-[13px] font-semibold"
              style={{
                color: summary.ciFailed > 0 ? 'var(--signal-danger)' : 'var(--ink)',
              }}
            >
              <NumberTicker value={summary.ciFailed} duration={400} />
            </span>
          </div>
          <div className="px-3 flex items-center gap-1.5" style={{ borderColor: 'var(--line)' }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  summary.awaitingReview > 0 ? 'var(--signal-warn)' : 'var(--ink-faint)',
              }}
              aria-hidden="true"
            />
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              待 Review
            </span>
            <span
              className="font-mono-tabular text-[13px] font-semibold"
              style={{
                color: summary.awaitingReview > 0 ? 'var(--signal-warn)' : 'var(--ink)',
              }}
            >
              <NumberTicker value={summary.awaitingReview} duration={400} />
            </span>
          </div>
          <div className="px-3 flex items-center gap-1.5" style={{ borderColor: 'var(--line)' }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  summary.agentCoreBlocked > 0 ? 'var(--signal-danger)' : 'var(--ink-faint)',
              }}
              aria-hidden="true"
            />
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              AgentCore 拦截
            </span>
            <span
              className="font-mono-tabular text-[13px] font-semibold"
              style={{
                color: summary.agentCoreBlocked > 0 ? 'var(--signal-danger)' : 'var(--ink)',
              }}
            >
              <NumberTicker value={summary.agentCoreBlocked} duration={400} />
            </span>
          </div>
          <div className="px-3 flex items-center gap-1.5" style={{ borderColor: 'var(--line)' }}>
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              Blitzy PR
            </span>
            <span
              className="font-mono-tabular text-[13px] font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              <NumberTicker value={summary.blitzyCount} duration={400} />
            </span>
          </div>
        </div>
      </header>

      {/* Filter Toolbar + Dynamic Local Batch CLI Command */}
      <section
        className="mcp-surface p-3 space-y-3"
        aria-label="批次筛选与本机命令生成"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Work Package Selector (Base UI Select) */}
            <div className="inline-flex items-center gap-1.5 text-[12px]">
              <span style={{ color: 'var(--ink-muted)' }}>工作包</span>
              <SelectField<'ALL' | WorkPackageCode>
                ariaLabel="按工作包筛选"
                value={wpFilter}
                onChange={setWpFilter}
                options={wpSelectOptions}
                mono
              />
            </div>

            {/* Wave Selector (Base UI Select) */}
            <div className="inline-flex items-center gap-1.5 text-[12px]">
              <span style={{ color: 'var(--ink-muted)' }}>波次</span>
              <SelectField<'ALL' | WaveId>
                ariaLabel="按迁移波次筛选"
                value={waveFilter}
                onChange={setWaveFilter}
                options={waveSelectOptions}
                mono
              />
            </div>

            {/* AI Executor Selector (Base UI Select) */}
            <div className="inline-flex items-center gap-1.5 text-[12px]">
              <span style={{ color: 'var(--ink-muted)' }}>AI 来源</span>
              <SelectField<ExecutorFilter>
                ariaLabel="按 AI 来源筛选"
                value={executorFilter}
                onChange={setExecutorFilter}
                options={EXECUTOR_OPTIONS}
              />
            </div>

            <AnimatePresence initial={false}>
              {hasActiveFilters && (
                <motion.div
                  key="reset-trace-filters"
                  className="inline-flex"
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                  transition={prefersReducedMotion ? { duration: 0.01 } : TRANSITION_FAST}
                >
                  <Button variant="ghost" size="xs" onClick={resetFilters}>
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    重置筛选
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <span
            className="inline-flex items-center gap-1 font-mono-tabular text-[11.5px]"
            style={{ color: 'var(--ink-faint)' }}
          >
            <span>显示</span>
            <NumberTicker value={filteredTraces.length} duration={400} />
            <span>/ {scopedBatchTraces.length} 条 PR 追踪</span>
          </span>
        </div>

        {/* Quick Filter Hairline Tabs */}
        <HairlineTabs<QuickFilter>
          ariaLabel="快捷状态筛选"
          size="sm"
          value={quickFilter}
          onChange={setQuickFilter}
          options={quickTabOptions}
        />

        {/* Dynamic Local CLI Command */}
        <CopyCommandBar
          command={batchCliCommand}
          label="本地批量追踪 / 复检命令 (agent-kit CLI)"
          description="随当前筛选条件实时生成；于工程师本机终端执行（ECS 控制台零远程调度）"
          onCopy={() => notifyCopied('agent-kit batch-plan 命令')}
        />
      </section>

      {/* AWS AgentCore PR Auto Review Swarm Findings */}
      {findingAgents.length > 0 && (
        <section aria-label="AgentCore 多审校器发现流">
          <AgentFindings
            title="AgentCore PR Auto Review · 多审校器拦截与告警流（点击审校器筛选 · 点击条目打开应用抽屉）"
            agents={findingAgents}
            findings={findingItems}
            rows={4}
            now={FINDING_CLOCK_NOW}
            onOpen={(finding) => {
              const uid = findingUnitMap.get(finding.id);
              if (uid) openInspector(uid, 'trace');
            }}
          />
        </section>
      )}

      {/* Main Dense Sortable Traceability Table */}
      <section aria-label="水平批次追踪明细表">
        <div
          role="tabpanel"
          aria-labelledby={`${quickTabIdPrefix}-${quickFilter}`}
        >
          <BlurCrossfade
            id={`${scope}:${quickFilter}:${wpFilter}:${waveFilter}:${executorFilter}`}
            duration={160}
            blur={3}
            morph="height"
          >
            <DataTable<BatchTraceRecord>
              caption="跨应用水平批次追踪（Jira、PR、AI 来源、Verification Loop 与 Review）"
              data={filteredTraces}
              columns={columns}
              getRowId={(row) => row.id}
              activeRowId={activeRowId}
              onRowClick={(row) => openInspector(row.unitId, 'trace')}
              sorting={sorting}
              onSortingChange={setSorting}
              density="dense"
              emptyTitle="当前筛选条件下暂无匹配 PR 追踪记录"
              emptyDescription="请放宽工作包、波次或快捷状态筛选，或在顶栏切换「All Apps / My Apps」视角。"
              emptyAction={
                hasActiveFilters ? (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                    清除全部筛选
                  </Button>
                ) : undefined
              }
            />
          </BlurCrossfade>
        </div>
      </section>
    </div>
  );
}
