import { useId, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileCode2,
  Package,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import {
  Badge,
  Button,
  CopyCommandBar,
  EmptyState,
  HairlineTabs,
  StatusDot,
  type SignalTone,
} from '@/components/ui/Primitives';
import { useFactory } from '@/data/store';
import {
  PROGRAM_TOTALS,
  type AgentKitRelease,
  type DecisionQueueItem,
  type SmeRuleGroup,
  type SmeRuleItem,
  type VerificationRule,
} from '@/data/types';

type PageTab = 'standards' | 'signoff';
type RuleLayerFilter = 'ALL' | VerificationRule['layer'];
type SignoffFilter = 'PENDING' | 'ALL';

type SignoffSelection =
  | { kind: 'SME_GROUP'; id: string }
  | { kind: 'DECISION'; id: string };

const LAYER_LABELS: Record<VerificationRule['layer'], string> = {
  LINT: 'Lint',
  TYPE_SCHEMA: 'Type / Schema',
  LOCAL_VERIFY: 'Local Verify',
  PR_CI: 'PR CI',
};

const DECISION_KIND_LABEL: Record<DecisionQueueItem['kind'], string> = {
  UNREGISTERED_DB: '未登记 DB 依赖',
  DIFF_SIGNOFF: 'WP-00 差异签核',
  WAIVER: '结构化豁免',
};

const RELEASE_STATUS_BADGE: Record<
  AgentKitRelease['status'],
  { tone: SignalTone; label: string }
> = {
  LATEST: { tone: 'accent', label: 'LATEST' },
  SUPPORTED: { tone: 'neutral', label: 'SUPPORTED' },
  DEPRECATED: { tone: 'danger', label: 'DEPRECATED' },
};

function countPendingRules(group: SmeRuleGroup): number {
  return group.rules.filter((r) => r.status === 'PENDING').length;
}

export function StandardsReviewPage() {
  const {
    agentKitReleases,
    verificationRules,
    reviewBots,
    smeGroups,
    decisionQueue,
    confirmSmeRules,
    resolveDecisionItem,
    openInspector,
    notifyCopied,
  } = useFactory();

  const tabIdPrefix = useId();
  const [activeTab, setActiveTab] = useState<PageTab>('standards');
  const [layerFilter, setLayerFilter] = useState<RuleLayerFilter>('ALL');

  // Signoff & SME Workbench state
  const [signoffFilter, setSignoffFilter] = useState<SignoffFilter>('PENDING');
  const [selection, setSelection] = useState<SignoffSelection | null>(null);
  const [checkedRuleIdsByGroup, setCheckedRuleIdsByGroup] = useState<Record<string, string[]>>({});
  const [rejectingRuleId, setRejectingRuleId] = useState<string | null>(null);
  const [rejectRuleNote, setRejectRuleNote] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pendingCounts = useMemo(() => {
    const pendingSmeRules = smeGroups.reduce((sum, g) => sum + countPendingRules(g), 0);
    const pendingDecisions = decisionQueue.filter((d) => d.status === 'PENDING').length;
    return {
      pendingSmeRules,
      pendingDecisions,
      total: pendingSmeRules + pendingDecisions,
    };
  }, [decisionQueue, smeGroups]);

  const filteredRules = useMemo(() => {
    if (layerFilter === 'ALL') return verificationRules;
    return verificationRules.filter((r) => r.layer === layerFilter);
  }, [layerFilter, verificationRules]);

  const visibleSmeGroups = useMemo(() => {
    if (signoffFilter === 'PENDING') {
      return smeGroups.filter((g) => countPendingRules(g) > 0);
    }
    return smeGroups;
  }, [signoffFilter, smeGroups]);

  const visibleDecisions = useMemo(() => {
    if (signoffFilter === 'PENDING') {
      return decisionQueue.filter((d) => d.status === 'PENDING');
    }
    return decisionQueue;
  }, [decisionQueue, signoffFilter]);

  // Derive active selection safely without effect cascades
  const activeSelection = useMemo<SignoffSelection | null>(() => {
    if (selection) {
      if (
        selection.kind === 'SME_GROUP' &&
        visibleSmeGroups.some((g) => g.id === selection.id)
      ) {
        return selection;
      }
      if (
        selection.kind === 'DECISION' &&
        visibleDecisions.some((d) => d.id === selection.id)
      ) {
        return selection;
      }
    }
    const firstGroup = visibleSmeGroups[0];
    if (firstGroup) return { kind: 'SME_GROUP', id: firstGroup.id };
    const firstDecision = visibleDecisions[0];
    if (firstDecision) return { kind: 'DECISION', id: firstDecision.id };
    return null;
  }, [selection, visibleDecisions, visibleSmeGroups]);

  const activeSmeGroup = useMemo(() => {
    if (activeSelection?.kind !== 'SME_GROUP') return null;
    return smeGroups.find((g) => g.id === activeSelection.id) ?? null;
  }, [activeSelection, smeGroups]);

  const activeDecision = useMemo(() => {
    if (activeSelection?.kind !== 'DECISION') return null;
    return decisionQueue.find((d) => d.id === activeSelection.id) ?? null;
  }, [activeSelection, decisionQueue]);

  // Checked pending rules for the currently selected SME group
  const activeCheckedRuleIds = useMemo(() => {
    if (!activeSmeGroup) return [];
    const pendingIds = new Set(
      activeSmeGroup.rules.filter((r) => r.status === 'PENDING').map((r) => r.id),
    );
    const saved = checkedRuleIdsByGroup[activeSmeGroup.id] ?? [];
    return saved.filter((id) => pendingIds.has(id));
  }, [activeSmeGroup, checkedRuleIdsByGroup]);

  const toggleRuleChecked = (groupId: string, ruleId: string) => {
    setCheckedRuleIdsByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const exists = current.includes(ruleId);
      return {
        ...prev,
        [groupId]: exists ? current.filter((id) => id !== ruleId) : [...current, ruleId],
      };
    });
  };

  const toggleSelectAllPendingInGroup = (group: SmeRuleGroup) => {
    const pendingIds = group.rules.filter((r) => r.status === 'PENDING').map((r) => r.id);
    const allSelected =
      pendingIds.length > 0 && pendingIds.every((id) => activeCheckedRuleIds.includes(id));
    setCheckedRuleIdsByGroup((prev) => ({
      ...prev,
      [group.id]: allSelected ? [] : pendingIds,
    }));
  };

  const handleBatchConfirmRules = async (group: SmeRuleGroup) => {
    if (activeCheckedRuleIds.length === 0) return;
    setSubmitting(true);
    try {
      await confirmSmeRules(group.id, activeCheckedRuleIds, 'CONFIRMED');
      setCheckedRuleIdsByGroup((prev) => ({ ...prev, [group.id]: [] }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSingleRule = async (group: SmeRuleGroup, ruleId: string) => {
    setSubmitting(true);
    try {
      await confirmSmeRules(group.id, [ruleId], 'CONFIRMED');
      setCheckedRuleIdsByGroup((prev) => ({
        ...prev,
        [group.id]: (prev[group.id] ?? []).filter((id) => id !== ruleId),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSingleRule = async (group: SmeRuleGroup, rule: SmeRuleItem) => {
    const trimmed = rejectRuleNote.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await confirmSmeRules(group.id, [rule.id], 'REJECTED', trimmed);
      setRejectingRuleId(null);
      setRejectRuleNote('');
      setCheckedRuleIdsByGroup((prev) => ({
        ...prev,
        [group.id]: (prev[group.id] ?? []).filter((id) => id !== rule.id),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveDecision = async (
    item: DecisionQueueItem,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    setSubmitting(true);
    try {
      const trimmed = decisionNote.trim();
      await resolveDecisionItem(item.id, decision, trimmed || undefined);
      setDecisionNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const ruleColumns = useMemo<DataTableColumn<VerificationRule>[]>(
    () => [
      {
        id: 'code',
        header: '规则编号',
        isRowHeader: true,
        width: '170px',
        accessor: (row) => row.code,
        cell: (row) => (
          <div className="space-y-0.5">
            <div
              className="font-mono-tabular text-[12px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              {row.code}
            </div>
            <div>
              {row.status === 'ENFORCED' ? (
                <StatusDot tone="ok" label="Enforced" mono />
              ) : row.status === 'WARN' ? (
                <Badge tone="warn" mono>
                  WARN
                </Badge>
              ) : (
                <Badge tone="accent" mono>
                  NEW
                </Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'name',
        header: '规则名称与下沉说明',
        width: '320px',
        accessor: (row) => row.name,
        cell: (row) => (
          <div className="max-w-[330px] space-y-0.5">
            <div className="text-[12.5px] font-medium" style={{ color: 'var(--ink)' }}>
              {row.name}
            </div>
            <p className="text-[11.5px] text-pretty" style={{ color: 'var(--ink-muted)' }}>
              {row.description}
            </p>
          </div>
        ),
      },
      {
        id: 'layer',
        header: '层级',
        width: '115px',
        accessor: (row) => row.layer,
        cell: (row) => <Badge mono>{LAYER_LABELS[row.layer]}</Badge>,
      },
      {
        id: 'tool',
        header: '执行工具',
        width: '165px',
        accessor: (row) => row.tool,
        cell: (row) => (
          <span className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
            {row.tool}
          </span>
        ),
      },
      {
        id: 'wpScope',
        header: 'WP 范围',
        width: '125px',
        mono: true,
        accessor: (row) => row.wpScope,
      },
      {
        id: 'intercepts30d',
        header: '30d 拦截',
        align: 'right',
        width: '88px',
        mono: true,
        accessor: (row) => row.intercepts30d,
        cell: (row) => (
          <span
            className="font-mono-tabular text-[12.5px] font-medium"
            style={{ color: 'var(--ink)' }}
          >
            {row.intercepts30d}
          </span>
        ),
      },
      {
        id: 'passRate',
        header: '通过率',
        align: 'right',
        width: '84px',
        mono: true,
        accessor: (row) => row.passRate,
        cell: (row) => (
          <span
            className="font-mono-tabular text-[12px]"
            style={{
              color: row.passRate < 90 ? 'var(--signal-warn)' : 'var(--ink-secondary)',
            }}
          >
            {row.passRate.toFixed(1)}%
          </span>
        ),
      },
      {
        id: 'sourceCaseJira',
        header: '源案例 Jira',
        width: '104px',
        mono: true,
        accessor: (row) => row.sourceCaseJira,
        cell: (row) => (
          <span
            className="font-mono-tabular text-[12px] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {row.sourceCaseJira}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="text-[16px] font-semibold tracking-[-0.015em]"
              style={{ color: 'var(--ink)' }}
            >
              标准与签字 · Standards & Human Sign-Off
            </h1>
            <Badge mono>Governance</Badge>
          </div>
          <p className="text-[12.5px]" style={{ color: 'var(--ink-muted)' }}>
            管理 Artifactory{' '}
            <code className="font-mono-tabular" style={{ color: 'var(--ink-secondary)' }}>
              agent-kit
            </code>{' '}
            版本治理、下沉确定性 Verification Rules、只读 Review Bots 及人类 SME 签字队列。
          </p>
        </div>
      </header>

      {/* Top Hairline Tabs */}
      <HairlineTabs<PageTab>
        ariaLabel="标准与签字子视图"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            id: `${tabIdPrefix}-tab-standards`,
            value: 'standards',
            label: 'agent-kit 与 Verification Loop',
            count: verificationRules.length,
          },
          {
            id: `${tabIdPrefix}-tab-signoff`,
            value: 'signoff',
            label: '人类签字与 SME 规则台',
            count: pendingCounts.total,
            dotTone: pendingCounts.total > 0 ? 'warn' : 'ok',
          },
        ]}
      />

      {/* ====================================================================
          Tab 1: agent-kit Releases, Verification Rules & Read-Only Review Bots
          ==================================================================== */}
      {activeTab === 'standards' && (
        <div
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-tab-standards`}
          className="space-y-6"
        >
          {/* Section 1: Artifactory agent-kit Releases */}
          <section className="space-y-3" aria-label="Artifactory agent-kit 发版版本">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                <h2 className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  Artifactory{' '}
                  <code className="font-mono-tabular">agent-kit</code>{' '}
                  发版治理 (TanStack Intent 分层分发)
                </h2>
              </div>
              <span
                className="font-mono-tabular text-[11px]"
                style={{ color: 'var(--ink-faint)' }}
              >
                {PROGRAM_TOTALS.artifactoryRegistry}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {agentKitReleases.map((rel) => {
                const badgeMeta = RELEASE_STATUS_BADGE[rel.status];
                const isLatest = rel.status === 'LATEST';
                return (
                  <article
                    key={rel.version}
                    className="mcp-surface p-3.5 flex flex-col justify-between gap-3"
                    style={{
                      borderColor: isLatest ? 'var(--accent-line)' : 'var(--line)',
                    }}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono-tabular text-[14px] font-semibold"
                            style={{ color: 'var(--ink)' }}
                          >
                            {rel.version}
                          </span>
                          <Badge tone={badgeMeta.tone} mono>
                            {badgeMeta.label}
                          </Badge>
                        </div>
                        <span
                          className="font-mono-tabular text-[11px]"
                          style={{ color: 'var(--ink-faint)' }}
                        >
                          {rel.publishedAt}
                        </span>
                      </div>

                      <div
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]"
                        style={{
                          borderTop: '1px solid var(--line-subtle)',
                          borderBottom: '1px solid var(--line-subtle)',
                        }}
                      >
                        <span style={{ color: 'var(--ink-secondary)' }}>
                          采用应用：
                          <strong
                            className="font-mono-tabular font-semibold"
                            style={{ color: 'var(--ink)' }}
                          >
                            {rel.adoptedApps}
                          </strong>
                          <span className="font-mono-tabular" style={{ color: 'var(--ink-faint)' }}>
                            /{PROGRAM_TOTALS.totalApps}
                          </span>
                        </span>
                        {rel.sourceAwareDriftCount === 0 ? (
                          <StatusDot tone="ok" label="0 项漂移" mono />
                        ) : (
                          <StatusDot
                            tone={rel.status === 'DEPRECATED' ? 'danger' : 'warn'}
                            label={`${rel.sourceAwareDriftCount} 项 Source-Aware 漂移`}
                            mono
                          />
                        )}
                      </div>

                      <ul className="space-y-1.5 text-[12px]" style={{ color: 'var(--ink-secondary)' }}>
                        {rel.highlights.map((item) => (
                          <li key={item} className="flex items-start gap-1.5 text-pretty">
                            <span
                              className="mt-1.5 h-1 w-1 rounded-full shrink-0"
                              style={{ backgroundColor: 'var(--ink-faint)' }}
                              aria-hidden="true"
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div
                      className="flex items-center justify-between text-[11px] font-mono-tabular pt-1"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      <span>Channel: {rel.channel}</span>
                      <span>
                        占比 {Math.round((rel.adoptedApps / PROGRAM_TOTALS.totalApps) * 100)}%
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            <CopyCommandBar
              command="pnpm dlx @custody/agent-kit@1.4.0 sync --registry artifactory"
              label="升级并同步最新 agent-kit v1.4.0 规则包"
              description="通过内网 Artifactory 同步 router / playbooks / skills 与本机 Verification Loop"
              onCopy={() => notifyCopied('agent-kit@1.4.0 sync 升级命令')}
            />
          </section>

          {/* Section 2: Crystallized Verification Rules */}
          <section className="space-y-2.5" aria-label="已结晶确定性校验规则">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className="h-4 w-4"
                    style={{ color: 'var(--accent)' }}
                    aria-hidden="true"
                  />
                  <h2 className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                    已结晶确定性校验规则 (Verification Loop · Structure over Text)
                  </h2>
                </div>
                <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                  每次真实故障修复 (Red → Green) 均下沉为机械化 Lint / Zod Schema / 本机 Verify / PR CI 规则，彻底替代长篇 Prompt 口头提醒。
                </p>
              </div>

              <HairlineTabs<RuleLayerFilter>
                ariaLabel="按验证层级筛选规则"
                size="sm"
                value={layerFilter}
                onChange={setLayerFilter}
                options={[
                  {
                    id: `${tabIdPrefix}-layer-ALL`,
                    value: 'ALL',
                    label: '全部层级',
                    count: verificationRules.length,
                  },
                  {
                    id: `${tabIdPrefix}-layer-LINT`,
                    value: 'LINT',
                    label: 'Lint',
                    count: verificationRules.filter((r) => r.layer === 'LINT').length,
                  },
                  {
                    id: `${tabIdPrefix}-layer-TYPE_SCHEMA`,
                    value: 'TYPE_SCHEMA',
                    label: 'Type / Schema',
                    count: verificationRules.filter((r) => r.layer === 'TYPE_SCHEMA').length,
                  },
                  {
                    id: `${tabIdPrefix}-layer-LOCAL_VERIFY`,
                    value: 'LOCAL_VERIFY',
                    label: 'Local Verify',
                    count: verificationRules.filter((r) => r.layer === 'LOCAL_VERIFY').length,
                  },
                  {
                    id: `${tabIdPrefix}-layer-PR_CI`,
                    value: 'PR_CI',
                    label: 'PR CI',
                    count: verificationRules.filter((r) => r.layer === 'PR_CI').length,
                  },
                ]}
              />
            </div>

            <div role="tabpanel" aria-labelledby={`${tabIdPrefix}-layer-${layerFilter}`}>
              <DataTable<VerificationRule>
                caption="已下沉至本地与 PR CI 的确定性校验规则表"
                data={filteredRules}
                columns={ruleColumns}
                getRowId={(r) => r.id}
                initialSorting={[{ id: 'intercepts30d', desc: true }]}
                density="dense"
              />
            </div>
          </section>

          {/* Section 3: Specialized Read-Only Review Bots */}
          <section className="space-y-2.5" aria-label="专用只读 Review Bots">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                <h2 className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  专用 Review Bots 权限隔离矩阵 (Bot Separation)
                </h2>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                代码生成、独立审查与工单记录物理拆分为单职责 Bot；审查型 Bot 严格只读（Read-Only），无代码写权限。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {reviewBots.map((bot) => (
                <article
                  key={bot.id}
                  className="mcp-surface p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className="text-[13px] font-semibold truncate"
                        style={{ color: 'var(--ink)' }}
                      >
                        {bot.name}
                      </h3>
                      <StatusDot tone="ok" label="Active" mono />
                    </div>

                    <div>
                      <Badge
                        tone={bot.permission === 'READ_ONLY' ? 'neutral' : 'accent'}
                        mono
                      >
                        {bot.permission === 'READ_ONLY'
                          ? 'READ_ONLY · 只读'
                          : 'RESTRICTED_JIRA_WRITE'}
                      </Badge>
                    </div>

                    <p
                      className="text-[12px] leading-[1.5] text-pretty"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      {bot.role}
                    </p>
                  </div>

                  <div
                    className="pt-2.5 space-y-1 text-[11px] font-mono-tabular"
                    style={{
                      borderTop: '1px solid var(--line-subtle)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    <div className="truncate" title={bot.trigger}>
                      触发：{bot.trigger}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>30d 运行 {bot.runs30d}</span>
                      <span
                        style={{
                          color: bot.catches30d > 0 ? 'var(--ink-secondary)' : 'var(--ink-faint)',
                        }}
                      >
                        检出 {bot.catches30d}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          Tab 2: Human Sign-Off & SME Business Rule Workbench
          ==================================================================== */}
      {activeTab === 'signoff' && (
        <div
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-tab-signoff`}
          className="grid grid-cols-1 lg:grid-cols-[336px_minmax(0,1fr)] gap-4 items-start"
        >
          {/* Left Master Queue */}
          <aside className="mcp-surface overflow-hidden" aria-label="人类签字与 SME 待办队列">
            <div
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{
                borderBottom: '1px solid var(--line)',
                backgroundColor: 'var(--bg-sidebar)',
              }}
            >
              <span className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>
                待签字队列 ({pendingCounts.total})
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={signoffFilter === 'PENDING'}
                  onClick={() => setSignoffFilter('PENDING')}
                  className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  style={{
                    backgroundColor:
                      signoffFilter === 'PENDING' ? 'var(--bg-surface)' : 'transparent',
                    color: signoffFilter === 'PENDING' ? 'var(--ink)' : 'var(--ink-muted)',
                    border:
                      signoffFilter === 'PENDING'
                        ? '1px solid var(--line-strong)'
                        : '1px solid transparent',
                  }}
                >
                  仅待处理
                </button>
                <button
                  type="button"
                  aria-pressed={signoffFilter === 'ALL'}
                  onClick={() => setSignoffFilter('ALL')}
                  className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  style={{
                    backgroundColor:
                      signoffFilter === 'ALL' ? 'var(--bg-surface)' : 'transparent',
                    color: signoffFilter === 'ALL' ? 'var(--ink)' : 'var(--ink-muted)',
                    border:
                      signoffFilter === 'ALL'
                        ? '1px solid var(--line-strong)'
                        : '1px solid transparent',
                  }}
                >
                  全部记录
                </button>
              </div>
            </div>

            {visibleSmeGroups.length === 0 && visibleDecisions.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="h-4 w-4" />}
                title="所有待签字项均已处理"
                description="可切换至「全部记录」回顾历史签核与 SME 锁定规则。"
                action={
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setSignoffFilter('ALL')}
                  >
                    查看全部记录
                  </Button>
                }
              />
            ) : (
              <div className="max-h-[680px] overflow-y-auto">
                {/* Group 1: Modernize SME Rule Groups */}
                {visibleSmeGroups.length > 0 && (
                  <div>
                    <div
                      className="px-3 py-1.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderBottom: '1px solid var(--line-subtle)',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      Modernize SME 业务规则台 ({visibleSmeGroups.length})
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'var(--line-subtle)' }}>
                      {visibleSmeGroups.map((group) => {
                        const pending = countPendingRules(group);
                        const isSelected =
                          activeSelection?.kind === 'SME_GROUP' &&
                          activeSelection.id === group.id;
                        return (
                          <li key={group.id} style={{ borderColor: 'var(--line-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelection({ kind: 'SME_GROUP', id: group.id });
                                setRejectingRuleId(null);
                                setRejectRuleNote('');
                              }}
                              aria-current={isSelected ? 'true' : undefined}
                              className={`w-full px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
                                isSelected ? '' : 'hover:bg-[var(--bg-hover)]'
                              }`}
                              style={{
                                backgroundColor: isSelected
                                  ? 'var(--accent-soft)'
                                  : undefined,
                                boxShadow: isSelected
                                  ? 'inset 2px 0 0 var(--accent)'
                                  : 'none',
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className="font-mono-tabular text-[12px] font-semibold"
                                  style={{ color: 'var(--ink)' }}
                                >
                                  {group.unitId}
                                </span>
                                {pending > 0 ? (
                                  <StatusDot
                                    tone="warn"
                                    label={`${pending} 条待确认`}
                                    mono
                                  />
                                ) : (
                                  <StatusDot tone="ok" label="已全锁" mono />
                                )}
                              </div>
                              <div
                                className="mt-0.5 truncate text-[12px] font-medium"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                {group.unitName}
                              </div>
                              <div
                                className="mt-0.5 truncate text-[11px]"
                                style={{ color: 'var(--ink-faint)' }}
                              >
                                {group.l2Flow}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Group 2: Human Decision Queue */}
                {visibleDecisions.length > 0 && (
                  <div>
                    <div
                      className="px-3 py-1.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderTop:
                          visibleSmeGroups.length > 0
                            ? '1px solid var(--line)'
                            : undefined,
                        borderBottom: '1px solid var(--line-subtle)',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      人类决策签核队列 ({visibleDecisions.length})
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'var(--line-subtle)' }}>
                      {visibleDecisions.map((item) => {
                        const isSelected =
                          activeSelection?.kind === 'DECISION' &&
                          activeSelection.id === item.id;
                        const dotTone: SignalTone =
                          item.status === 'APPROVED'
                            ? 'ok'
                            : item.status === 'REJECTED'
                              ? 'neutral'
                              : item.severity === 'HIGH'
                                ? 'danger'
                                : 'warn';

                        return (
                          <li key={item.id} style={{ borderColor: 'var(--line-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelection({ kind: 'DECISION', id: item.id });
                                setDecisionNote('');
                              }}
                              aria-current={isSelected ? 'true' : undefined}
                              className={`w-full px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
                                isSelected ? '' : 'hover:bg-[var(--bg-hover)]'
                              }`}
                              style={{
                                backgroundColor: isSelected
                                  ? 'var(--accent-soft)'
                                  : undefined,
                                boxShadow: isSelected
                                  ? 'inset 2px 0 0 var(--accent)'
                                  : 'none',
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className="font-mono-tabular text-[11.5px] font-semibold"
                                    style={{ color: 'var(--ink)' }}
                                  >
                                    {item.unitCode}
                                  </span>
                                  <span
                                    className="text-[11px] truncate"
                                    style={{ color: 'var(--ink-muted)' }}
                                  >
                                    {DECISION_KIND_LABEL[item.kind]}
                                  </span>
                                </div>
                                <StatusDot
                                  tone={dotTone}
                                  label={
                                    item.status === 'PENDING'
                                      ? item.severity === 'HIGH'
                                        ? '高优待批'
                                        : '待批'
                                      : item.status === 'APPROVED'
                                        ? '已批准'
                                        : '已驳回'
                                  }
                                />
                              </div>
                              <div
                                className="mt-1 line-clamp-2 text-[12px] text-pretty"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                {item.title}
                              </div>
                              <div
                                className="mt-1 font-mono-tabular text-[10.5px]"
                                style={{ color: 'var(--ink-faint)' }}
                              >
                                {item.jiraKey ? `${item.jiraKey} · ` : ''}
                                {item.createdAt}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* Right Calm Detail & Sign-Off Surface */}
          <section className="mcp-surface p-4 sm:p-5 min-w-0" aria-label="签字与审批详情面板">
            {/* Case A: SME Business Rule Group */}
            {activeSmeGroup && (
              <div className="space-y-4">
                <div
                  className="flex flex-wrap items-start justify-between gap-3 pb-3.5"
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <div className="space-y-1 min-w-0">
                    <div
                      className="flex flex-wrap items-center gap-1.5 text-[11.5px]"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      <span>{activeSmeGroup.l1Domain}</span>
                      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span style={{ color: 'var(--ink)' }}>{activeSmeGroup.l2Flow}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className="font-mono-tabular text-[15px] font-semibold"
                        style={{ color: 'var(--ink)' }}
                      >
                        {activeSmeGroup.unitId}
                      </h2>
                      <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                        {activeSmeGroup.unitName}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openInspector(activeSmeGroup.unitId, 'trace')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    打开应用详情
                  </Button>
                </div>

                {/* Blitzy Input Spec Binding Note */}
                {activeSmeGroup.blitzyInputBound && (
                  <div className="mcp-well flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone="accent" mono>
                        Blitzy Input Spec 绑定
                      </Badge>
                      <span style={{ color: 'var(--ink-secondary)' }}>
                        人类 SME 签字锁定后，下列业务规则将作为 Modernize (Blitzy) 入口权威规格并写入 SHA-256 审计账本。
                      </span>
                    </div>
                  </div>
                )}

                {/* Batch Action Bar */}
                {(() => {
                  const pendingInGroup = activeSmeGroup.rules.filter(
                    (r) => r.status === 'PENDING',
                  );
                  const allPendingChecked =
                    pendingInGroup.length > 0 &&
                    pendingInGroup.every((r) => activeCheckedRuleIds.includes(r.id));

                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allPendingChecked}
                          disabled={pendingInGroup.length === 0}
                          onChange={() => toggleSelectAllPendingInGroup(activeSmeGroup)}
                          className="h-3.5 w-3.5 rounded-[3px] accent-[var(--accent)]"
                        />
                        <span style={{ color: 'var(--ink-secondary)' }}>
                          全选待确认规则 ({activeCheckedRuleIds.length}/{pendingInGroup.length})
                        </span>
                      </label>

                      <Button
                        variant="primary"
                        size="sm"
                        disabled={submitting || activeCheckedRuleIds.length === 0}
                        onClick={() => void handleBatchConfirmRules(activeSmeGroup)}
                      >
                        <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        确认所选规则 ({activeCheckedRuleIds.length})
                      </Button>
                    </div>
                  );
                })()}

                {/* Clean 3-Column Business Rule Table */}
                <div
                  className="rounded-[8px] overflow-hidden"
                  style={{ border: '1px solid var(--line)' }}
                >
                  <div
                    className="hidden md:grid md:grid-cols-[120px_1fr_1.35fr_1fr] gap-3 px-3.5 py-2 text-[11.5px] font-medium"
                    style={{
                      backgroundColor: 'var(--bg-sidebar)',
                      borderBottom: '1px solid var(--line)',
                      color: 'var(--ink-muted)',
                    }}
                  >
                    <div>规则编号</div>
                    <div>输入 Input</div>
                    <div>核算 / 校验逻辑</div>
                    <div>输出 Output</div>
                  </div>

                  <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                    {activeSmeGroup.rules.map((rule) => {
                      const isPending = rule.status === 'PENDING';
                      const isChecked = activeCheckedRuleIds.includes(rule.id);
                      const isRejecting = rejectingRuleId === rule.id;

                      return (
                        <div
                          key={rule.id}
                          className="p-3.5 space-y-3"
                          style={{
                            borderColor: 'var(--line)',
                            backgroundColor: isChecked
                              ? 'var(--accent-soft)'
                              : 'var(--bg-surface)',
                          }}
                        >
                          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_1.35fr_1fr] gap-3 items-start">
                            {/* Rule Code + Checkbox + Status */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  aria-label={`选择规则 ${rule.code}`}
                                  disabled={!isPending}
                                  checked={isChecked}
                                  onChange={() =>
                                    toggleRuleChecked(activeSmeGroup.id, rule.id)
                                  }
                                  className="h-3.5 w-3.5 rounded-[3px] accent-[var(--accent)]"
                                />
                                <span
                                  className="font-mono-tabular text-[12.5px] font-semibold"
                                  style={{ color: 'var(--ink)' }}
                                >
                                  {rule.code}
                                </span>
                              </div>
                              <div>
                                {rule.status === 'CONFIRMED' ? (
                                  <StatusDot tone="ok" label="已签字锁定" />
                                ) : rule.status === 'REJECTED' ? (
                                  <StatusDot tone="danger" label="已驳回" />
                                ) : (
                                  <StatusDot tone="warn" label="待 SME 确认" />
                                )}
                              </div>
                              <div
                                className="font-mono-tabular text-[11px]"
                                style={{ color: 'var(--ink-faint)' }}
                              >
                                提取置信度 {rule.confidence}%
                              </div>
                            </div>

                            {/* Input */}
                            <div className="space-y-0.5">
                              <div
                                className="md:hidden text-[11px] font-medium"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                输入 Input
                              </div>
                              <p
                                className="text-[12.5px] text-pretty"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                {rule.inputSpec}
                              </p>
                            </div>

                            {/* Logic */}
                            <div className="space-y-0.5">
                              <div
                                className="md:hidden text-[11px] font-medium"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                核算 / 校验逻辑
                              </div>
                              <p
                                className="text-[12.5px] font-medium text-pretty"
                                style={{ color: 'var(--ink)' }}
                              >
                                {rule.logicSpec}
                              </p>
                            </div>

                            {/* Output */}
                            <div className="space-y-0.5">
                              <div
                                className="md:hidden text-[11px] font-medium"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                输出 Output
                              </div>
                              <p
                                className="text-[12.5px] text-pretty"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                {rule.outputSpec}
                              </p>
                            </div>
                          </div>

                          {/* Existing SME Note */}
                          {rule.smeNote && (
                            <div
                              className="rounded-[6px] px-2.5 py-1.5 text-[12px]"
                              style={{
                                backgroundColor: 'var(--bg-well)',
                                border: '1px solid var(--line)',
                                color: 'var(--ink-secondary)',
                              }}
                            >
                              <span className="font-medium" style={{ color: 'var(--ink)' }}>
                                SME 批注：
                              </span>
                              {rule.smeNote}
                            </div>
                          )}

                          {/* Bottom Bar: Expandable Original Code + WP-00 Example + Inline Actions */}
                          <div
                            className="flex flex-wrap items-start justify-between gap-2 pt-2"
                            style={{ borderTop: '1px solid var(--line-subtle)' }}
                          >
                            <details className="mcp-details flex-1 min-w-[240px] group">
                              <summary
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium select-none"
                                style={{ color: 'var(--accent)' }}
                              >
                                <ChevronRight
                                  className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                                  aria-hidden="true"
                                />
                                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                  展开源码 ({rule.sourceRef}) 与 WP-00 基线真值样例
                                </span>
                              </summary>

                              <div className="mt-2.5 space-y-2.5">
                                <div className="space-y-1">
                                  <div
                                    className="font-mono-tabular text-[11px]"
                                    style={{ color: 'var(--ink-muted)' }}
                                  >
                                    Source: {rule.sourceRef}
                                  </div>
                                  <pre
                                    className="mcp-well p-3 font-mono-tabular text-[11.5px] leading-[1.6] overflow-x-auto"
                                    style={{ color: 'var(--ink)' }}
                                  >
                                    {rule.sourceSnippet}
                                  </pre>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="mcp-well p-2.5 space-y-0.5">
                                    <div
                                      className="font-mono-tabular text-[10.5px]"
                                      style={{ color: 'var(--ink-faint)' }}
                                    >
                                      WP-00 BASELINE INPUT
                                    </div>
                                    <div
                                      className="font-mono-tabular text-[11.5px]"
                                      style={{ color: 'var(--ink)' }}
                                    >
                                      {rule.baselineExampleIn}
                                    </div>
                                  </div>
                                  <div className="mcp-well p-2.5 space-y-0.5">
                                    <div
                                      className="font-mono-tabular text-[10.5px]"
                                      style={{ color: 'var(--ink-faint)' }}
                                    >
                                      WP-00 BASELINE OUTPUT
                                    </div>
                                    <div
                                      className="font-mono-tabular text-[11.5px]"
                                      style={{ color: 'var(--ink)' }}
                                    >
                                      {rule.baselineExampleOut}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </details>

                            {isPending && !isRejecting && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={submitting}
                                  onClick={() => {
                                    setRejectingRuleId(rule.id);
                                    setRejectRuleNote('');
                                  }}
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                  驳回并批注
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  disabled={submitting}
                                  onClick={() =>
                                    void handleConfirmSingleRule(activeSmeGroup, rule.id)
                                  }
                                >
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  单独确认
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Inline Reject Form */}
                          {isPending && isRejecting && (
                            <div
                              className="rounded-[6px] p-2.5 space-y-2"
                              style={{
                                backgroundColor: 'var(--signal-danger-soft)',
                                border: '1px solid var(--signal-danger-line)',
                              }}
                            >
                              <label className="block space-y-1">
                                <span
                                  className="text-[11.5px] font-medium"
                                  style={{ color: 'var(--signal-danger)' }}
                                >
                                  填写 SME 驳回意见（将写入审计日志并退回修正规格）
                                </span>
                                <input
                                  type="text"
                                  value={rejectRuleNote}
                                  onChange={(e) => setRejectRuleNote(e.target.value)}
                                  placeholder="例如：闰年特例仅适用 2022 前签署的 LEGACY_INST 合同，请补充生效日期条件"
                                  className="w-full h-8 rounded-[6px] px-2.5 text-[12px] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                                  style={{
                                    backgroundColor: 'var(--bg-surface)',
                                    border: '1px solid var(--line-strong)',
                                    color: 'var(--ink)',
                                  }}
                                />
                              </label>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    setRejectingRuleId(null);
                                    setRejectRuleNote('');
                                  }}
                                >
                                  取消
                                </Button>
                                <Button
                                  variant="danger"
                                  size="xs"
                                  disabled={submitting || rejectRuleNote.trim().length === 0}
                                  onClick={() =>
                                    void handleRejectSingleRule(activeSmeGroup, rule)
                                  }
                                >
                                  确认驳回 {rule.code}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Case B: DecisionQueueItem */}
            {activeDecision && (
              <div className="space-y-4">
                <div
                  className="flex flex-wrap items-start justify-between gap-3 pb-3.5"
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge mono>{DECISION_KIND_LABEL[activeDecision.kind]}</Badge>
                      {activeDecision.status === 'PENDING' ? (
                        <Badge
                          tone={activeDecision.severity === 'HIGH' ? 'danger' : 'warn'}
                          mono
                        >
                          {activeDecision.severity} PRIORITY
                        </Badge>
                      ) : (
                        <StatusDot
                          tone={activeDecision.status === 'APPROVED' ? 'ok' : 'neutral'}
                          label={
                            activeDecision.status === 'APPROVED' ? '已批准 / 确认' : '已驳回'
                          }
                        />
                      )}
                      {activeDecision.jiraKey && (
                        <span
                          className="font-mono-tabular text-[12px] font-medium"
                          style={{ color: 'var(--accent)' }}
                        >
                          {activeDecision.jiraKey}
                        </span>
                      )}
                      <span
                        className="font-mono-tabular text-[11.5px]"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        {activeDecision.createdAt}
                      </span>
                    </div>

                    <h2
                      className="text-[15px] font-semibold text-pretty"
                      style={{ color: 'var(--ink)' }}
                    >
                      {activeDecision.title}
                    </h2>
                    <p className="text-[12.5px] text-pretty" style={{ color: 'var(--ink-muted)' }}>
                      {activeDecision.subtitle}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      openInspector(
                        activeDecision.unitId,
                        activeDecision.kind === 'UNREGISTERED_DB' ? 'deps' : 'trace',
                      )
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    查看 {activeDecision.unitCode}
                  </Button>
                </div>

                {/* Evidence Key-Value Table */}
                <div className="space-y-1.5">
                  <h3 className="text-[12px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    结构化审计证据 (Evidence Snapshot)
                  </h3>
                  <div
                    className="rounded-[8px] overflow-hidden"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <table className="w-full border-collapse text-left">
                      <tbody className="divide-y" style={{ borderColor: 'var(--line-subtle)' }}>
                        {activeDecision.evidence.map((row) => (
                          <tr
                            key={row.label}
                            style={{ borderColor: 'var(--line-subtle)' }}
                          >
                            <th
                              scope="row"
                              className="w-40 px-3.5 py-2.5 text-[12px] font-medium align-top"
                              style={{
                                backgroundColor: 'var(--bg-sidebar)',
                                color: 'var(--ink-muted)',
                              }}
                            >
                              {row.label}
                            </th>
                            <td
                              className="px-3.5 py-2.5 text-[12.5px] font-mono-tabular"
                              style={{ color: 'var(--ink)' }}
                            >
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Detail Summary */}
                <div className="space-y-1.5">
                  <h3 className="text-[12px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    决策背景与影响说明
                  </h3>
                  <p
                    className="mcp-well p-3.5 text-[13px] leading-[1.6] text-pretty"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    {activeDecision.detailText}
                  </p>
                </div>

                {/* Sign-Off Actions or Resolved Summary */}
                {activeDecision.status === 'PENDING' ? (
                  <div
                    className="pt-3 space-y-3"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <label className="block space-y-1.5">
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: 'var(--ink)' }}
                      >
                        签核批注（可选，将随决定写入不可变 SHA-256 审计账本）
                      </span>
                      <textarea
                        rows={2}
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        placeholder="补充 DBA 桥接排期、豁免前提条件或退回修复要求…"
                        className="w-full rounded-[6px] px-3 py-2 text-[12.5px] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--line-strong)',
                          color: 'var(--ink)',
                        }}
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="danger"
                        size="md"
                        disabled={submitting}
                        onClick={() => void handleResolveDecision(activeDecision, 'REJECTED')}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        驳回
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        disabled={submitting}
                        onClick={() => void handleResolveDecision(activeDecision, 'APPROVED')}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        批准 / 确认
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="mcp-well px-3.5 py-3 space-y-1"
                    style={{
                      borderColor:
                        activeDecision.status === 'APPROVED'
                          ? 'var(--signal-ok-line)'
                          : 'var(--line)',
                    }}
                  >
                    <StatusDot
                      tone={activeDecision.status === 'APPROVED' ? 'ok' : 'neutral'}
                      label={
                        activeDecision.status === 'APPROVED'
                          ? '该项决策已签字批准并写入 SHA-256 审计账本'
                          : '该项决策已驳回并退回本机修复'
                      }
                    />
                    {activeDecision.decisionNote && (
                      <p className="text-[12px] pl-3" style={{ color: 'var(--ink-secondary)' }}>
                        批注：{activeDecision.decisionNote}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Empty Detail Placeholder */}
            {!activeSmeGroup && !activeDecision && (
              <EmptyState
                icon={<ClipboardCheck className="h-4 w-4" />}
                title="暂无选中的签字或审批项"
                description="请从左侧队列选择一组 Modernize SME 业务规则或人工决策待办进行核验。"
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
