import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sha256Hex } from '@/lib/crypto';
import { syncColorSchemeMeta } from '@/lib/motion';
import {
  INITIAL_AGENTCORE_GATEWAY_TOOLS,
  INITIAL_AGENT_KIT_RELEASES,
  INITIAL_DECISION_QUEUE,
  INITIAL_DEPENDENCIES,
  INITIAL_REVIEW_BOTS,
  INITIAL_SHARED_TABLES,
  INITIAL_SME_GROUPS,
  INITIAL_UNITS,
  INITIAL_VERIFICATION_RULES,
  INITIAL_WAVES,
} from './seed';
import {
  CURRENT_ENGINEER,
  type AgentCoreGatewayTool,
  type AgentKitRelease,
  type AppScope,
  type AuditEvent,
  type BatchTraceRecord,
  type DecisionQueueItem,
  type DependencyFact,
  type InspectorTab,
  type MigrationUnit,
  type ReviewBotSpec,
  type SharedTable,
  type SmeRuleGroup,
  type ThemeMode,
  type ToastNotice,
  type VerificationRule,
  type WaveRecord,
} from './types';

interface ControlPlaneState {
  theme: ThemeMode;
  waves: WaveRecord[];
  units: MigrationUnit[];
  sharedTables: SharedTable[];
  dependencies: DependencyFact[];
  verificationRules: VerificationRule[];
  agentKitReleases: AgentKitRelease[];
  gatewayTools: AgentCoreGatewayTool[];
  reviewBots: ReviewBotSpec[];
  smeGroups: SmeRuleGroup[];
  decisionQueue: DecisionQueueItem[];
  auditLog: AuditEvent[];
}

export interface AuditChainVerification {
  valid: boolean;
  checkedCount: number;
  brokenEventId?: string;
  verifiedAt: string;
}

export interface CutoverDbLockResult {
  locked: boolean;
  blockingTables: SharedTable[];
}

export interface FactoryContextValue extends ControlPlaneState {
  // Derived views & UI controls
  scope: AppScope;
  setScope: (scope: AppScope) => void;
  scopedUnits: MigrationUnit[];
  batchTraces: BatchTraceRecord[];
  scopedBatchTraces: BatchTraceRecord[];
  inspectorUnitId: string | null;
  inspectorTab: InspectorTab;
  openInspector: (unitId: string, tab?: InspectorTab) => void;
  closeInspector: () => void;
  cmdPaletteOpen: boolean;
  setCmdPaletteOpen: (open: boolean) => void;
  toasts: ToastNotice[];
  dismissToast: (id: string) => void;
  toggleTheme: () => void;

  // Lightweight real actions
  confirmDependencyFact: (depId: string, note?: string) => Promise<void>;
  markKnowledgeSynced: (unitId: string, mode?: 'agentcore' | 'local') => Promise<void>;
  triggerAgentCorePrReview: (unitId: string, prNumber: string) => Promise<void>;
  confirmSmeRules: (
    groupId: string,
    ruleIds: string[],
    decision: 'CONFIRMED' | 'REJECTED',
    note?: string,
  ) => Promise<void>;
  resolveDecisionItem: (
    itemId: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
  ) => Promise<void>;
  evaluateCutoverDbLock: (unitId: string) => CutoverDbLockResult;
  notifyCopied: (label: string) => void;
  verifyAuditChain: () => Promise<AuditChainVerification>;
  resetDemoData: () => void;
}

const STORAGE_KEY = 'migration-control-plane-v3';
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function buildInitialAuditLog(): Promise<AuditEvent[]> {
  const seeds: Omit<AuditEvent, 'prevEventHash' | 'currentEventHash'>[] = [
    {
      id: 'EVT-1001',
      timestamp: '2027-03-19 09:20:14',
      category: 'FACT',
      initiatorUser: 'system:sybase-mda-sync',
      executorType: 'DETERMINISTIC_SCRIPT',
      sourceType: 'RUNTIME',
      unitId: 'APP-019',
      summary: 'Sybase MDA 运行时审计日志交叉核验：捕获未登记表读取 SYB_CORE_POSITIONS (T_runtime \\ T_code)',
      payloadJson: JSON.stringify({
        table: 'SYB_CORE_POSITIONS',
        dbAccount: 'svc_tradeconf_mq',
        hits30d: 28,
      }),
    },
    {
      id: 'EVT-1002',
      timestamp: '2027-03-20 14:05:32',
      category: 'EXECUTION',
      initiatorUser: 'm.zhou@custody.internal',
      executorType: 'DETERMINISTIC_SCRIPT',
      sourceType: 'EXTERNAL_WEBHOOK',
      unitId: 'APP-W0-01',
      summary: 'WP-00 基线采样脚本封存 148,200 行脱敏黄金样本至 S3 Object Lock',
      payloadJson: JSON.stringify({
        s3Uri: 's3://factory-baselines/app-w0-01/bl-20270311.tar.zst',
        sha256: '8f4c1a90d7e32b5f61c9e8b204a5d7c1e3f980a1b4d2c7e65f1903a8b2d4c17e',
      }),
    },
    {
      id: 'EVT-1003',
      timestamp: '2027-03-20 18:19:08',
      category: 'FACT',
      initiatorUser: 'm.zhou@custody.internal',
      executorType: 'AGENT',
      agentMetadata: {
        tool: 'agent-kit v1.4.0 · Copilot Squad',
        model: 'claude-sonnet-4.5 (GitHub Copilot)',
        onBehalfOf: 'm.zhou@custody.internal',
      },
      sourceType: 'AI_DRAFT',
      unitId: 'APP-024',
      summary: '本机 agent-kit verify 检出 PR #407 违反 SQLFLUFF-SYB-001 并存在 37 行 WP-00 利息差异',
      payloadJson: JSON.stringify({
        pr: 'PR #407',
        rule: 'SQLFLUFF-SYB-001',
        cluster: 'DIFF-024-1',
        rows: 37,
      }),
    },
    {
      id: 'EVT-1004',
      timestamp: '2027-03-21 07:45:12',
      category: 'EXECUTION',
      initiatorUser: 'factory:pr-webhook',
      executorType: 'AGENT',
      agentMetadata: {
        tool: 'AWS AgentCore Runtime (Knowledge Builder · MicroVM)',
        model: 'Bedrock · Claude 3.7 Sonnet (VPC PrivateLink)',
        onBehalfOf: 'm.zhou@custody.internal',
      },
      sourceType: 'CODE',
      unitId: 'APP-MOD-02',
      summary: 'Blitzy 出口 PR #538 通过 AgentCore 预审与 WP-00 双跑，MicroVM 已增量刷新中央知识仓 26 条 Claims',
      payloadJson: JSON.stringify({
        pr: 'PR #538',
        runtime: 'AgentCore Runtime (MicroVM)',
        cedarPolicy: 'WRITE_CENTRAL_KNOWLEDGE_ONLY',
        repoPath: 'migration-knowledge/app-mod-02/',
        claims: 26,
        graphNodes: 1140,
      }),
    },
    {
      id: 'EVT-1005',
      timestamp: '2027-03-21 08:42:51',
      category: 'DECISION',
      initiatorUser: 'y.lu@custody.internal (SME · GHE OAuth)',
      executorType: 'HUMAN',
      sourceType: 'HUMAN_CONFIRMED',
      unitId: 'APP-MOD-01A',
      summary: '人类 SME 签字确认核心业务规则 NAV-R04（波动超 3% 自动挂起），锁定为 Blitzy 入口权威规格',
      payloadJson: JSON.stringify({
        ruleCode: 'NAV-R04',
        sourceRef: 'cobol/nav_tolerance.cbl#L51-L78',
      }),
    },
  ];

  const chained: AuditEvent[] = [];
  let prev = GENESIS_HASH;
  for (const item of seeds) {
    const current = await sha256Hex(`${prev}|${item.id}|${item.timestamp}|${item.payloadJson}`);
    chained.push({
      ...item,
      prevEventHash: prev,
      currentEventHash: current,
    });
    prev = current;
  }
  return chained;
}

function makeDefaultState(theme: ThemeMode = 'light'): ControlPlaneState {
  return {
    theme,
    waves: INITIAL_WAVES,
    units: INITIAL_UNITS,
    sharedTables: INITIAL_SHARED_TABLES,
    dependencies: INITIAL_DEPENDENCIES,
    verificationRules: INITIAL_VERIFICATION_RULES,
    agentKitReleases: INITIAL_AGENT_KIT_RELEASES,
    gatewayTools: INITIAL_AGENTCORE_GATEWAY_TOOLS,
    reviewBots: INITIAL_REVIEW_BOTS,
    smeGroups: INITIAL_SME_GROUPS,
    decisionQueue: INITIAL_DECISION_QUEUE,
    auditLog: [],
  };
}

function hydrateUnitsWithAgentCore(units: MigrationUnit[]): MigrationUnit[] {
  const seedById = new Map(INITIAL_UNITS.map((u) => [u.id, u]));
  return units.map((u) => {
    const seedUnit = seedById.get(u.id);
    if (!seedUnit) return u;
    const seedPrByNum = new Map(seedUnit.activePrs.map((p) => [p.prNumber, p]));
    return {
      ...u,
      knowledge: {
        ...u.knowledge,
        dispatchRuntime: u.knowledge.dispatchRuntime ?? seedUnit.knowledge.dispatchRuntime,
      },
      activePrs: u.activePrs.map((pr) => ({
        ...pr,
        autoReview: pr.autoReview ?? seedPrByNum.get(pr.prNumber)?.autoReview,
      })),
    };
  });
}

function hydrateReviewBots(bots: ReviewBotSpec[]): ReviewBotSpec[] {
  const seedById = new Map(INITIAL_REVIEW_BOTS.map((b) => [b.id, b]));
  return bots.map((b) => {
    const seedBot = seedById.get(b.id);
    return {
      ...b,
      runtime: b.runtime ?? seedBot?.runtime,
      cedarPolicy: b.cedarPolicy ?? seedBot?.cedarPolicy,
    };
  });
}

function loadInitialState(): ControlPlaneState {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ControlPlaneState>;
        if (
          parsed &&
          (parsed.theme === 'light' || parsed.theme === 'dark') &&
          Array.isArray(parsed.units) &&
          parsed.units.length > 0 &&
          Array.isArray(parsed.verificationRules) &&
          Array.isArray(parsed.agentKitReleases) &&
          Array.isArray(parsed.decisionQueue) &&
          Array.isArray(parsed.reviewBots)
        ) {
          return {
            theme: parsed.theme,
            waves: Array.isArray(parsed.waves) ? parsed.waves : INITIAL_WAVES,
            units: hydrateUnitsWithAgentCore(parsed.units),
            sharedTables: Array.isArray(parsed.sharedTables)
              ? parsed.sharedTables
              : INITIAL_SHARED_TABLES,
            dependencies: Array.isArray(parsed.dependencies)
              ? parsed.dependencies
              : INITIAL_DEPENDENCIES,
            verificationRules: parsed.verificationRules,
            agentKitReleases: parsed.agentKitReleases,
            gatewayTools: Array.isArray(parsed.gatewayTools)
              ? parsed.gatewayTools
              : INITIAL_AGENTCORE_GATEWAY_TOOLS,
            reviewBots: hydrateReviewBots(parsed.reviewBots),
            smeGroups: Array.isArray(parsed.smeGroups) ? parsed.smeGroups : INITIAL_SME_GROUPS,
            decisionQueue: parsed.decisionQueue,
            auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
          };
        }
      }
    } catch {
      // Ignore corrupt localStorage payload
    }
  }
  return makeDefaultState('light');
}

function deriveBatchTraces(units: MigrationUnit[]): BatchTraceRecord[] {
  return units.flatMap((unit) =>
    unit.activePrs.map((pr) => {
      const numericPr = pr.prNumber.replace(/\D/g, '');
      const localCommand =
        pr.aiExecutor === 'Blitzy (Blackbox)'
          ? `agent-kit verify --app ${unit.code} --wp WP-00 --blitzy-pr ${numericPr}`
          : `agent-kit verify --app ${unit.code} --wp ${pr.wpCode}`;

      return {
        id: `TRC-${unit.id}-${numericPr || pr.wpCode}`,
        unitId: unit.id,
        unitCode: unit.code,
        unitName: unit.name,
        disposition: unit.disposition,
        wave: unit.wave,
        owner: unit.owner,
        isMine: unit.isMine,
        wpCode: pr.wpCode,
        jiraKey: pr.jiraKey,
        jiraSummary: pr.title,
        pr,
        localCommand,
      };
    }),
  );
}

const FactoryContext = createContext<FactoryContextValue | null>(null);

export function FactoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ControlPlaneState>(loadInitialState);
  const [scope, setScope] = useState<AppScope>('ALL');
  const [inspectorUnitId, setInspectorUnitId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('trace');
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const auditLogRef = useRef<AuditEvent[]>(state.auditLog);

  useEffect(() => {
    auditLogRef.current = state.auditLog;
  }, [state.auditLog]);

  // Sync root <html data-theme> and <meta name="color-scheme"> for Light/Dark precision tokens
  useEffect(() => {
    syncColorSchemeMeta(state.theme);
  }, [state.theme]);

  // Cross-tab theme synchronization (modern-web-guidance: dark-mode-toggle)
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue === null) {
        setState((prev) => (prev.theme === 'light' ? prev : { ...prev, theme: 'light' }));
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as Partial<ControlPlaneState>;
        if (parsed.theme === 'light' || parsed.theme === 'dark') {
          const nextTheme = parsed.theme;
          setState((prev) => (prev.theme === nextTheme ? prev : { ...prev, theme: nextTheme }));
        }
      } catch {
        // Ignore invalid storage payloads from external writes
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Seed cryptographic hash-chained audit events on first load
  useEffect(() => {
    if (state.auditLog.length === 0) {
      let cancelled = false;
      void buildInitialAuditLog().then((initialEvents) => {
        if (cancelled) return;
        setState((prev) =>
          prev.auditLog.length === 0 ? { ...prev, auditLog: initialEvents } : prev,
        );
      });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [state.auditLog.length]);

  // Persist domain state + theme under v3 key
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  const pushToast = useCallback((tone: ToastNotice['tone'], title: string, detail?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, title, detail }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const appendAudit = useCallback(
    async (
      entry: Omit<AuditEvent, 'id' | 'timestamp' | 'prevEventHash' | 'currentEventHash'>,
    ): Promise<AuditEvent> => {
      const currentLog = auditLogRef.current;
      const lastEvent = currentLog[currentLog.length - 1];
      const prevHash = lastEvent ? lastEvent.currentEventHash : GENESIS_HASH;
      const id = `EVT-${1001 + currentLog.length}`;
      const timestamp = nowStamp();
      const currentEventHash = await sha256Hex(
        `${prevHash}|${id}|${timestamp}|${entry.payloadJson}`,
      );
      const nextEvent: AuditEvent = {
        ...entry,
        id,
        timestamp,
        prevEventHash: prevHash,
        currentEventHash,
      };
      auditLogRef.current = [...currentLog, nextEvent];
      return nextEvent;
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    setState((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  }, []);

  const openInspector = useCallback((unitId: string, tab: InspectorTab = 'trace') => {
    setInspectorUnitId(unitId);
    setInspectorTab(tab);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorUnitId(null);
  }, []);

  const notifyCopied = useCallback(
    (label: string) => {
      pushToast('info', `已复制：${label}`, '可直接粘贴到本地终端或浏览器书签栏执行');
    },
    [pushToast],
  );

  const confirmDependencyFact = useCallback(
    async (depId: string, note?: string) => {
      const target = state.dependencies.find((d) => d.id === depId);
      if (!target) return;
      if (target.confirmed && !target.unregisteredImplicit) {
        pushToast('info', `${target.targetName} 已在依赖账本确认登记`);
        return;
      }

      const evt = await appendAudit({
        category: 'DECISION',
        initiatorUser: `${CURRENT_ENGINEER.email} (GHE OAuth)`,
        executorType: 'HUMAN',
        sourceType: 'HUMAN_CONFIRMED',
        unitId: target.unitId,
        summary: `确认运行时隐式依赖 ${target.unitId} → ${target.targetName}，已并入双源共享库依赖账本`,
        payloadJson: JSON.stringify({
          depId,
          unitId: target.unitId,
          targetName: target.targetName,
          note: note ?? '已与 DBA 核实并纳入双源注册表',
        }),
      });

      setState((prev) => {
        const matchedTable = prev.sharedTables.find((t) => t.name === target.targetName);
        const promotedFromUnknown = matchedTable?.targetWave === 'Wave-Unknown';

        return {
          ...prev,
          dependencies: prev.dependencies.map((d) => {
            if (d.id === depId) {
              return {
                ...d,
                confirmed: true,
                unregisteredImplicit: false,
                source: 'HUMAN_CONFIRMED',
                targetWave:
                  promotedFromUnknown && d.targetWave === 'Wave-Unknown' ? 'W1' : d.targetWave,
                note: note ?? d.note ?? '已由工程师确认登记为正式依赖',
              };
            }
            if (
              promotedFromUnknown &&
              d.targetName === target.targetName &&
              d.targetWave === 'Wave-Unknown'
            ) {
              return { ...d, targetWave: 'W1' };
            }
            return d;
          }),
          sharedTables: prev.sharedTables.map((t) =>
            t.name !== target.targetName
              ? t
              : {
                  ...t,
                  unregisteredReaders: Math.max(0, t.unregisteredReaders - 1),
                  status: t.status === 'WAVE_UNKNOWN' ? 'DUAL_WRITE' : t.status,
                  targetWave: t.targetWave === 'Wave-Unknown' ? 'W1' : t.targetWave,
                },
          ),
          decisionQueue: prev.decisionQueue.map((item) =>
            item.relatedDepId === depId && item.status === 'PENDING'
              ? {
                  ...item,
                  status: 'APPROVED',
                  decisionNote: note ?? '已在共享库依赖账本确认登记',
                }
              : item,
          ),
          auditLog: [...prev.auditLog, evt],
        };
      });

      pushToast(
        'success',
        `已确认隐式依赖 · ${target.targetName}`,
        `${target.unitId} 已登记至双源依赖账本并更新 Cutover 锁校验`,
      );
    },
    [appendAudit, pushToast, state.dependencies],
  );

  const markKnowledgeSynced = useCallback(
    async (unitId: string, mode: 'agentcore' | 'local' = 'agentcore') => {
      const unit = state.units.find((u) => u.id === unitId);
      if (!unit) return;

      const stamp = nowStamp().slice(0, 16);
      const nextClaims = Math.max(unit.knowledge.totalClaimsCount, 12);
      const nextNodes = unit.knowledge.graphNodes > 0 ? unit.knowledge.graphNodes : 420;
      const isAgentCore = mode === 'agentcore';
      const sessionId = `ac-kb-${Date.now().toString(36).slice(-5)}`;

      const evt = await appendAudit({
        category: 'EXECUTION',
        initiatorUser: isAgentCore
          ? `${CURRENT_ENGINEER.email} (OBO → AgentCore)`
          : CURRENT_ENGINEER.email,
        executorType: 'AGENT',
        agentMetadata: {
          tool: isAgentCore
            ? 'AWS AgentCore Runtime (Knowledge Builder · MicroVM)'
            : 'agent-kit wiki sync (OpenWiki + Graphify)',
          model: isAgentCore
            ? 'Bedrock · Claude 3.7 Sonnet (VPC PrivateLink)'
            : 'github-copilot-cli (gh auth)',
          onBehalfOf: CURRENT_ENGINEER.email,
        },
        sourceType: 'CODE',
        unitId,
        summary: isAgentCore
          ? `AgentCore Runtime (${sessionId}) 已刷新中央知识仓 ${unit.knowledge.centralRepoPath} (${nextClaims} 条 Claims SHA-256 一致)`
          : `记录本地知识同步完成：${unit.knowledge.centralRepoPath} (${nextClaims} 条 Claims SHA-256 全部一致)`,
        payloadJson: JSON.stringify({
          unitId,
          mode,
          sessionId: isAgentCore ? sessionId : undefined,
          cedarPolicy: isAgentCore ? 'WRITE_CENTRAL_KNOWLEDGE_ONLY' : undefined,
          centralRepoPath: unit.knowledge.centralRepoPath,
          claims: nextClaims,
          graphNodes: nextNodes,
          telemetryDisabled: true,
        }),
      });

      setState((prev) => ({
        ...prev,
        units: prev.units.map((u) => {
          if (u.id !== unitId) return u;
          const wasMissingGraph = u.knowledge.graphifyStatus === 'MISSING';
          return {
            ...u,
            knowledge: {
              ...u.knowledge,
              openwikiStatus: 'FRESH',
              staleClaimsCount: 0,
              totalClaimsCount: nextClaims,
              lastPrSynced: isAgentCore
                ? `AgentCore (${sessionId}) · ${stamp}`
                : `LOCAL_SYNC · ${stamp}`,
              syncTrigger: isAgentCore ? 'PR_READY' : 'LOCAL_SYNC',
              dispatchRuntime: isAgentCore
                ? 'AgentCore Runtime (Bedrock)'
                : 'Local Copilot CLI',
              staleClaimFiles: [],
              graphifyStatus: wasMissingGraph ? 'INDEXED' : u.knowledge.graphifyStatus,
              graphNodes: wasMissingGraph ? nextNodes : u.knowledge.graphNodes,
              graphEdgesExtracted: wasMissingGraph ? 648 : u.knowledge.graphEdgesExtracted,
              graphEdgesInferred: wasMissingGraph ? 44 : u.knowledge.graphEdgesInferred,
              graphEdgesAmbiguous: wasMissingGraph ? 6 : u.knowledge.graphEdgesAmbiguous,
              legacyCoverageNote: wasMissingGraph
                ? 'MicroVM 内 tree-sitter AST 出图完成（零 LLM 成本），产物已同步至中央知识仓并接入 Gateway MCP。'
                : u.knowledge.legacyCoverageNote,
              indexPreviewMd: u.knowledge.indexPreviewMd.includes('未建库')
                ? `# ${u.code} ${u.name} (OKF v0.2)\n\n- [模块结构与入口流](overview.md) — 已由 AgentCore Runtime (Bedrock) 增量生成\n- [外部依赖与数据库契约](dependencies.md) — 已绑定源码 SHA-256\n\n> Grounded Claims: ${nextClaims}/${nextClaims} SHA-256 哈希全部有效 (${stamp})`
                : `${u.knowledge.indexPreviewMd.replace(/⚠️[^\n]*/g, '✅ Claim 已重新哈希校验通过')}`,
            },
          };
        }),
        gatewayTools: isAgentCore
          ? prev.gatewayTools.map((t) =>
              t.name === 'knowledge_index_read' || t.name === 'knowledge_graph_impact'
                ? { ...t, calls24h: t.calls24h + 1 }
                : t,
            )
          : prev.gatewayTools,
        auditLog: [...prev.auditLog, evt],
      }));

      pushToast(
        'success',
        isAgentCore
          ? `${unit.code} AgentCore 知识刷新完成`
          : `${unit.code} 本机知识同步已记录`,
        `OpenWiki Claims (${nextClaims}/${nextClaims}) 与 Graphify 索引已更新至中央仓及 Gateway MCP`,
      );
    },
    [appendAudit, pushToast, state.units],
  );

  const triggerAgentCorePrReview = useCallback(
    async (unitId: string, prNumber: string) => {
      const unit = state.units.find((u) => u.id === unitId);
      const pr = unit?.activePrs.find((p) => p.prNumber === prNumber);
      if (!unit || !pr) return;

      const stamp = nowStamp().slice(0, 16);
      const sessionId = `ac-rt-${Date.now().toString(36).slice(-6)}`;
      const existing = pr.autoReview;
      const verdict: 'PASS' | 'CHANGES_REQUESTED' =
        pr.lintPassed && pr.schemaPassed && pr.wp00Passed && pr.dirtyFilesCount === 0
          ? 'PASS'
          : 'CHANGES_REQUESTED';

      const evt = await appendAudit({
        category: 'EXECUTION',
        initiatorUser: `${CURRENT_ENGINEER.email} (OBO → AgentCore)`,
        executorType: 'AGENT',
        agentMetadata: {
          tool: 'AWS AgentCore Runtime (PR Auto Reviewer · MicroVM)',
          model: 'Bedrock · Claude 3.7 Sonnet (VPC PrivateLink)',
          onBehalfOf: CURRENT_ENGINEER.email,
        },
        sourceType: 'EXTERNAL_WEBHOOK',
        unitId,
        summary: `Dispatch AgentCore PR Auto Review (${sessionId}) 复审 ${prNumber}：结论 ${verdict === 'PASS' ? 'PASS (放行人工独立审)' : 'CHANGES_REQUESTED'}`,
        payloadJson: JSON.stringify({
          unitId,
          prNumber,
          sessionId,
          cedarPolicy: 'READ_ONLY_PR_COMMENT',
          verdict,
          gatewayTools: existing?.gatewayToolsUsed ?? [
            'knowledge_graph_impact',
            'knowledge_index_read',
            'factory_db_dependencies',
          ],
        }),
      });

      setState((prev) => ({
        ...prev,
        units: prev.units.map((u) => {
          if (u.id !== unitId) return u;
          return {
            ...u,
            activePrs: u.activePrs.map((p) => {
              if (p.prNumber !== prNumber) return p;
              return {
                ...p,
                autoReview: {
                  sessionId,
                  runtime: 'AgentCore Runtime (MicroVM)',
                  bedrockModel: 'Bedrock · Claude 3.7 Sonnet',
                  cedarPolicy: 'READ_ONLY_PR_COMMENT',
                  verdict,
                  durationSec: existing?.durationSec ?? 28,
                  gatewayToolsUsed: existing?.gatewayToolsUsed ?? [
                    'knowledge_graph_impact',
                    'knowledge_index_read',
                    'agentkit_rules',
                  ],
                  findings: existing?.findings ?? [
                    {
                      reviewer: 'Blast-Radius',
                      severity: 'PASS',
                      summary: 'Graphify 影响面校验通过，未发现无关业务代码改动。',
                      graphImpactNodes: 4,
                    },
                    {
                      reviewer: 'Migration-Semantics',
                      severity: pr.lintPassed ? 'PASS' : 'BLOCK',
                      summary: pr.lintPassed
                        ? 'OpenWiki 语义对照与静态规则无告警。'
                        : pr.failingCheckSummary ?? 'Stage 1 静态语义检查未通过。',
                    },
                    {
                      reviewer: 'Contract & Blitzy-Gate',
                      severity: pr.wp00Passed && pr.schemaPassed ? 'PASS' : 'BLOCK',
                      summary:
                        pr.wp00Passed && pr.schemaPassed
                          ? '证据 Manifest 与 WP-00 基线校验通过。'
                          : '尚缺 WP-00 外部双跑或 Manifest 校验。',
                    },
                  ],
                  reviewedAt: stamp,
                },
              };
            }),
          };
        }),
        gatewayTools: prev.gatewayTools.map((t) =>
          (existing?.gatewayToolsUsed ?? ['knowledge_graph_impact', 'knowledge_index_read']).includes(
            t.name,
          )
            ? { ...t, calls24h: t.calls24h + 1 }
            : t,
        ),
        auditLog: [...prev.auditLog, evt],
      }));

      pushToast(
        verdict === 'PASS' ? 'success' : 'warning',
        `AgentCore 预审完成 · ${prNumber}`,
        `MicroVM ${sessionId} (Cedar: READ_ONLY_PR_COMMENT) · 结论：${verdict === 'PASS' ? '预审放行，待人工独立 Review' : '已回写 Comment 要求修改'}`,
      );
    },
    [appendAudit, pushToast, state.units],
  );

  const confirmSmeRules = useCallback(
    async (
      groupId: string,
      ruleIds: string[],
      decision: 'CONFIRMED' | 'REJECTED',
      note?: string,
    ) => {
      if (ruleIds.length === 0) return;
      const group = state.smeGroups.find((g) => g.id === groupId);
      if (!group) return;

      const evt = await appendAudit({
        category: 'DECISION',
        initiatorUser: 'y.lu@custody.internal (SME · GHE OAuth)',
        executorType: 'HUMAN',
        sourceType: 'HUMAN_CONFIRMED',
        unitId: group.unitId,
        summary:
          decision === 'CONFIRMED'
            ? `SME 签字确认 ${group.unitId} 的 ${ruleIds.length} 条业务规则，锁定为权威 Spec 事实`
            : `SME 驳回 ${group.unitId} 的 ${ruleIds.length} 条规则草稿，要求补充源码与基线证据`,
        payloadJson: JSON.stringify({
          groupId,
          unitId: group.unitId,
          ruleIds,
          decision,
          note,
        }),
      });

      setState((prev) => {
        const nextGroups = prev.smeGroups.map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                rules: g.rules.map((r) =>
                  ruleIds.includes(r.id) ? { ...r, status: decision, smeNote: note ?? r.smeNote } : r,
                ),
              },
        );

        const unitGroups = nextGroups.filter((g) => g.unitId === group.unitId);
        const allConfirmed =
          unitGroups.length > 0 &&
          unitGroups.every((g) => g.rules.every((r) => r.status === 'CONFIRMED'));

        return {
          ...prev,
          smeGroups: nextGroups,
          units: prev.units.map((u) =>
            u.id === group.unitId && allConfirmed
              ? {
                  ...u,
                  observedActivity: `${group.l2Flow} 全部业务规则已获 SME 签字，Blitzy 入口权威规格已锁定`,
                  riskLevel: u.activePrs.some((p) => !p.wp00Passed) ? 'WATCH' : 'ON_TRACK',
                }
              : u,
          ),
          auditLog: [...prev.auditLog, evt],
        };
      });

      pushToast(
        decision === 'CONFIRMED' ? 'success' : 'warning',
        decision === 'CONFIRMED'
          ? `已签字确认 ${ruleIds.length} 条业务规则`
          : `已驳回 ${ruleIds.length} 条规则草稿`,
        'SME 决定已附带签名写入只追加 SHA-256 审计账本',
      );
    },
    [appendAudit, pushToast, state.smeGroups],
  );

  const resolveDecisionItem = useCallback(
    async (itemId: string, decision: 'APPROVED' | 'REJECTED', note?: string) => {
      const item = state.decisionQueue.find((i) => i.id === itemId);
      if (!item || item.status !== 'PENDING') return;

      const evt = await appendAudit({
        category: 'DECISION',
        initiatorUser: `${CURRENT_ENGINEER.email} (GHE OAuth)`,
        executorType: 'HUMAN',
        sourceType: 'HUMAN_CONFIRMED',
        unitId: item.unitId,
        summary: `人类决策 ${decision === 'APPROVED' ? '批准/确认' : '驳回'}：${item.title}`,
        payloadJson: JSON.stringify({
          itemId,
          kind: item.kind,
          unitId: item.unitId,
          decision,
          note,
        }),
      });

      setState((prev) => {
        const depAlreadyConfirmed = item.relatedDepId
          ? prev.dependencies.some(
              (d) => d.id === item.relatedDepId && d.confirmed && !d.unregisteredImplicit,
            )
          : false;
        const matchedTable = item.relatedTableName
          ? prev.sharedTables.find((t) => t.name === item.relatedTableName)
          : undefined;
        const promotedFromUnknown =
          item.kind === 'UNREGISTERED_DB' &&
          decision === 'APPROVED' &&
          !depAlreadyConfirmed &&
          matchedTable?.targetWave === 'Wave-Unknown';

        return {
          ...prev,
          decisionQueue: prev.decisionQueue.map((i) =>
            i.id !== itemId ? i : { ...i, status: decision, decisionNote: note },
          ),
          dependencies:
            item.kind === 'UNREGISTERED_DB' && decision === 'APPROVED'
              ? prev.dependencies.map((d) => {
                  if (item.relatedDepId && d.id === item.relatedDepId) {
                    return {
                      ...d,
                      confirmed: true,
                      unregisteredImplicit: false,
                      source: 'HUMAN_CONFIRMED',
                      targetWave:
                        promotedFromUnknown && d.targetWave === 'Wave-Unknown'
                          ? 'W1'
                          : d.targetWave,
                      note: note ?? d.note,
                    };
                  }
                  if (
                    promotedFromUnknown &&
                    item.relatedTableName &&
                    d.targetName === item.relatedTableName &&
                    d.targetWave === 'Wave-Unknown'
                  ) {
                    return { ...d, targetWave: 'W1' };
                  }
                  return d;
                })
              : prev.dependencies,
          sharedTables:
            item.kind === 'UNREGISTERED_DB' &&
            item.relatedTableName &&
            decision === 'APPROVED' &&
            !depAlreadyConfirmed
              ? prev.sharedTables.map((t) =>
                  t.name === item.relatedTableName
                    ? {
                        ...t,
                        unregisteredReaders: Math.max(0, t.unregisteredReaders - 1),
                        targetWave: t.targetWave === 'Wave-Unknown' ? 'W1' : t.targetWave,
                        status: t.status === 'WAVE_UNKNOWN' ? 'DUAL_WRITE' : t.status,
                      }
                    : t,
                )
              : prev.sharedTables,
          units:
            item.kind === 'DIFF_SIGNOFF' && item.relatedDiffClusterId
              ? prev.units.map((u) => {
                  if (u.id !== item.unitId) return u;
                  const nextStatus = decision === 'APPROVED' ? 'SME_ACCEPTED' : 'FIX_PR_CREATED';
                  const updatedClusters = u.wp00.diffClusters.map((c) =>
                    c.id === item.relatedDiffClusterId ? { ...c, status: nextStatus as typeof c.status } : c,
                  );
                  const allAccepted = updatedClusters.every((c) => c.status === 'SME_ACCEPTED');
                  return {
                    ...u,
                    wp00: {
                      ...u.wp00,
                      status: allAccepted ? 'PARITY_VERIFIED' : u.wp00.status,
                      diffClusters: updatedClusters,
                    },
                  };
                })
              : prev.units,
          auditLog: [...prev.auditLog, evt],
        };
      });

      pushToast(
        decision === 'APPROVED' ? 'success' : 'info',
        decision === 'APPROVED' ? '决策已签字生效' : '已驳回并退回本地修复',
        item.title,
      );
    },
    [appendAudit, pushToast, state.decisionQueue],
  );

  const evaluateCutoverDbLock = useCallback(
    (unitId: string): CutoverDbLockResult => {
      const unitDeps = state.dependencies.filter(
        (d) => d.unitId === unitId && d.kind === 'SYBASE_TABLE',
      );
      const blockingTables: SharedTable[] = [];
      for (const dep of unitDeps) {
        const tbl = state.sharedTables.find((t) => t.name === dep.targetName);
        if (tbl && tbl.status !== 'ORACLE_READY') {
          if (!blockingTables.some((b) => b.name === tbl.name)) {
            blockingTables.push(tbl);
          }
        }
      }
      return { locked: blockingTables.length > 0, blockingTables };
    },
    [state.dependencies, state.sharedTables],
  );

  const verifyAuditChain = useCallback(async (): Promise<AuditChainVerification> => {
    let prev = GENESIS_HASH;
    for (const evt of state.auditLog) {
      if (evt.prevEventHash !== prev) {
        return {
          valid: false,
          checkedCount: state.auditLog.length,
          brokenEventId: evt.id,
          verifiedAt: nowStamp(),
        };
      }
      const recomputed = await sha256Hex(
        `${prev}|${evt.id}|${evt.timestamp}|${evt.payloadJson}`,
      );
      if (recomputed !== evt.currentEventHash) {
        return {
          valid: false,
          checkedCount: state.auditLog.length,
          brokenEventId: evt.id,
          verifiedAt: nowStamp(),
        };
      }
      prev = evt.currentEventHash;
    }
    return {
      valid: true,
      checkedCount: state.auditLog.length,
      verifiedAt: nowStamp(),
    };
  }, [state.auditLog]);

  const resetDemoData = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setScope('ALL');
    setInspectorUnitId(null);
    void buildInitialAuditLog().then((auditLog) => {
      auditLogRef.current = auditLog;
      setState({
        ...makeDefaultState(state.theme),
        auditLog,
      });
      pushToast('info', '已重置演示账本数据', '所有追踪快照、依赖确认、知识状态与 SHA-256 审计链已恢复初始值');
    });
  }, [pushToast, state.theme]);

  const scopedUnits = useMemo(
    () => (scope === 'MINE' ? state.units.filter((u) => u.isMine) : state.units),
    [scope, state.units],
  );

  const batchTraces = useMemo(() => deriveBatchTraces(state.units), [state.units]);

  const scopedBatchTraces = useMemo(
    () => (scope === 'MINE' ? batchTraces.filter((t) => t.isMine) : batchTraces),
    [batchTraces, scope],
  );

  const value = useMemo<FactoryContextValue>(
    () => ({
      ...state,
      scope,
      setScope,
      scopedUnits,
      batchTraces,
      scopedBatchTraces,
      inspectorUnitId,
      inspectorTab,
      openInspector,
      closeInspector,
      cmdPaletteOpen,
      setCmdPaletteOpen,
      toasts,
      dismissToast,
      toggleTheme,
      confirmDependencyFact,
      markKnowledgeSynced,
      triggerAgentCorePrReview,
      confirmSmeRules,
      resolveDecisionItem,
      evaluateCutoverDbLock,
      notifyCopied,
      verifyAuditChain,
      resetDemoData,
    }),
    [
      state,
      scope,
      scopedUnits,
      batchTraces,
      scopedBatchTraces,
      inspectorUnitId,
      inspectorTab,
      openInspector,
      closeInspector,
      cmdPaletteOpen,
      toasts,
      dismissToast,
      toggleTheme,
      confirmDependencyFact,
      markKnowledgeSynced,
      triggerAgentCorePrReview,
      confirmSmeRules,
      resolveDecisionItem,
      evaluateCutoverDbLock,
      notifyCopied,
      verifyAuditChain,
      resetDemoData,
    ],
  );

  return <FactoryContext.Provider value={value}>{children}</FactoryContext.Provider>;
}

export function useFactory(): FactoryContextValue {
  const ctx = useContext(FactoryContext);
  if (!ctx) {
    throw new Error('useFactory must be used inside FactoryProvider');
  }
  return ctx;
}
