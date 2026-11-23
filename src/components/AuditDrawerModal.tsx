import { useMemo, useState } from 'react';
import { Cpu, Lock, ShieldCheck, UserCheck, Workflow } from 'lucide-react';
import { useFactory, type AuditChainVerification } from '@/data/store';
import type { AuditEvent } from '@/data/types';
import { shortHash } from '@/lib/crypto';
import { NativeDialog } from './NativeDialog';
import {
  Badge,
  Button,
  EmptyState,
  HairlineTabs,
  StatusDot,
} from './ui/Primitives';
import { AgentLedger, type LedgerEntry } from './uipros/agent-ledger-clean';
import { BlurCrossfade } from './uipros/blur-crossfade';
import { ShimmerText } from './uipros/shimmer-loader';

export interface AuditDrawerModalProps {
  open: boolean;
  onClose: () => void;
}

type CategoryFilter = 'ALL' | AuditEvent['category'];

const LEDGER_NOW = Date.UTC(2027, 2, 22, 12, 0, 0);

function parseLedgerTimestamp(ts: string, fallbackMs: number): number {
  const trimmed = ts.trim();
  const iso = trimmed.includes('T') ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

export function AuditDrawerModal({ open, onClose }: AuditDrawerModalProps) {
  const { auditLog, verifyAuditChain } = useFactory();
  const [filter, setFilter] = useState<CategoryFilter>('ALL');
  const [verification, setVerification] = useState<AuditChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { atById, clockNow } = useMemo(() => {
    const map = new Map<string, number>();
    let prevAt = LEDGER_NOW - 7 * 86_400_000;
    let maxAt = LEDGER_NOW;

    auditLog.forEach((evt, index) => {
      const parsed = parseLedgerTimestamp(evt.timestamp, prevAt + 60_000);
      const at =
        parsed > prevAt
          ? parsed
          : Math.max(prevAt + 1_000, LEDGER_NOW - 30_000 + index * 1_000);
      map.set(evt.id, at);
      prevAt = at;
      if (at > maxAt) {
        maxAt = at;
      }
    });

    return { atById: map, clockNow: maxAt };
  }, [auditLog]);

  const filtered = useMemo(
    () =>
      [...auditLog]
        .reverse()
        .filter((evt) => (filter === 'ALL' ? true : evt.category === filter)),
    [auditLog, filter],
  );

  const ledgerEntries = useMemo<LedgerEntry[]>(
    () =>
      filtered.map((evt) => {
        const ExecIcon =
          evt.executorType === 'HUMAN'
            ? UserCheck
            : evt.executorType === 'AGENT'
              ? Cpu
              : Workflow;

        return {
          id: evt.id,
          action: evt.summary,
          target: evt.unitId ?? evt.category,
          system: evt.sourceType,
          icon: <ExecIcon aria-hidden="true" />,
          at: atById.get(evt.id) ?? LEDGER_NOW,
          change: [shortHash(evt.prevEventHash, 12), shortHash(evt.currentEventHash, 12)],
          reversible: false,
        };
      }),
    [atById, filtered],
  );

  const agentEvents = useMemo(
    () => filtered.filter((evt) => Boolean(evt.agentMetadata)),
    [filtered],
  );

  const verificationBannerId = verifying
    ? 'verifying'
    : verification
      ? `${verification.valid ? 'valid' : 'invalid'}-${verification.checkedCount}-${verification.verifiedAt}`
      : `idle-${auditLog.length}`;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyAuditChain();
      setVerification(result);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      title="只追加防篡改审计账本 (Append-Only SHA-256 Ledger)"
      subtitle="事实 (FACT)、决定 (DECISION) 与执行 (EXECUTION) 三者物理分离；每日增量归档 AWS S3 Object Lock (Compliance)。"
      headerExtra={
        <Button variant="primary" size="sm" onClick={() => void handleVerify()} disabled={verifying}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {verifying ? '重算校验中…' : '重算整链 SHA-256'}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Verification Status Bar */}
        <BlurCrossfade id={verificationBannerId} duration={160} blur={3} morph="none">
          <div
            className="mcp-well flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
            style={{
              borderColor: verifying
                ? 'var(--accent-line)'
                : verification
                  ? verification.valid
                    ? 'var(--signal-ok-line)'
                    : 'var(--signal-danger-line)'
                  : 'var(--line)',
            }}
          >
            {verifying ? (
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--accent)' }}
                  aria-hidden="true"
                />
                <ShimmerText duration={1.4} className="text-[12.5px] font-medium">
                  正在调用 Web Crypto 重算 {auditLog.length} 条 SHA-256 哈希链…
                </ShimmerText>
              </span>
            ) : verification ? (
              verification.valid ? (
                <StatusDot
                  tone="ok"
                  label="哈希链完整性校验通过"
                  sublabel={`逐条重算 ${verification.checkedCount} 条 · ${verification.verifiedAt}`}
                  mono
                />
              ) : (
                <StatusDot
                  tone="danger"
                  label={`检测到链断裂：${verification.brokenEventId ?? 'UNKNOWN'}`}
                  sublabel={verification.verifiedAt}
                  mono
                />
              )
            ) : (
              <StatusDot
                tone="accent"
                label={`当前账本共 ${auditLog.length} 条不可变记录`}
                sublabel="点击右上角调用浏览器 Web Crypto 实时验签"
              />
            )}

            <span
              className="inline-flex items-center gap-1 font-mono-tabular text-[11.5px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              SHA-256 CHAIN · OBJECT LOCK
            </span>
          </div>
        </BlurCrossfade>

        {/* Category Filter Tabs */}
        <HairlineTabs<CategoryFilter>
          ariaLabel="按审计类别筛选"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: '全部记录', count: auditLog.length },
            {
              value: 'DECISION',
              label: '人类决定',
              count: auditLog.filter((e) => e.category === 'DECISION').length,
              dotTone: 'warn',
            },
            {
              value: 'FACT',
              label: '系统事实',
              count: auditLog.filter((e) => e.category === 'FACT').length,
              dotTone: 'accent',
            },
            {
              value: 'EXECUTION',
              label: '执行记录',
              count: auditLog.filter((e) => e.category === 'EXECUTION').length,
              dotTone: 'ok',
            },
          ]}
        />

        {/* Event Stream */}
        {filtered.length === 0 ? (
          <EmptyState
            title="当前类别暂无审计事件"
            description="切换其他审计分类查看完整哈希链记录。"
          />
        ) : (
          <div className="space-y-3">
            <AgentLedger
              title="SHA-256 不可变账本流"
              agent="AWS S3 Object Lock · 只追加不可撤回"
              now={clockNow}
              entries={ledgerEntries}
            />

            {agentEvents.length > 0 && (
              <section
                aria-label="Agent 执行器与 OBO 委托溯源"
                className="mcp-well px-3.5 py-2.5 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-medium" style={{ color: 'var(--ink)' }}>
                    Agent 执行器与 OBO 委托溯源
                  </span>
                  <Badge tone="neutral" mono>
                    {agentEvents.length} 条 Agent 记录
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {agentEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1.5 text-[11px] font-mono-tabular first:pt-0 first:border-t-0"
                      style={{
                        borderTop: '1px solid var(--line-subtle)',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0">
                        <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                          {evt.id}
                        </span>
                        {evt.unitId && <Badge mono>{evt.unitId}</Badge>}
                        <span>Tool: {evt.agentMetadata?.tool}</span>
                        <span>Model: {evt.agentMetadata?.model}</span>
                        <span>on_behalf_of: {evt.agentMetadata?.onBehalfOf}</span>
                      </div>
                      <time className="shrink-0" style={{ color: 'var(--ink-faint)' }}>
                        {evt.timestamp}
                      </time>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </NativeDialog>
  );
}
