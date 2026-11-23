import { useCallback, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Database,
  ExternalLink,
  FileCode2,
  GitGraph,
  RefreshCw,
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
  CURRENT_ENGINEER,
  PROGRAM_TOTALS,
  type DependencyFact,
  type MigrationUnit,
  type SharedTable,
  type WaveId,
} from '@/data/types';

type PageTab = 'deps' | 'knowledge';
type DepFilter = 'ALL' | 'IMPLICIT' | 'INVERSION';
type KnowledgePreviewMode = 'index' | 'graph';
type KnowledgeListFilter = 'ALL' | 'NEEDS_SYNC';

const WAVE_RANK: Record<WaveId, number> = {
  W0: 0,
  W1: 1,
  W2: 2,
  W3: 3,
  W4: 4,
};

const TABLE_STATUS_META: Record<
  SharedTable['status'],
  { label: string; tone: SignalTone; rank: number }
> = {
  WAVE_UNKNOWN: { label: 'Wave 未定锚', tone: 'danger', rank: 0 },
  SYBASE_PENDING: { label: 'Sybase 待切', tone: 'neutral', rank: 1 },
  DUAL_WRITE: { label: '双写过渡中', tone: 'accent', rank: 2 },
  ORACLE_READY: { label: 'Oracle Ready', tone: 'ok', rank: 3 },
};

const DEP_KIND_LABEL: Record<DependencyFact['kind'], string> = {
  SYBASE_TABLE: 'Sybase 共享表',
  AUTOSYS_JOB: 'AutoSys 作业',
  FILE_TRANSFER: '文件传输',
  MQ_QUEUE: 'MQ 队列',
};

const SYNC_TRIGGER_LABEL: Record<MigrationUnit['knowledge']['syncTrigger'], string> = {
  PR_READY: 'PR Ready 触发',
  PR_MERGE: 'PR Merge 触发',
  LOCAL_SYNC: '本机手动同步',
};

interface EnrichedDependency {
  dep: DependencyFact;
  consumerUnit: MigrationUnit | undefined;
  sharedTable: SharedTable | undefined;
  effectiveTargetWave: WaveId | 'Wave-Unknown' | undefined;
  isWaveInverted: boolean;
}

function checkWaveInversion(
  consumerWave: WaveId | undefined,
  targetWave: WaveId | 'Wave-Unknown' | undefined,
  kind: DependencyFact['kind'],
): boolean {
  if (kind !== 'SYBASE_TABLE' || !consumerWave || !targetWave) return false;
  if (targetWave === 'Wave-Unknown') return true;
  return WAVE_RANK[targetWave] > WAVE_RANK[consumerWave];
}

export function KnowledgeDepsPage() {
  const {
    units,
    scopedUnits,
    scope,
    sharedTables,
    dependencies,
    confirmDependencyFact,
    markKnowledgeSynced,
    openInspector,
    notifyCopied,
  } = useFactory();

  const tabIdPrefix = useId();
  const [activeTab, setActiveTab] = useState<PageTab>('deps');
  const [depFilter, setDepFilter] = useState<DepFilter>('ALL');
  const [confirmingDepId, setConfirmingDepId] = useState<string | null>(null);

  // Knowledge tab state
  const [knowledgeListFilter, setKnowledgeListFilter] = useState<KnowledgeListFilter>('ALL');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<KnowledgePreviewMode>('index');
  const [syncingUnitId, setSyncingUnitId] = useState<string | null>(null);

  const unitMap = useMemo(() => {
    const map = new Map<string, MigrationUnit>();
    for (const u of units) map.set(u.id, u);
    return map;
  }, [units]);

  const sharedTableMap = useMemo(() => {
    const map = new Map<string, SharedTable>();
    for (const t of sharedTables) map.set(t.name, t);
    return map;
  }, [sharedTables]);

  const enrichedDeps = useMemo<EnrichedDependency[]>(() => {
    return dependencies.map((dep) => {
      const consumerUnit = unitMap.get(dep.unitId);
      const sharedTable = sharedTableMap.get(dep.targetName);
      const effectiveTargetWave = sharedTable?.targetWave ?? dep.targetWave;
      const isWaveInverted = checkWaveInversion(
        consumerUnit?.wave,
        effectiveTargetWave,
        dep.kind,
      );
      return {
        dep,
        consumerUnit,
        sharedTable,
        effectiveTargetWave,
        isWaveInverted,
      };
    });
  }, [dependencies, sharedTableMap, unitMap]);

  const depsSummary = useMemo(() => {
    const oracleReadyCount = sharedTables.filter((t) => t.status === 'ORACLE_READY').length;
    const unregisteredCount = enrichedDeps.filter(
      (e) => e.dep.unregisteredImplicit && !e.dep.confirmed,
    ).length;
    const waveInversionCount = enrichedDeps.filter((e) => e.isWaveInverted).length;
    return {
      totalTables: sharedTables.length,
      oracleReadyCount,
      unregisteredCount,
      waveInversionCount,
    };
  }, [enrichedDeps, sharedTables]);

  const filteredDeps = useMemo(() => {
    return enrichedDeps.filter((item) => {
      if (depFilter === 'IMPLICIT') {
        return item.dep.unregisteredImplicit && !item.dep.confirmed;
      }
      if (depFilter === 'INVERSION') {
        return item.isWaveInverted;
      }
      return true;
    });
  }, [depFilter, enrichedDeps]);

  const knowledgeSummary = useMemo(() => {
    let wikiFresh = 0;
    let wikiStale = 0;
    let wikiMissing = 0;
    let totalStaleClaims = 0;
    let graphIndexed = 0;
    let graphPartial = 0;
    let graphMissing = 0;

    for (const u of scopedUnits) {
      if (u.knowledge.openwikiStatus === 'FRESH') wikiFresh += 1;
      else if (u.knowledge.openwikiStatus === 'STALE') wikiStale += 1;
      else wikiMissing += 1;

      totalStaleClaims += u.knowledge.staleClaimsCount;

      if (u.knowledge.graphifyStatus === 'INDEXED') graphIndexed += 1;
      else if (u.knowledge.graphifyStatus === 'PARTIAL_LEGACY') graphPartial += 1;
      else graphMissing += 1;
    }

    return {
      wikiFresh,
      wikiStale,
      wikiMissing,
      totalStaleClaims,
      graphIndexed,
      graphPartial,
      graphMissing,
    };
  }, [scopedUnits]);

  const visibleKnowledgeUnits = useMemo(() => {
    if (knowledgeListFilter === 'NEEDS_SYNC') {
      return scopedUnits.filter(
        (u) => u.knowledge.openwikiStatus !== 'FRESH' || u.knowledge.graphifyStatus !== 'INDEXED',
      );
    }
    return scopedUnits;
  }, [knowledgeListFilter, scopedUnits]);

  const activeKnowledgeUnit = useMemo(() => {
    if (selectedUnitId) {
      const found = visibleKnowledgeUnits.find((u) => u.id === selectedUnitId);
      if (found) return found;
    }
    return visibleKnowledgeUnits[0] ?? null;
  }, [selectedUnitId, visibleKnowledgeUnits]);

  const handleConfirmDep = useCallback(
    async (depId: string) => {
      setConfirmingDepId(depId);
      try {
        await confirmDependencyFact(depId);
      } finally {
        setConfirmingDepId(null);
      }
    },
    [confirmDependencyFact],
  );

  const handleSyncKnowledge = async (unitId: string) => {
    setSyncingUnitId(unitId);
    try {
      await markKnowledgeSynced(unitId);
    } finally {
      setSyncingUnitId(null);
    }
  };

  const sharedTableColumns = useMemo<DataTableColumn<SharedTable>[]>(
    () => [
      {
        id: 'name',
        header: '共享 Sybase 表',
        isRowHeader: true,
        width: '215px',
        accessor: (row) => row.name,
        cell: (row) => (
          <div className="min-w-0">
            <div
              className="font-mono-tabular text-[12.5px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              {row.name}
            </div>
            {row.lastAuditScanAt && (
              <div
                className="mt-0.5 font-mono-tabular text-[11px] font-normal"
                style={{ color: 'var(--ink-faint)' }}
              >
                MDA 巡检 {row.lastAuditScanAt}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'owner',
        header: '主责应用',
        width: '190px',
        accessor: (row) => row.ownerAppId,
        cell: (row) => (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => openInspector(row.ownerAppId, 'deps')}
              className="font-mono-tabular text-[12px] font-medium hover:underline text-left cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              {row.ownerAppId}
            </button>
            <div
              className="max-w-[175px] truncate text-[11.5px]"
              style={{ color: 'var(--ink-muted)' }}
              title={row.ownerAppName}
            >
              {row.ownerAppName}
            </div>
          </div>
        ),
      },
      {
        id: 'targetWave',
        header: '目标波次',
        width: '112px',
        accessor: (row) => row.targetWave,
        cell: (row) =>
          row.targetWave === 'Wave-Unknown' ? (
            <Badge tone="danger" mono>
              Wave-Unknown
            </Badge>
          ) : (
            <Badge mono>{row.targetWave}</Badge>
          ),
      },
      {
        id: 'status',
        header: '迁移状态',
        width: '132px',
        accessor: (row) => TABLE_STATUS_META[row.status].rank,
        cell: (row) => {
          const meta = TABLE_STATUS_META[row.status];
          return <StatusDot tone={meta.tone} label={meta.label} />;
        },
      },
      {
        id: 'readersCount',
        header: '读取方数',
        align: 'right',
        width: '88px',
        mono: true,
        accessor: (row) => row.readersCount,
        cell: (row) => (
          <span className="font-mono-tabular text-[12.5px]" style={{ color: 'var(--ink)' }}>
            {row.readersCount}
          </span>
        ),
      },
      {
        id: 'unregisteredReaders',
        header: '未登记运行时读取',
        align: 'right',
        width: '140px',
        accessor: (row) => row.unregisteredReaders,
        cell: (row) =>
          row.unregisteredReaders > 0 ? (
            <Badge tone="danger" mono>
              +{row.unregisteredReaders} 隐式读取
            </Badge>
          ) : (
            <span
              className="font-mono-tabular text-[12px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              0
            </span>
          ),
      },
      {
        id: 'bridgeStrategy',
        header: '双写 / 桥接策略',
        width: '280px',
        accessor: (row) => row.bridgeStrategy ?? '',
        sortable: false,
        cell: (row) => (
          <span
            className="block max-w-[280px] text-[12px] text-pretty"
            style={{ color: 'var(--ink-secondary)' }}
          >
            {row.bridgeStrategy ?? '—'}
          </span>
        ),
      },
    ],
    [openInspector],
  );

  const dependencyColumns = useMemo<DataTableColumn<EnrichedDependency>[]>(
    () => [
      {
        id: 'consumer',
        header: '消费应用',
        isRowHeader: true,
        width: '180px',
        accessor: (row) => row.dep.unitId,
        cell: (row) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openInspector(row.dep.unitId, 'deps')}
                className="font-mono-tabular text-[12.5px] font-semibold hover:underline cursor-pointer"
                style={{ color: 'var(--accent)' }}
              >
                {row.dep.unitId}
              </button>
              {row.consumerUnit && <Badge mono>{row.consumerUnit.wave}</Badge>}
            </div>
            {row.consumerUnit && (
              <div
                className="mt-0.5 max-w-[168px] truncate text-[11.5px] font-normal"
                style={{ color: 'var(--ink-muted)' }}
                title={row.consumerUnit.name}
              >
                {row.consumerUnit.name}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'target',
        header: '依赖目标',
        width: '200px',
        accessor: (row) => row.dep.targetName,
        cell: (row) => (
          <div className="min-w-0">
            <div
              className="font-mono-tabular text-[12px] font-medium"
              style={{ color: 'var(--ink)' }}
            >
              {row.dep.targetName}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              {DEP_KIND_LABEL[row.dep.kind]}
            </div>
          </div>
        ),
      },
      {
        id: 'source',
        header: '事实来源 (Source)',
        width: '165px',
        accessor: (row) => row.dep.source,
        cell: (row) => {
          const { source, unregisteredImplicit, confirmed } = row.dep;
          if (source === 'DB_RUNTIME_LOG') {
            return (
              <div className="space-y-0.5">
                <Badge tone={unregisteredImplicit && !confirmed ? 'danger' : 'warn'} mono>
                  DB_RUNTIME_LOG
                </Badge>
                <div className="text-[11px]" style={{ color: 'var(--signal-danger)' }}>
                  T_runtime \ T_code
                </div>
              </div>
            );
          }
          if (source === 'BOTH') {
            return <StatusDot tone="ok" label="BOTH" sublabel="代码 + 日志" mono />;
          }
          if (source === 'HUMAN_CONFIRMED') {
            return <StatusDot tone="ok" label="HUMAN_CONFIRMED" mono />;
          }
          return <Badge mono>CODE_STATIC</Badge>;
        },
      },
      {
        id: 'waveAlign',
        header: '波次对齐',
        width: '140px',
        accessor: (row) => (row.isWaveInverted ? 0 : 1),
        cell: (row) => {
          const cWave = row.consumerUnit?.wave;
          const tWave = row.effectiveTargetWave;
          if (!tWave) {
            return (
              <span className="font-mono-tabular text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                —
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="font-mono-tabular text-[11.5px]"
                style={{
                  color: row.isWaveInverted ? 'var(--signal-danger)' : 'var(--ink-secondary)',
                }}
              >
                {cWave ?? '?'} → {tWave}
              </span>
              {row.isWaveInverted && (
                <Badge tone="danger" mono>
                  {tWave === 'Wave-Unknown' ? '未定锚' : '倒挂'}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: 'runtime',
        header: '账号 / 30d 命中',
        width: '150px',
        accessor: (row) => row.dep.runtimeHits30d ?? -1,
        cell: (row) => (
          <div className="font-mono-tabular text-[11.5px]">
            <div style={{ color: 'var(--ink-secondary)' }}>{row.dep.dbAccount ?? '—'}</div>
            {row.dep.runtimeHits30d !== undefined && (
              <div style={{ color: 'var(--ink-faint)' }}>
                {row.dep.runtimeHits30d.toLocaleString()} hits / 30d
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'note',
        header: '审计说明',
        width: '250px',
        sortable: false,
        cell: (row) => (
          <span
            className="block max-w-[250px] text-[12px] text-pretty"
            style={{ color: 'var(--ink-secondary)' }}
          >
            {row.dep.note ?? '已完成静态声明与运行时核验'}
          </span>
        ),
      },
      {
        id: 'action',
        header: '登记状态',
        align: 'right',
        width: '115px',
        accessor: (row) => (row.dep.unregisteredImplicit && !row.dep.confirmed ? 0 : 1),
        cell: (row) => {
          const needsConfirm = row.dep.unregisteredImplicit && !row.dep.confirmed;
          if (!needsConfirm) {
            return (
              <div className="inline-flex justify-end">
                <StatusDot tone="ok" label="已登记" />
              </div>
            );
          }
          const busy = confirmingDepId === row.dep.id;
          return (
            <Button
              variant="secondary"
              size="xs"
              disabled={busy}
              onClick={() => void handleConfirmDep(row.dep.id)}
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              {busy ? '确认中…' : '确认依赖'}
            </Button>
          );
        },
      },
    ],
    [confirmingDepId, handleConfirmDep, openInspector],
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
              依赖与知识仓 · Knowledge & Dependencies
            </h1>
            <Badge mono>Cross-App Truth</Badge>
          </div>
          <p className="text-[12.5px]" style={{ color: 'var(--ink-muted)' }}>
            跨应用全局共享库「数据先到」排期锁与中央知识仓（
            <code className="font-mono-tabular" style={{ color: 'var(--ink-secondary)' }}>
              migration-knowledge
            </code>
            ）OpenWiki / Graphify 健康聚合。
          </p>
        </div>
      </header>

      {/* Primary Section Tabs */}
      <HairlineTabs<PageTab>
        ariaLabel="依赖与知识仓子视图"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            id: `${tabIdPrefix}-tab-deps`,
            value: 'deps',
            label: '共享库“数据先到”依赖锁',
            count: sharedTables.length,
            dotTone:
              depsSummary.unregisteredCount > 0 || depsSummary.waveInversionCount > 0
                ? 'danger'
                : 'ok',
          },
          {
            id: `${tabIdPrefix}-tab-knowledge`,
            value: 'knowledge',
            label: '中央知识仓 OpenWiki + Graphify',
            count: scopedUnits.length,
            dotTone:
              knowledgeSummary.wikiMissing > 0
                ? 'danger'
                : knowledgeSummary.wikiStale > 0
                  ? 'warn'
                  : 'ok',
          },
        ]}
      />

      {/* ====================================================================
          Tab 1: Shared DB "Data First" Lock & Cross-App Dependency Ledger
          ==================================================================== */}
      {activeTab === 'deps' && (
        <div
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-tab-deps`}
          className="space-y-5"
        >
          {/* Compact Summary Strip */}
          <div
            className="mcp-surface grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x"
            style={{ borderColor: 'var(--line)' }}
          >
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                共享 Sybase 表
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className="font-mono-tabular text-[18px] font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {depsSummary.totalTables}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                  张跨应用核心表
                </span>
              </div>
            </div>

            <div className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                Oracle Ready
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className="font-mono-tabular text-[18px] font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {depsSummary.oracleReadyCount}
                  <span className="text-[13px] font-normal" style={{ color: 'var(--ink-faint)' }}>
                    /{depsSummary.totalTables}
                  </span>
                </span>
                <StatusDot tone="ok" label="数据已先到" />
              </div>
            </div>

            <div className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                未登记运行时读取 (T_runtime \ T_code)
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className="font-mono-tabular text-[18px] font-semibold"
                  style={{
                    color:
                      depsSummary.unregisteredCount > 0 ? 'var(--signal-danger)' : 'var(--ink)',
                  }}
                >
                  {depsSummary.unregisteredCount}
                </span>
                <span
                  className="text-[11.5px]"
                  style={{
                    color:
                      depsSummary.unregisteredCount > 0
                        ? 'var(--signal-danger)'
                        : 'var(--ink-faint)',
                  }}
                >
                  {depsSummary.unregisteredCount > 0 ? '待工程师确认登记' : '双源全部对齐'}
                </span>
              </div>
            </div>

            <div className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                排期倒挂告警 (Wave Inversion)
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className="font-mono-tabular text-[18px] font-semibold"
                  style={{
                    color:
                      depsSummary.waveInversionCount > 0 ? 'var(--signal-danger)' : 'var(--ink)',
                  }}
                >
                  {depsSummary.waveInversionCount}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                  Cutover 数据库硬锁激活
                </span>
              </div>
            </div>
          </div>

          {/* Shared Tables Matrix */}
          <section className="space-y-2" aria-label="共享 Sybase 数据表清单">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                共享 Sybase 表迁移就绪矩阵
              </h2>
              <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                基于代码静态扫描 + Sybase MDA 审计日志双源交叉核验；点击主责应用或行打开依赖锁详情。
              </span>
            </div>

            <DataTable<SharedTable>
              caption="共享 Sybase 表迁移状态与未登记读取方"
              data={sharedTables}
              columns={sharedTableColumns}
              getRowId={(t) => t.name}
              onRowClick={(t) => openInspector(t.ownerAppId, 'deps')}
              initialSorting={[{ id: 'unregisteredReaders', desc: true }]}
              density="dense"
            />
          </section>

          {/* Cross-App DependencyFact Ledger */}
          <section className="space-y-2.5" aria-label="跨应用双源依赖事实账本">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                  跨应用双源依赖事实账本 (DependencyFact Ledger)
                </h2>
                <p className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                  区分静态代码提取（
                  <code className="font-mono-tabular">CODE_STATIC</code>
                  ）、运行时日志盲区（
                  <code className="font-mono-tabular">DB_RUNTIME_LOG</code>
                  ）、双源一致（
                  <code className="font-mono-tabular">BOTH</code>
                  ）与人工确认（
                  <code className="font-mono-tabular">HUMAN_CONFIRMED</code>
                  ）。
                </p>
              </div>

              <HairlineTabs<DepFilter>
                ariaLabel="按风险筛选依赖事实"
                size="sm"
                value={depFilter}
                onChange={setDepFilter}
                options={[
                  {
                    id: `${tabIdPrefix}-dep-ALL`,
                    value: 'ALL',
                    label: '全部',
                    count: enrichedDeps.length,
                  },
                  {
                    id: `${tabIdPrefix}-dep-IMPLICIT`,
                    value: 'IMPLICIT',
                    label: '未登记隐式读取',
                    count: depsSummary.unregisteredCount,
                    dotTone: depsSummary.unregisteredCount > 0 ? 'danger' : undefined,
                  },
                  {
                    id: `${tabIdPrefix}-dep-INVERSION`,
                    value: 'INVERSION',
                    label: '排期倒挂',
                    count: depsSummary.waveInversionCount,
                    dotTone: depsSummary.waveInversionCount > 0 ? 'warn' : undefined,
                  },
                ]}
              />
            </div>

            <div role="tabpanel" aria-labelledby={`${tabIdPrefix}-dep-${depFilter}`}>
              <DataTable<EnrichedDependency>
                caption="跨应用依赖事实清单"
                data={filteredDeps}
                columns={dependencyColumns}
                getRowId={(row) => row.dep.id}
                initialSorting={[{ id: 'action', desc: false }]}
                density="dense"
                emptyTitle="当前筛选下无异常依赖项"
                emptyDescription="所有隐式读取均已核验登记，或切换至「全部」查看完整依赖账本。"
                emptyAction={
                  depFilter !== 'ALL' ? (
                    <Button variant="secondary" size="sm" onClick={() => setDepFilter('ALL')}>
                      查看全部依赖事实
                    </Button>
                  ) : undefined
                }
              />
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          Tab 2: Central Knowledge Repo (OpenWiki + Graphify)
          ==================================================================== */}
      {activeTab === 'knowledge' && (
        <div
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-tab-knowledge`}
          className="space-y-4"
        >
          {/* Health Strip + PR Lifecycle Trigger Policy */}
          <div className="space-y-2.5">
            <div
              className="mcp-surface grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x"
              style={{ borderColor: 'var(--line)' }}
            >
              <div className="px-4 py-3">
                <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                  OpenWiki 最新 (Fresh)
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="font-mono-tabular text-[18px] font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {knowledgeSummary.wikiFresh}
                    <span className="text-[13px] font-normal" style={{ color: 'var(--ink-faint)' }}>
                      /{scopedUnits.length}
                    </span>
                  </span>
                  <StatusDot tone="ok" label="SHA-256 一致" />
                </div>
              </div>

              <div className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                  OpenWiki Claims 过期 / 缺失
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span
                    className="font-mono-tabular text-[18px] font-semibold"
                    style={{
                      color:
                        knowledgeSummary.wikiStale > 0 ? 'var(--signal-warn)' : 'var(--ink)',
                    }}
                  >
                    {knowledgeSummary.wikiStale}
                  </span>
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                    过期 ({knowledgeSummary.totalStaleClaims} claims)
                  </span>
                  {knowledgeSummary.wikiMissing > 0 && (
                    <Badge tone="danger" mono>
                      {knowledgeSummary.wikiMissing} 缺失
                    </Badge>
                  )}
                </div>
              </div>

              <div className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                  Graphify AST 全量出图
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="font-mono-tabular text-[18px] font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {knowledgeSummary.graphIndexed}
                  </span>
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                    应用零 LLM 成本索引
                  </span>
                </div>
              </div>

              <div className="px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                  遗留栈局部覆盖 (Partial Legacy)
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="font-mono-tabular text-[18px] font-semibold"
                    style={{
                      color:
                        knowledgeSummary.graphPartial > 0 ? 'var(--signal-warn)' : 'var(--ink)',
                    }}
                  >
                    {knowledgeSummary.graphPartial}
                  </span>
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
                    COBOL / PB / Sybase SP 需辅以 OpenWiki
                  </span>
                </div>
              </div>
            </div>

            {/* PR-Lifecycle Trigger Policy Note */}
            <div className="mcp-well flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Badge tone="accent" mono>
                  PR 生命周期触发策略
                </Badge>
                <span style={{ color: 'var(--ink-secondary)' }}>
                  采用 <strong>PR Ready / PR Merge</strong> 阶段于本机 Copilot 通道增量同步至中央仓{' '}
                  <code className="font-mono-tabular text-[11.5px]" style={{ color: 'var(--ink)' }}>
                    migration-knowledge
                  </code>
                  ，避免高频 <code className="font-mono-tabular text-[11.5px]">pre-commit</code> 阻塞；强制启用{' '}
                  <code className="font-mono-tabular text-[11.5px]">
                    OPENWIKI_TELEMETRY_DISABLED=1
                  </code>
                  。
                </span>
              </div>
              <span
                className="font-mono-tabular text-[11px] shrink-0"
                style={{ color: 'var(--ink-faint)' }}
              >
                {scope === 'MINE' ? `范围：${CURRENT_ENGINEER.handle}` : PROGRAM_TOTALS.centralKnowledgeRepo}
              </span>
            </div>
          </div>

          {/* Master-Detail Workspace */}
          {scopedUnits.length === 0 ? (
            <div className="mcp-surface">
              <EmptyState
                icon={<BookOpen className="h-4 w-4" />}
                title="当前范围暂无应用知识仓"
                description="请切换顶栏「All Apps / My Apps」视角查看全部应用的 OpenWiki 与 Graphify 索引。"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
              {/* Left Selectable List */}
              <aside
                className="mcp-surface overflow-hidden"
                aria-label="应用知识仓列表"
              >
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2"
                  style={{
                    borderBottom: '1px solid var(--line)',
                    backgroundColor: 'var(--bg-sidebar)',
                  }}
                >
                  <span className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>
                    应用索引 ({visibleKnowledgeUnits.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={knowledgeListFilter === 'ALL'}
                      onClick={() => setKnowledgeListFilter('ALL')}
                      className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      style={{
                        backgroundColor:
                          knowledgeListFilter === 'ALL' ? 'var(--bg-surface)' : 'transparent',
                        color:
                          knowledgeListFilter === 'ALL' ? 'var(--ink)' : 'var(--ink-muted)',
                        border:
                          knowledgeListFilter === 'ALL'
                            ? '1px solid var(--line-strong)'
                            : '1px solid transparent',
                      }}
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      aria-pressed={knowledgeListFilter === 'NEEDS_SYNC'}
                      onClick={() => setKnowledgeListFilter('NEEDS_SYNC')}
                      className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      style={{
                        backgroundColor:
                          knowledgeListFilter === 'NEEDS_SYNC'
                            ? 'var(--bg-surface)'
                            : 'transparent',
                        color:
                          knowledgeListFilter === 'NEEDS_SYNC'
                            ? 'var(--ink)'
                            : 'var(--ink-muted)',
                        border:
                          knowledgeListFilter === 'NEEDS_SYNC'
                            ? '1px solid var(--line-strong)'
                            : '1px solid transparent',
                      }}
                    >
                      需同步
                    </button>
                  </div>
                </div>

                {visibleKnowledgeUnits.length === 0 ? (
                  <EmptyState
                    title="当前视角全部知识仓均已最新"
                    description="无过期 OpenWiki Claims 或缺失图谱。"
                  />
                ) : (
                  <ul
                    className="max-h-[620px] overflow-y-auto divide-y"
                    style={{ borderColor: 'var(--line-subtle)' }}
                  >
                    {visibleKnowledgeUnits.map((unit) => {
                      const isSelected = activeKnowledgeUnit?.id === unit.id;
                      const k = unit.knowledge;
                      const wikiDotColor =
                        k.openwikiStatus === 'FRESH'
                          ? 'var(--signal-ok)'
                          : k.openwikiStatus === 'STALE'
                            ? 'var(--signal-warn)'
                            : 'var(--signal-danger)';
                      const validClaims = Math.max(0, k.totalClaimsCount - k.staleClaimsCount);

                      return (
                        <li
                          key={unit.id}
                          style={{ borderColor: 'var(--line-subtle)' }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedUnitId(unit.id)}
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
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: wikiDotColor }}
                                  aria-hidden="true"
                                />
                                <span
                                  className="font-mono-tabular text-[12px] font-semibold truncate"
                                  style={{ color: 'var(--ink)' }}
                                >
                                  {unit.code}
                                </span>
                                <span
                                  className="font-mono-tabular text-[10.5px]"
                                  style={{ color: 'var(--ink-faint)' }}
                                >
                                  {unit.wave}
                                </span>
                              </div>
                              <span
                                className="font-mono-tabular text-[11px] shrink-0"
                                style={{
                                  color:
                                    k.staleClaimsCount > 0
                                      ? 'var(--signal-warn)'
                                      : k.openwikiStatus === 'MISSING'
                                        ? 'var(--signal-danger)'
                                        : 'var(--ink-faint)',
                                }}
                              >
                                {k.openwikiStatus === 'MISSING'
                                  ? '未建库'
                                  : `${validClaims}/${k.totalClaimsCount}`}
                              </span>
                            </div>

                            <div
                              className="mt-0.5 truncate text-[12px]"
                              style={{ color: 'var(--ink-secondary)' }}
                            >
                              {unit.name}
                            </div>

                            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
                              <span
                                style={{
                                  color:
                                    k.graphifyStatus === 'PARTIAL_LEGACY'
                                      ? 'var(--signal-warn)'
                                      : k.graphifyStatus === 'MISSING'
                                        ? 'var(--signal-danger)'
                                        : 'var(--ink-faint)',
                                }}
                              >
                                Graph:{' '}
                                {k.graphifyStatus === 'INDEXED'
                                  ? 'Indexed'
                                  : k.graphifyStatus === 'PARTIAL_LEGACY'
                                    ? 'Partial Legacy'
                                    : 'Missing'}
                              </span>
                              {k.staleClaimsCount > 0 && (
                                <span style={{ color: 'var(--signal-warn)' }}>
                                  {k.staleClaimsCount} stale
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>

              {/* Right Clean Reader Panel */}
              {activeKnowledgeUnit ? (
                <article
                  className="mcp-surface p-4 space-y-4 min-w-0"
                  aria-label={`${activeKnowledgeUnit.code} 中央知识仓详情`}
                >
                  {/* Reader Header */}
                  <div
                    className="flex flex-wrap items-start justify-between gap-3 pb-3"
                    style={{ borderBottom: '1px solid var(--line)' }}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2
                          className="font-mono-tabular text-[15px] font-semibold"
                          style={{ color: 'var(--ink)' }}
                        >
                          {activeKnowledgeUnit.code}
                        </h2>
                        <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                          {activeKnowledgeUnit.name}
                        </span>
                        <Badge mono>{activeKnowledgeUnit.wave}</Badge>
                        <Badge>{activeKnowledgeUnit.disposition}</Badge>
                      </div>
                      <p className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                        {activeKnowledgeUnit.techStack} · {activeKnowledgeUnit.locLabel} · 负责人{' '}
                        {activeKnowledgeUnit.owner}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openInspector(activeKnowledgeUnit.id, 'knowledge')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        打开应用详情
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={syncingUnitId === activeKnowledgeUnit.id}
                        onClick={() => void handleSyncKnowledge(activeKnowledgeUnit.id)}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            syncingUnitId === activeKnowledgeUnit.id ? 'animate-spin' : ''
                          }`}
                          aria-hidden="true"
                        />
                        {syncingUnitId === activeKnowledgeUnit.id
                          ? '正在登记…'
                          : '标记知识仓已同步'}
                      </Button>
                    </div>
                  </div>

                  {/* Metadata Summary Grid */}
                  <div className="mcp-well p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        中央仓目录 (migration-knowledge)
                      </div>
                      <div
                        className="font-mono-tabular text-[12px] font-medium truncate"
                        style={{ color: 'var(--ink)' }}
                        title={activeKnowledgeUnit.knowledge.centralRepoPath}
                      >
                        {activeKnowledgeUnit.knowledge.centralRepoPath}
                      </div>
                      <div
                        className="font-mono-tabular text-[11px] truncate"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        openwiki/index.md · GRAPH_REPORT.md
                      </div>
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        最近同步 PR 与触发模式
                      </div>
                      <div
                        className="font-mono-tabular text-[12px] font-medium truncate"
                        style={{ color: 'var(--ink)' }}
                      >
                        {activeKnowledgeUnit.knowledge.lastPrSynced}
                      </div>
                      <div>
                        <Badge mono>
                          {activeKnowledgeUnit.knowledge.syncTrigger} ·{' '}
                          {SYNC_TRIGGER_LABEL[activeKnowledgeUnit.knowledge.syncTrigger]}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        OpenWiki Grounded Claims
                      </div>
                      <div className="pt-0.5">
                        <StatusDot
                          tone={
                            activeKnowledgeUnit.knowledge.openwikiStatus === 'FRESH'
                              ? 'ok'
                              : activeKnowledgeUnit.knowledge.openwikiStatus === 'STALE'
                                ? 'warn'
                                : 'danger'
                          }
                          label={
                            activeKnowledgeUnit.knowledge.openwikiStatus === 'FRESH'
                              ? 'SHA-256 全部一致'
                              : activeKnowledgeUnit.knowledge.openwikiStatus === 'STALE'
                                ? `${activeKnowledgeUnit.knowledge.staleClaimsCount} 条 Claim 过期`
                                : '尚未初始化 OpenWiki'
                          }
                          sublabel={
                            activeKnowledgeUnit.knowledge.totalClaimsCount > 0
                              ? `(${
                                  activeKnowledgeUnit.knowledge.totalClaimsCount -
                                  activeKnowledgeUnit.knowledge.staleClaimsCount
                                }/${activeKnowledgeUnit.knowledge.totalClaimsCount})`
                              : undefined
                          }
                          mono
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stale Claims File List (Only When Present) */}
                  {activeKnowledgeUnit.knowledge.staleClaimFiles &&
                    activeKnowledgeUnit.knowledge.staleClaimFiles.length > 0 && (
                      <div
                        className="rounded-[6px] px-3 py-2.5 space-y-1.5"
                        style={{
                          backgroundColor: 'var(--signal-warn-soft)',
                          border: '1px solid var(--signal-warn-line)',
                        }}
                      >
                        <div
                          className="flex items-center gap-1.5 text-[12px] font-medium"
                          style={{ color: 'var(--signal-warn)' }}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          检测到源码 SHA-256 变更导致以下 .claims 失效，请在 PR Ready 前本机重跑 wiki sync：
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeKnowledgeUnit.knowledge.staleClaimFiles.map((file) => (
                            <code
                              key={file}
                              className="rounded-[4px] px-1.5 py-0.5 font-mono-tabular text-[11px]"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--line)',
                                color: 'var(--ink)',
                              }}
                            >
                              {file}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Graphify AST Edge Breakdown */}
                  <div
                    className="rounded-[6px] p-3 space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--ink)' }}>
                        <GitGraph className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                        Graphify 静态代码图谱边置信度分布
                      </div>
                      <StatusDot
                        tone={
                          activeKnowledgeUnit.knowledge.graphifyStatus === 'INDEXED'
                            ? 'ok'
                            : activeKnowledgeUnit.knowledge.graphifyStatus === 'PARTIAL_LEGACY'
                              ? 'warn'
                              : 'danger'
                        }
                        label={
                          activeKnowledgeUnit.knowledge.graphifyStatus === 'INDEXED'
                            ? 'Indexed (tree-sitter)'
                            : activeKnowledgeUnit.knowledge.graphifyStatus === 'PARTIAL_LEGACY'
                              ? 'Partial Legacy Coverage'
                              : 'Not Indexed'
                        }
                        mono
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="mcp-well px-2.5 py-1.5">
                        <div className="text-[10.5px] font-mono-tabular" style={{ color: 'var(--ink-faint)' }}>
                          NODES
                        </div>
                        <div className="font-mono-tabular text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {activeKnowledgeUnit.knowledge.graphNodes.toLocaleString()}
                        </div>
                      </div>
                      <div className="mcp-well px-2.5 py-1.5">
                        <div className="flex items-center gap-1 text-[10.5px] font-mono-tabular" style={{ color: 'var(--ink-muted)' }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--signal-ok)' }} aria-hidden="true" />
                          EXTRACTED
                        </div>
                        <div className="font-mono-tabular text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {activeKnowledgeUnit.knowledge.graphEdgesExtracted.toLocaleString()}
                        </div>
                      </div>
                      <div className="mcp-well px-2.5 py-1.5">
                        <div className="flex items-center gap-1 text-[10.5px] font-mono-tabular" style={{ color: 'var(--ink-muted)' }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} aria-hidden="true" />
                          INFERRED
                        </div>
                        <div className="font-mono-tabular text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {activeKnowledgeUnit.knowledge.graphEdgesInferred.toLocaleString()}
                        </div>
                      </div>
                      <div className="mcp-well px-2.5 py-1.5">
                        <div className="flex items-center gap-1 text-[10.5px] font-mono-tabular" style={{ color: 'var(--ink-muted)' }}>
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                activeKnowledgeUnit.knowledge.graphEdgesAmbiguous > 0
                                  ? 'var(--signal-warn)'
                                  : 'var(--ink-faint)',
                            }}
                            aria-hidden="true"
                          />
                          AMBIGUOUS
                        </div>
                        <div
                          className="font-mono-tabular text-[14px] font-semibold"
                          style={{
                            color:
                              activeKnowledgeUnit.knowledge.graphEdgesAmbiguous > 20
                                ? 'var(--signal-warn)'
                                : 'var(--ink)',
                          }}
                        >
                          {activeKnowledgeUnit.knowledge.graphEdgesAmbiguous.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <p className="text-[12px] text-pretty" style={{ color: 'var(--ink-secondary)' }}>
                      {activeKnowledgeUnit.knowledge.legacyCoverageNote}
                    </p>
                  </div>

                  {/* Preview Sub-Toggle: openwiki/index.md vs GRAPH_REPORT.md */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <HairlineTabs<KnowledgePreviewMode>
                        ariaLabel="知识产物预览切换"
                        size="sm"
                        value={previewMode}
                        onChange={setPreviewMode}
                        options={[
                          {
                            id: `${tabIdPrefix}-preview-index`,
                            value: 'index',
                            label: 'openwiki/index.md',
                          },
                          {
                            id: `${tabIdPrefix}-preview-graph`,
                            value: 'graph',
                            label: 'GRAPH_REPORT.md',
                          },
                        ]}
                      />
                      <span
                        className="inline-flex items-center gap-1 font-mono-tabular text-[11px]"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        <FileCode2 className="h-3 w-3" aria-hidden="true" />
                        OKF v0.2 · Read-Only Snapshot
                      </span>
                    </div>

                    <div
                      role="tabpanel"
                      aria-labelledby={`${tabIdPrefix}-preview-${previewMode}`}
                    >
                      <pre
                        className="mcp-well p-3.5 font-mono-tabular text-[12px] leading-[1.65] overflow-x-auto whitespace-pre-wrap"
                        style={{ color: 'var(--ink)' }}
                      >
                        {previewMode === 'index'
                          ? activeKnowledgeUnit.knowledge.indexPreviewMd
                          : activeKnowledgeUnit.knowledge.graphReportPreviewMd}
                      </pre>
                    </div>
                  </div>

                  {/* Copyable Local Sync Commands */}
                  <div className="space-y-2.5 pt-1">
                    <CopyCommandBar
                      command={activeKnowledgeUnit.localCommands.wikiSync}
                      label="本机同步 OpenWiki (Copilot 通道)"
                      description="零外部 API Key，同步完成后可点击右上角标记状态"
                      onCopy={() => notifyCopied(`${activeKnowledgeUnit.code} OpenWiki sync 命令`)}
                    />
                    <CopyCommandBar
                      command={activeKnowledgeUnit.localCommands.graphExtract}
                      label="本机刷新 Graphify AST 图谱"
                      description="纯 tree-sitter 解析，零 LLM Token 消耗"
                      onCopy={() => notifyCopied(`${activeKnowledgeUnit.code} Graphify extract 命令`)}
                    />
                  </div>
                </article>
              ) : (
                <div className="mcp-surface">
                  <EmptyState
                    icon={<BookOpen className="h-4 w-4" />}
                    title="请从左侧列表选择一个应用"
                    description="查看中央知识仓 OpenWiki Claims 状态、Graphify AST 覆盖度与可复制的本机同步命令。"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
