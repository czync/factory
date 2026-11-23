import { useId, useMemo, useState } from 'react';
import { BarChart3, RotateCcw, Search, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useFactory } from '@/data/store';
import {
  PROGRAM_TOTALS,
  STAGE_ORDER,
  type AiExecutorKind,
  type Disposition,
  type MigrationUnit,
  type RiskLevel,
  type StageId,
  type WaveId,
} from '@/data/types';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button, StatusDot, type SignalTone } from '@/components/ui/Primitives';
import {
  CompactBreakdown,
  type BreakdownItem,
  type BreakdownPeriod,
} from '@/components/uipros/compact-breakdown-clean';
import { NumberTicker } from '@/components/uipros/number-ticker';
import {
  SegmentedControl,
  type SegmentOption,
} from '@/components/uipros/segmented-control-clean';
import {
  SPRING_TACTILE,
  TAP_PRESS,
  TRANSITION_FAST,
  TRANSITION_OVERLAY,
} from '@/lib/motion';

type WaveFilter = 'ALL' | WaveId;
type DispositionFilter = 'ALL' | Disposition;
type QuickFilter = 'ALL' | 'BLOCKED' | 'STALE_WIKI' | 'OUTDATED_KIT';
type BreakdownPeriodId = 'wave' | 'disposition' | 'risk';

const WAVE_OPTIONS: readonly WaveFilter[] = ['ALL', 'W0', 'W1', 'W2', 'W3', 'W4'];
const WAVE_SEGMENT_OPTIONS: SegmentOption<WaveFilter>[] = WAVE_OPTIONS.map((wave) => ({
  value: wave,
  label: <span className="font-mono-tabular">{wave}</span>,
  ariaLabel: wave === 'ALL' ? '全部 Wave' : wave,
}));

const DISPOSITION_SEGMENT_OPTIONS: SegmentOption<DispositionFilter>[] = [
  { value: 'ALL', label: '全部' },
  { value: 'As-Is', label: 'As-Is' },
  { value: 'Modernize', label: 'Modernize' },
  { value: 'Retire', label: 'Retire' },
];

const QUICK_SEGMENT_OPTIONS: SegmentOption<QuickFilter>[] = [
  { value: 'ALL', label: '全部' },
  { value: 'BLOCKED', label: '仅看阻塞' },
  { value: 'STALE_WIKI', label: 'Wiki 过期' },
  { value: 'OUTDATED_KIT', label: 'agent-kit 过期' },
];

const BREAKDOWN_PERIODS: BreakdownPeriod[] = [
  { id: 'wave', label: '波次' },
  { id: 'disposition', label: '去向' },
  { id: 'risk', label: '风险' },
];

const SHORT_STAGE: Record<StageId, string> = {
  Intake: '立项',
  Discovery: '发现',
  'WP-00': 'WP-00',
  Spec: '规格',
  Build: '改造',
  Verify: '验证',
  ProdParallel: '并行',
  Cutover: '切换',
  Decommission: '下线',
};

function shortExecutorLabel(executor: AiExecutorKind): string {
  switch (executor) {
    case 'Copilot Squad':
      return 'Copilot';
    case 'Blitzy (Blackbox)':
      return 'Blitzy';
    case 'Deterministic Script':
      return 'Script';
    case 'Manual':
      return 'Manual';
  }
}

function getVerificationSummary(unit: MigrationUnit): {
  tone: SignalTone;
  label: string;
  sublabel?: string;
  rank: number;
} {
  const hasCiFailure = unit.activePrs.some(
    (p) => !p.lintPassed || !p.schemaPassed || !p.commitTrailerComplete || p.dirtyFilesCount > 0,
  );
  if (hasCiFailure) {
    return { tone: 'danger', label: 'CI 拦截', sublabel: unit.wp00.status === 'DUAL_RUN_DIFF' ? 'WP-00 差异' : undefined, rank: 0 };
  }
  if (unit.wp00.status === 'DUAL_RUN_DIFF') {
    return { tone: 'danger', label: 'WP-00 差异', sublabel: `${unit.wp00.diffClusters.length} 簇`, rank: 1 };
  }
  if (unit.disposition === 'Retire') {
    return { tone: 'neutral', label: '下线免双跑', rank: 4 };
  }
  if (unit.wp00.status === 'NOT_STARTED') {
    return { tone: 'warn', label: '缺 WP-00', sublabel: '未封存', rank: 2 };
  }
  if (unit.wp00.status === 'CAPTURING') {
    return { tone: 'warn', label: '基线采集中', rank: 3 };
  }
  const pendingReview = unit.activePrs.some((p) => !p.independentReview);
  if (pendingReview) {
    return { tone: 'warn', label: 'CI 绿 · 待审', rank: 4 };
  }
  return {
    tone: 'ok',
    label: unit.wp00.status === 'PARITY_VERIFIED' ? 'WP-00 · CI 绿' : '基线封存 · CI 绿',
    rank: 5,
  };
}

function getKnowledgeRank(unit: MigrationUnit): number {
  if (unit.knowledge.openwikiStatus === 'STALE') return 0;
  if (unit.knowledge.openwikiStatus === 'MISSING' && unit.disposition !== 'Retire') return 1;
  if (unit.knowledge.graphifyStatus === 'PARTIAL_LEGACY') return 2;
  return 3;
}

function getBlockerRank(unit: MigrationUnit): number {
  const riskWeight = unit.riskLevel === 'HIGH' ? 0 : unit.riskLevel === 'WATCH' ? 1 : 2;
  return riskWeight * 1000 - unit.waitDays;
}

function isHighRiskBlocked(unit: MigrationUnit): boolean {
  return unit.riskLevel === 'HIGH';
}

function isStaleWiki(unit: MigrationUnit): boolean {
  return (
    unit.knowledge.openwikiStatus === 'STALE' ||
    (unit.knowledge.openwikiStatus === 'MISSING' && unit.disposition !== 'Retire')
  );
}

function isOutdatedKit(unit: MigrationUnit): boolean {
  return unit.agentKitOutdated;
}

export function ApplicationsPage() {
  const { scopedUnits, scope, inspectorUnitId, openInspector } = useFactory();
  const prefersReducedMotion = Boolean(useReducedMotion());
  const breakdownPanelId = useId();

  const [search, setSearch] = useState('');
  const [waveFilter, setWaveFilter] = useState<WaveFilter>('ALL');
  const [dispositionFilter, setDispositionFilter] = useState<DispositionFilter>('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [breakdownPeriod, setBreakdownPeriod] = useState<BreakdownPeriodId>('wave');

  const summary = useMemo(() => {
    let highRisk = 0;
    let staleWiki = 0;
    let outdatedKit = 0;
    let activePrs = 0;
    for (const u of scopedUnits) {
      if (isHighRiskBlocked(u)) highRisk += 1;
      if (isStaleWiki(u)) staleWiki += 1;
      if (isOutdatedKit(u)) outdatedKit += 1;
      activePrs += u.activePrs.length;
    }
    return { highRisk, staleWiki, outdatedKit, activePrs };
  }, [scopedUnits]);

  const breakdownItems = useMemo<BreakdownItem[]>(() => {
    if (breakdownPeriod === 'wave') {
      const counts: Record<WaveId, number> = { W0: 0, W1: 0, W2: 0, W3: 0, W4: 0 };
      for (const u of scopedUnits) {
        counts[u.wave] += 1;
      }
      return [
        { id: 'wave-W0', label: 'W0', value: counts.W0, color: 'var(--accent)' },
        {
          id: 'wave-W1',
          label: 'W1',
          value: counts.W1,
          color: 'color-mix(in srgb, var(--accent) 74%, transparent)',
        },
        {
          id: 'wave-W2',
          label: 'W2',
          value: counts.W2,
          color: 'color-mix(in srgb, var(--accent) 52%, transparent)',
        },
        {
          id: 'wave-W3',
          label: 'W3',
          value: counts.W3,
          color: 'color-mix(in srgb, var(--accent) 32%, transparent)',
        },
        { id: 'wave-W4', label: 'W4', value: counts.W4, color: 'var(--ink-faint)' },
      ];
    }

    if (breakdownPeriod === 'disposition') {
      const counts: Record<Disposition, number> = {
        'As-Is': 0,
        Modernize: 0,
        Retire: 0,
      };
      for (const u of scopedUnits) {
        counts[u.disposition] += 1;
      }
      return [
        {
          id: 'disp-As-Is',
          label: 'As-Is',
          value: counts['As-Is'],
          color: 'color-mix(in srgb, var(--accent) 58%, var(--ink-muted))',
        },
        {
          id: 'disp-Modernize',
          label: 'Modernize',
          value: counts.Modernize,
          color: 'var(--accent)',
        },
        {
          id: 'disp-Retire',
          label: 'Retire',
          value: counts.Retire,
          color: 'var(--ink-faint)',
        },
      ];
    }

    const counts: Record<RiskLevel, number> = {
      HIGH: 0,
      WATCH: 0,
      ON_TRACK: 0,
    };
    for (const u of scopedUnits) {
      counts[u.riskLevel] += 1;
    }
    return [
      { id: 'risk-HIGH', label: 'HIGH · 高风险', value: counts.HIGH, color: 'var(--signal-danger)' },
      { id: 'risk-WATCH', label: 'WATCH · 关注', value: counts.WATCH, color: 'var(--signal-warn)' },
      {
        id: 'risk-ON_TRACK',
        label: 'ON_TRACK · 受控',
        value: counts.ON_TRACK,
        color: 'var(--signal-ok)',
      },
    ];
  }, [breakdownPeriod, scopedUnits]);

  const topBreakdownItem = useMemo(() => {
    let best: BreakdownItem | undefined;
    for (const item of breakdownItems) {
      if (item.value > 0 && (!best || item.value > best.value)) {
        best = item;
      }
    }
    return best;
  }, [breakdownItems]);

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedUnits.filter((u) => {
      if (waveFilter !== 'ALL' && u.wave !== waveFilter) return false;
      if (dispositionFilter !== 'ALL' && u.disposition !== dispositionFilter) return false;
      if (quickFilter === 'BLOCKED' && !isHighRiskBlocked(u)) return false;
      if (quickFilter === 'STALE_WIKI' && !isStaleWiki(u)) return false;
      if (quickFilter === 'OUTDATED_KIT' && !isOutdatedKit(u)) return false;

      if (q.length > 0) {
        const haystack =
          `${u.code} ${u.name} ${u.domain} ${u.owner} ${u.jiraKey} ${u.techStack} ${u.wave} ${u.blockerSummary ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [dispositionFilter, quickFilter, scopedUnits, search, waveFilter]);

  const hasActiveFilter =
    search.trim().length > 0 ||
    waveFilter !== 'ALL' ||
    dispositionFilter !== 'ALL' ||
    quickFilter !== 'ALL';

  const resetFilters = () => {
    setSearch('');
    setWaveFilter('ALL');
    setDispositionFilter('ALL');
    setQuickFilter('ALL');
  };

  const columns = useMemo<readonly DataTableColumn<MigrationUnit>[]>(
    () => [
      {
        id: 'unit',
        header: '应用 / 单元',
        isRowHeader: true,
        width: '216px',
        accessor: (u) => u.code,
        cell: (u) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="font-mono-tabular text-[12px] font-semibold shrink-0"
                style={{ color: 'var(--ink)' }}
              >
                {u.code}
              </span>
              <span
                className="truncate text-[12.5px] font-medium"
                style={{ color: 'var(--ink)' }}
                title={u.name}
              >
                {u.name}
              </span>
            </div>
            <div
              className="truncate text-[11px] leading-tight mt-0.5"
              style={{ color: 'var(--ink-muted)' }}
            >
              {u.domain} · {u.owner}
            </div>
          </div>
        ),
      },
      {
        id: 'waveDisposition',
        header: 'Wave · 去向',
        width: '120px',
        accessor: (u) => `${u.wave}-${u.disposition}`,
        cell: (u) => (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Badge mono>{u.wave}</Badge>
            <span
              className="text-[12px] font-medium"
              style={{
                color:
                  u.disposition === 'Modernize'
                    ? 'var(--accent)'
                    : u.disposition === 'Retire'
                      ? 'var(--ink-faint)'
                      : 'var(--ink-secondary)',
              }}
            >
              {u.disposition}
            </span>
          </div>
        ),
      },
      {
        id: 'stages',
        header: '三态进度',
        width: '164px',
        accessor: (u) => STAGE_ORDER.indexOf(u.controlledStage),
        cell: (u) => {
          const plannedIdx = STAGE_ORDER.indexOf(u.plannedStage);
          const observedIdx = STAGE_ORDER.indexOf(u.observedStage);
          const controlledIdx = STAGE_ORDER.indexOf(u.controlledStage);
          const obsBehind = observedIdx < plannedIdx;
          const ctlBehind = controlledIdx < plannedIdx;

          return (
            <div
              className="flex items-center gap-1 text-[11.5px] whitespace-nowrap font-mono-tabular"
              title={`计划: ${u.plannedStage} · 观测: ${u.observedStage} · 受控: ${u.controlledStage}`}
            >
              <span style={{ color: 'var(--ink-muted)' }}>{SHORT_STAGE[u.plannedStage]}</span>
              <span style={{ color: 'var(--ink-faint)' }} aria-hidden="true">
                →
              </span>
              <span style={{ color: obsBehind ? 'var(--signal-danger)' : 'var(--ink-secondary)' }}>
                {SHORT_STAGE[u.observedStage]}
              </span>
              <span style={{ color: 'var(--ink-faint)' }} aria-hidden="true">
                →
              </span>
              <span
                className="font-medium"
                style={{ color: ctlBehind ? 'var(--signal-danger)' : 'var(--ink)' }}
              >
                {SHORT_STAGE[u.controlledStage]}
              </span>
            </div>
          );
        },
      },
      {
        id: 'jiraPr',
        header: 'Jira ↔ PRs',
        width: '154px',
        accessor: (u) => u.activePrs.length,
        cell: (u) => {
          const primaryPr = u.activePrs[0];
          const execLabel = primaryPr ? shortExecutorLabel(primaryPr.aiExecutor) : null;
          const isBlitzy = primaryPr?.aiExecutor === 'Blitzy (Blackbox)';
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="font-mono-tabular text-[11.5px]"
                style={{ color: 'var(--ink)' }}
              >
                {u.jiraKey}
              </span>
              <span
                className="font-mono-tabular text-[11px]"
                style={{ color: 'var(--ink-muted)' }}
              >
                {u.activePrs.length} PR
              </span>
              {execLabel && (
                <Badge tone={isBlitzy ? 'accent' : 'neutral'} mono>
                  {execLabel}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: 'verification',
        header: 'Verification',
        width: '146px',
        accessor: (u) => getVerificationSummary(u).rank,
        cell: (u) => {
          const v = getVerificationSummary(u);
          return <StatusDot tone={v.tone} label={v.label} sublabel={v.sublabel} />;
        },
      },
      {
        id: 'knowledge',
        header: 'Knowledge',
        width: '138px',
        accessor: (u) => getKnowledgeRank(u),
        cell: (u) => {
          const { openwikiStatus, staleClaimsCount, totalClaimsCount, graphifyStatus } = u.knowledge;
          const partialTag = graphifyStatus === 'PARTIAL_LEGACY' ? 'AST部分' : undefined;

          if (openwikiStatus === 'STALE') {
            return (
              <StatusDot
                tone="warn"
                label={`${staleClaimsCount} 过期`}
                sublabel={partialTag ?? `/${totalClaimsCount}`}
                mono
              />
            );
          }
          if (openwikiStatus === 'MISSING') {
            return (
              <StatusDot
                tone={u.disposition === 'Retire' ? 'neutral' : 'warn'}
                label={u.disposition === 'Retire' ? '无需建库' : '未建库'}
              />
            );
          }
          return (
            <StatusDot
              tone="ok"
              label="Fresh"
              sublabel={partialTag ?? `${totalClaimsCount}c`}
              mono
            />
          );
        },
      },
      {
        id: 'agentKit',
        header: 'agent-kit',
        width: '92px',
        mono: true,
        accessor: (u) => u.agentKitVersion,
        cell: (u) =>
          u.agentKitOutdated ? (
            <StatusDot tone="warn" label={u.agentKitVersion} mono />
          ) : (
            <span className="font-mono-tabular text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
              {u.agentKitVersion}
            </span>
          ),
      },
      {
        id: 'blocker',
        header: '阻塞 / 排队',
        width: '216px',
        accessor: (u) => getBlockerRank(u),
        cell: (u) => (
          <div className="flex items-center justify-between gap-2 min-w-0">
            {u.blockerSummary ? (
              <span
                className="truncate text-[12px]"
                style={{
                  color:
                    u.riskLevel === 'HIGH' ? 'var(--signal-danger)' : 'var(--signal-warn)',
                }}
                title={u.blockerSummary}
              >
                {u.blockerSummary}
              </span>
            ) : (
              <StatusDot tone="ok" label="受控" />
            )}
            {u.waitDays > 0 && (
              <span
                className="font-mono-tabular text-[11px] shrink-0"
                style={{
                  color: u.onboardingSummary.p90Exceeded
                    ? 'var(--signal-danger)'
                    : 'var(--ink-faint)',
                }}
                title={`当前外部排队 ${u.waitDays} 天`}
              >
                {u.waitDays}d
              </span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      {/* Compact Single-Row Summary Strip (<= 44px height, zero hero bloat) */}
      <section
        aria-label="项目迁云指标摘要"
        className="mcp-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3.5 min-h-[40px] py-1.5"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <div className="inline-flex items-center gap-1.5">
            <span style={{ color: 'var(--ink-muted)' }}>
              {scope === 'MINE' ? '我负责应用' : '纳管代表单元'}
            </span>
            <span className="font-mono-tabular font-semibold" style={{ color: 'var(--ink)' }}>
              <NumberTicker value={scopedUnits.length} duration={400} />
            </span>
            {scope === 'ALL' && (
              <span className="font-mono-tabular text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                / {PROGRAM_TOTALS.totalApps} 总纳管
              </span>
            )}
          </div>

          <span className="h-3.5 w-px hidden sm:inline-block" style={{ backgroundColor: 'var(--line)' }} aria-hidden="true" />

          <motion.button
            type="button"
            aria-pressed={quickFilter === 'BLOCKED'}
            whileTap={prefersReducedMotion ? undefined : TAP_PRESS}
            transition={SPRING_TACTILE}
            onClick={() => setQuickFilter((prev) => (prev === 'BLOCKED' ? 'ALL' : 'BLOCKED'))}
            className="inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{
              backgroundColor: quickFilter === 'BLOCKED' ? 'var(--signal-danger-soft)' : 'transparent',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: summary.highRisk > 0 ? 'var(--signal-danger)' : 'var(--signal-ok)' }}
              aria-hidden="true"
            />
            <span style={{ color: 'var(--ink-muted)' }}>高风险</span>
            <span
              className="font-mono-tabular font-semibold"
              style={{ color: summary.highRisk > 0 ? 'var(--signal-danger)' : 'var(--ink)' }}
            >
              <NumberTicker value={summary.highRisk} duration={400} />
            </span>
          </motion.button>

          <motion.button
            type="button"
            aria-pressed={quickFilter === 'STALE_WIKI'}
            whileTap={prefersReducedMotion ? undefined : TAP_PRESS}
            transition={SPRING_TACTILE}
            onClick={() => setQuickFilter((prev) => (prev === 'STALE_WIKI' ? 'ALL' : 'STALE_WIKI'))}
            className="inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{
              backgroundColor: quickFilter === 'STALE_WIKI' ? 'var(--signal-warn-soft)' : 'transparent',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: summary.staleWiki > 0 ? 'var(--signal-warn)' : 'var(--signal-ok)' }}
              aria-hidden="true"
            />
            <span style={{ color: 'var(--ink-muted)' }}>Wiki 过期</span>
            <span
              className="font-mono-tabular font-semibold"
              style={{ color: summary.staleWiki > 0 ? 'var(--signal-warn)' : 'var(--ink)' }}
            >
              <NumberTicker value={summary.staleWiki} duration={400} />
            </span>
          </motion.button>

          <motion.button
            type="button"
            aria-pressed={quickFilter === 'OUTDATED_KIT'}
            whileTap={prefersReducedMotion ? undefined : TAP_PRESS}
            transition={SPRING_TACTILE}
            onClick={() => setQuickFilter((prev) => (prev === 'OUTDATED_KIT' ? 'ALL' : 'OUTDATED_KIT'))}
            className="inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{
              backgroundColor: quickFilter === 'OUTDATED_KIT' ? 'var(--signal-warn-soft)' : 'transparent',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: summary.outdatedKit > 0 ? 'var(--signal-warn)' : 'var(--signal-ok)' }}
              aria-hidden="true"
            />
            <span style={{ color: 'var(--ink-muted)' }}>agent-kit 过期</span>
            <span
              className="font-mono-tabular font-semibold"
              style={{ color: summary.outdatedKit > 0 ? 'var(--signal-warn)' : 'var(--ink)' }}
            >
              <NumberTicker value={summary.outdatedKit} duration={400} />
            </span>
          </motion.button>

          <span className="h-3.5 w-px hidden md:inline-block" style={{ backgroundColor: 'var(--line)' }} aria-hidden="true" />

          <div className="inline-flex items-center gap-1.5">
            <span style={{ color: 'var(--ink-muted)' }}>活跃 PR</span>
            <span className="font-mono-tabular font-semibold" style={{ color: 'var(--ink)' }}>
              <NumberTicker value={summary.activePrs} duration={400} />
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className="hidden xl:inline text-[11.5px]"
            style={{ color: 'var(--ink-faint)' }}
          >
            点击任意应用行打开右侧详情抽屉
          </span>
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={showBreakdown}
            aria-controls={breakdownPanelId}
            onClick={() => setShowBreakdown((prev) => !prev)}
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {showBreakdown ? '收起分布' : '分布透视'}
          </Button>
        </div>
      </section>

      {/* Compact Filter Toolbar */}
      <section
        aria-label="列表筛选工具栏"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Search Input */}
          <div
            className="relative flex items-center h-8 w-full sm:w-56 rounded-[6px] px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--line-strong)',
            }}
          >
            <Search
              className="h-3.5 w-3.5 shrink-0 mr-2"
              style={{ color: 'var(--ink-muted)' }}
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="筛选编号、应用、Jira、负责人…"
              aria-label="筛选应用列表"
              className="flex-1 min-w-0 bg-transparent text-[12px] outline-none placeholder:text-[var(--ink-faint)]"
              style={{ color: 'var(--ink)' }}
            />
            <AnimatePresence initial={false}>
              {search.length > 0 && (
                <motion.button
                  key="clear-search"
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="清空筛选词"
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.84 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.84 }}
                  transition={prefersReducedMotion ? { duration: 0.01 } : TRANSITION_FAST}
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Wave Filter SegmentedControl */}
          <SegmentedControl<WaveFilter>
            aria-label="按 Wave 波次筛选"
            variant="tray"
            size="sm"
            value={waveFilter}
            onChange={setWaveFilter}
            options={WAVE_SEGMENT_OPTIONS}
          />

          {/* Disposition Filter SegmentedControl */}
          <SegmentedControl<DispositionFilter>
            aria-label="按迁移去向筛选"
            variant="tray"
            size="sm"
            value={dispositionFilter}
            onChange={setDispositionFilter}
            options={DISPOSITION_SEGMENT_OPTIONS}
          />
        </div>

        {/* Right: Quick Filter & Count */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<QuickFilter>
            aria-label="快捷状态筛选"
            variant="tray"
            size="sm"
            value={quickFilter}
            onChange={setQuickFilter}
            options={QUICK_SEGMENT_OPTIONS}
          />

          <span
            className="font-mono-tabular text-[11.5px]"
            style={{ color: 'var(--ink-faint)' }}
          >
            {filteredUnits.length}/{scopedUnits.length}
          </span>

          <AnimatePresence initial={false}>
            {hasActiveFilter && (
              <motion.div
                key="reset-filters"
                className="inline-flex"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                transition={prefersReducedMotion ? { duration: 0.01 } : TRANSITION_FAST}
              >
                <Button variant="ghost" size="xs" onClick={resetFilters}>
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  重置
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Primary First-Viewport Dense Portfolio Table + Optional Side Distribution Card */}
      <div className="flex flex-col xl:flex-row items-start gap-3">
        <div className="min-w-0 w-full flex-1">
          <DataTable<MigrationUnit>
            caption="78 应用迁云全景台账"
            data={filteredUnits}
            columns={columns}
            getRowId={(row) => row.id}
            activeRowId={inspectorUnitId}
            onRowClick={(row) => openInspector(row.id, 'trace')}
            density="dense"
            maxHeight="max(440px, calc(100vh - 196px))"
            emptyTitle="没有符合筛选条件的应用单元"
            emptyDescription="清空搜索关键词或重置 Wave / 风险筛选条件后查看完整台账。"
            emptyAction={
              hasActiveFilter ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  清空筛选条件
                </Button>
              ) : undefined
            }
          />
        </div>

        <AnimatePresence initial={false}>
          {showBreakdown && (
            <motion.aside
              key="portfolio-breakdown"
              id={breakdownPanelId}
              aria-label="应用组合分布透视"
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.98, y: 4 }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.98, y: 4 }
              }
              transition={prefersReducedMotion ? { duration: 0.01 } : TRANSITION_OVERLAY}
              className="w-full max-w-[360px] xl:w-[288px] shrink-0"
            >
              <CompactBreakdown
                title="组合分布"
                items={breakdownItems}
                periods={BREAKDOWN_PERIODS}
                period={breakdownPeriod}
                onPeriodChange={(id) => setBreakdownPeriod(id as BreakdownPeriodId)}
                totalLabel={scope === 'MINE' ? '我负责应用单元' : '纳管代表单元'}
                footer={
                  topBreakdownItem ? (
                    <span key={`${breakdownPeriod}-${topBreakdownItem.id}`} className="ui-cbc__foot-in">
                      占比最高：<b title={topBreakdownItem.label} dir="auto">{topBreakdownItem.label}</b> · {topBreakdownItem.value}
                    </span>
                  ) : null
                }
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
