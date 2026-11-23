import { useState } from 'react';
import { Cpu, Link2, ShieldCheck, UserCheck, Workflow } from 'lucide-react';
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
  type SignalTone,
} from './ui/Primitives';

export interface AuditDrawerModalProps {
  open: boolean;
  onClose: () => void;
}

type CategoryFilter = 'ALL' | AuditEvent['category'];

const CATEGORY_TONE: Record<AuditEvent['category'], SignalTone> = {
  DECISION: 'warn',
  FACT: 'accent',
  EXECUTION: 'ok',
};

export function AuditDrawerModal({ open, onClose }: AuditDrawerModalProps) {
  const { auditLog, verifyAuditChain } = useFactory();
  const [filter, setFilter] = useState<CategoryFilter>('ALL');
  const [verification, setVerification] = useState<AuditChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const filtered = [...auditLog]
    .reverse()
    .filter((evt) => (filter === 'ALL' ? true : evt.category === filter));

  const handleVerify = async () => {
    setVerifying(true);
    const result = await verifyAuditChain();
    setVerification(result);
    setVerifying(false);
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
        <div
          className="mcp-well flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
          style={{
            borderColor: verification
              ? verification.valid
                ? 'var(--signal-ok-line)'
                : 'var(--signal-danger-line)'
              : 'var(--line)',
          }}
        >
          {verification ? (
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

          <span className="font-mono-tabular text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
            SHA-256 CHAIN
          </span>
        </div>

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
          <div
            className="mcp-surface divide-y overflow-hidden"
            style={{ borderColor: 'var(--line)' }}
          >
            {filtered.map((evt) => {
              const catTone = CATEGORY_TONE[evt.category];
              const ExecIcon =
                evt.executorType === 'HUMAN'
                  ? UserCheck
                  : evt.executorType === 'AGENT'
                    ? Cpu
                    : Workflow;

              return (
                <article
                  key={evt.id}
                  className="px-4 py-3"
                  style={{ borderColor: 'var(--line-subtle)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-mono-tabular text-[11.5px] font-semibold"
                        style={{ color: 'var(--ink)' }}
                      >
                        {evt.id}
                      </span>
                      <Badge tone={catTone} mono>
                        {evt.category}
                      </Badge>
                      {evt.unitId && <Badge mono>{evt.unitId}</Badge>}
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        <ExecIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {evt.executorType} · {evt.initiatorUser}
                      </span>
                    </div>
                    <time
                      className="font-mono-tabular text-[11.5px]"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      {evt.timestamp}
                    </time>
                  </div>

                  <p className="mt-1.5 text-[13px] font-medium text-pretty" style={{ color: 'var(--ink)' }}>
                    {evt.summary}
                  </p>

                  {evt.agentMetadata && (
                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-mono-tabular"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      <span>Tool: {evt.agentMetadata.tool}</span>
                      <span>Model: {evt.agentMetadata.model}</span>
                      <span>on_behalf_of: {evt.agentMetadata.onBehalfOf}</span>
                    </div>
                  )}

                  <div
                    className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] font-mono-tabular"
                    style={{ borderTop: '1px solid var(--line-subtle)', color: 'var(--ink-faint)' }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Link2 className="h-3 w-3" aria-hidden="true" />
                      prev: {shortHash(evt.prevEventHash, 14)} → cur:{' '}
                      <span style={{ color: 'var(--accent)' }}>{shortHash(evt.currentEventHash, 16)}</span>
                    </span>
                    <span>source: {evt.sourceType}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </NativeDialog>
  );
}
