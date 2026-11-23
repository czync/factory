import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CornerDownLeft,
  Database,
  GitPullRequestArrow,
  Layers,
  Search,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';
import { useFactory } from '@/data/store';
import { closeDialogWithFallback } from '@/lib/motion';
import { Badge, Kbd, type SignalTone } from './ui/Primitives';

type PaletteAction =
  | { kind: 'route'; to: '/' | '/trace' | '/knowledge' | '/standards' }
  | { kind: 'inspector'; unitId: string };

interface PaletteItem {
  id: string;
  group: 'routes' | 'apps' | 'prs' | 'tables' | 'rules';
  title: string;
  subtitle?: string;
  meta?: string;
  badgeText?: string;
  badgeTone?: SignalTone;
  action: PaletteAction;
}

const GROUP_LABELS: Record<PaletteItem['group'], string> = {
  routes: '视图导航',
  apps: '应用单元 (Applications)',
  prs: 'PR 与批次追踪',
  tables: '共享 Sybase 表',
  rules: '确定性校验规则',
};

const GROUP_ORDER: readonly PaletteItem['group'][] = ['apps', 'prs', 'tables', 'rules', 'routes'];

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function CommandPalette() {
  const {
    units,
    batchTraces,
    sharedTables,
    verificationRules,
    cmdPaletteOpen,
    setCmdPaletteOpen,
    openInspector,
    closeInspector,
  } = useFactory();
  const navigate = useNavigate();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openStateRef = useRef(cmdPaletteOpen);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const listboxId = useId();
  const labelId = useId();

  useEffect(() => {
    openStateRef.current = cmdPaletteOpen;
  }, [cmdPaletteOpen]);

  // Global Cmd+K / Ctrl+K listener (always toggles palette; ignores non-shortcut typing in inputs)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(!openStateRef.current);
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !openStateRef.current) {
        if (isEditableElement(e.target)) return;
        e.preventDefault();
        setCmdPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [setCmdPaletteOpen]);

  // Synchronize native <dialog> top-layer modal open/close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (cmdPaletteOpen) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) {
        dialog.showModal();
      }
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (dialog.open) {
      void closeDialogWithFallback(dialog);
    }
  }, [cmdPaletteOpen]);

  // Native <dialog> cancel / close / Safari light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      if (e.cancelable) {
        e.preventDefault();
        void closeDialogWithFallback(dialog);
      }
    };

    const handleClose = () => {
      dialog.returnValue = '';
      setQuery('');
      setActiveIndex(0);
      setCmdPaletteOpen(false);
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        void closeDialogWithFallback(dialog);
      }
      pressedOutside = false;
    };

    const needsLightDismissFallback = !('closedBy' in HTMLDialogElement.prototype);
    if (needsLightDismissFallback) {
      dialog.addEventListener('pointerdown', handlePointerDown);
      dialog.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
      if (needsLightDismissFallback) {
        dialog.removeEventListener('pointerdown', handlePointerDown);
        dialog.removeEventListener('pointerup', handlePointerUp);
      }
    };
  }, [setCmdPaletteOpen]);

  const executeItem = useCallback(
    (item: PaletteItem) => {
      const dialog = dialogRef.current;
      if (dialog && dialog.open) {
        dialog.removeAttribute('data-closing');
        dialog.close();
      } else {
        setQuery('');
        setActiveIndex(0);
        setCmdPaletteOpen(false);
      }

      if (item.action.kind === 'inspector') {
        openInspector(item.action.unitId, 'trace');
      } else {
        closeInspector();
        void navigate({ to: item.action.to });
      }
    },
    [closeInspector, navigate, openInspector, setCmdPaletteOpen],
  );

  const groupedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const isDefaultView = q.length === 0;

    const allRouteItems: PaletteItem[] = [
      {
        id: 'route-apps',
        group: 'routes',
        title: 'Applications · 应用全景',
        subtitle: '78 应用纳管台账、三态进度与风险筛选',
        meta: '/',
        action: { kind: 'route', to: '/' },
      },
      {
        id: 'route-trace',
        group: 'routes',
        title: 'Batch Trace · 批次追踪',
        subtitle: 'Jira ↔ Branch/PR ↔ Verification Loop 全链路视图',
        meta: '/trace',
        action: { kind: 'route', to: '/trace' },
      },
      {
        id: 'route-knowledge',
        group: 'routes',
        title: 'Knowledge & Deps · 依赖与知识仓',
        subtitle: '共享 Sybase 表“数据先到”锁与中央 OpenWiki / Graphify',
        meta: '/knowledge',
        action: { kind: 'route', to: '/knowledge' },
      },
      {
        id: 'route-standards',
        group: 'routes',
        title: 'Standards & Review · 标准与签字',
        subtitle: 'agent-kit 发版、确定性规则、只读 Bot 与人类 SME 签字台',
        meta: '/standards',
        action: { kind: 'route', to: '/standards' },
      },
    ];

    const routeItems = allRouteItems.filter((r) => {
      if (isDefaultView) return true;
      return `${r.title} ${r.subtitle ?? ''} ${r.meta ?? ''}`.toLowerCase().includes(q);
    });

    const appSource = isDefaultView
      ? [...units]
          .sort((a, b) => {
            const rank = { HIGH: 0, WATCH: 1, ON_TRACK: 2 };
            return rank[a.riskLevel] - rank[b.riskLevel];
          })
          .slice(0, 5)
      : units.filter((u) =>
          `${u.code} ${u.name} ${u.jiraKey} ${u.domain} ${u.owner} ${u.wave} ${u.disposition}`
            .toLowerCase()
            .includes(q),
        );

    const appItems: PaletteItem[] = appSource.map((u) => ({
      id: `app-${u.id}`,
      group: 'apps',
      title: `${u.code} · ${u.name}`,
      subtitle: `${u.domain} · ${u.owner} · ${u.jiraKey}`,
      meta: u.wave,
      badgeText: u.riskLevel === 'HIGH' ? '阻塞' : u.disposition,
      badgeTone:
        u.riskLevel === 'HIGH' ? 'danger' : u.disposition === 'Modernize' ? 'accent' : 'neutral',
      action: { kind: 'inspector', unitId: u.id },
    }));

    const prSource = isDefaultView
      ? batchTraces.slice(0, 4)
      : batchTraces.filter((t) =>
          `${t.pr.prNumber} ${t.pr.title} ${t.pr.jiraKey} ${t.unitCode} ${t.wpCode} ${t.pr.branch} ${t.pr.aiExecutor}`
            .toLowerCase()
            .includes(q),
        );

    const prItems: PaletteItem[] = prSource.map((t) => {
      const hasFail = !t.pr.lintPassed || !t.pr.schemaPassed || !t.pr.commitTrailerComplete;
      return {
        id: `pr-${t.id}`,
        group: 'prs',
        title: `${t.pr.prNumber} · ${t.pr.title}`,
        subtitle: `${t.unitCode} · ${t.pr.jiraKey} · ${t.pr.aiExecutor}`,
        meta: t.wpCode,
        badgeText: hasFail ? 'CI 拦截' : t.pr.reviewState,
        badgeTone: hasFail ? 'danger' : t.pr.reviewState === 'APPROVED' || t.pr.reviewState === 'MERGED' ? 'ok' : 'neutral',
        action: { kind: 'inspector', unitId: t.unitId },
      };
    });

    const tableSource = isDefaultView
      ? [...sharedTables]
          .sort((a, b) => b.unregisteredReaders - a.unregisteredReaders)
          .slice(0, 3)
      : sharedTables.filter((tbl) =>
          `${tbl.name} ${tbl.ownerAppId} ${tbl.ownerAppName} ${tbl.targetWave} ${tbl.status}`
            .toLowerCase()
            .includes(q),
        );

    const tableItems: PaletteItem[] = tableSource.map((tbl) => ({
      id: `tbl-${tbl.name}`,
      group: 'tables',
      title: tbl.name,
      subtitle: `归属 ${tbl.ownerAppId} (${tbl.ownerAppName}) · ${tbl.readersCount} 读取方`,
      meta: tbl.targetWave,
      badgeText:
        tbl.unregisteredReaders > 0 ? `${tbl.unregisteredReaders} 未登记` : tbl.status,
      badgeTone:
        tbl.unregisteredReaders > 0 || tbl.status === 'WAVE_UNKNOWN'
          ? 'danger'
          : tbl.status === 'ORACLE_READY'
            ? 'ok'
            : 'warn',
      action: { kind: 'route', to: '/knowledge' },
    }));

    const ruleSource = isDefaultView
      ? verificationRules.slice(0, 3)
      : verificationRules.filter((r) =>
          `${r.code} ${r.name} ${r.tool} ${r.layer} ${r.wpScope} ${r.sourceCaseJira} ${r.description}`
            .toLowerCase()
            .includes(q),
        );

    const ruleItems: PaletteItem[] = ruleSource.map((r) => ({
      id: `rule-${r.id}`,
      group: 'rules',
      title: `${r.code} · ${r.name}`,
      subtitle: `${r.tool} · ${r.wpScope} · 30d 拦截 ${r.intercepts30d} 次`,
      meta: r.layer,
      badgeText: r.status,
      badgeTone: r.status === 'NEW' ? 'accent' : r.status === 'WARN' ? 'warn' : 'neutral',
      action: { kind: 'route', to: '/standards' },
    }));

    const byGroup: Record<PaletteItem['group'], PaletteItem[]> = {
      apps: appItems,
      prs: prItems,
      tables: tableItems,
      rules: ruleItems,
      routes: routeItems,
    };

    const groups = GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: byGroup[group],
    })).filter((g) => g.items.length > 0);

    const flat: PaletteItem[] = groups.flatMap((g) => g.items);
    return { groups, flat };
  }, [batchTraces, query, sharedTables, units, verificationRules]);

  const clampedIndex =
    groupedItems.flat.length > 0
      ? Math.min(activeIndex, groupedItems.flat.length - 1)
      : -1;

  const activeItem = clampedIndex >= 0 ? groupedItems.flat[clampedIndex] : undefined;

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const total = groupedItems.flat.length;
    if (total === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (clampedIndex + 1) % total;
      setActiveIndex(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (clampedIndex - 1 + total) % total;
      setActiveIndex(prev);
      itemRefs.current[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      itemRefs.current[0]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = total - 1;
      setActiveIndex(last);
      itemRefs.current[last]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (activeItem) {
        e.preventDefault();
        executeItem(activeItem);
      }
    }
  };

  const renderGroupIcon = (group: PaletteItem['group'], active: boolean) => {
    const color = active ? 'var(--accent)' : 'var(--ink-muted)';
    const cls = 'h-3.5 w-3.5 shrink-0';
    switch (group) {
      case 'apps':
        return <Layers className={cls} style={{ color }} aria-hidden="true" />;
      case 'prs':
        return <GitPullRequestArrow className={cls} style={{ color }} aria-hidden="true" />;
      case 'tables':
        return <Table2 className={cls} style={{ color }} aria-hidden="true" />;
      case 'rules':
        return <ShieldCheck className={cls} style={{ color }} aria-hidden="true" />;
      case 'routes':
        return <Database className={cls} style={{ color }} aria-hidden="true" />;
    }
  };

  const closedByAttr = { closedby: 'any' } as Record<string, string>;

  // Build flat index lookup cleanly without mutable render counter
  const flatIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    groupedItems.flat.forEach((item, idx) => {
      map.set(item.id, idx);
    });
    return map;
  }, [groupedItems.flat]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelId}
      className="mcp-dialog"
      style={{ ['--dialog-width' as string]: '620px' }}
      {...closedByAttr}
    >
      <span id={labelId} className="mcp-sr-only">
        全局命令面板
      </span>

      {/* Top Search Input */}
      <div
        className="flex items-center gap-2 px-3.5 h-12 shrink-0"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus
          type="text"
          role="combobox"
          aria-expanded={cmdPaletteOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? `cmd-opt-${activeItem.id}` : undefined}
          placeholder="搜索应用编号、Jira、PR、Sybase 共享表、校验规则或页面…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--ink-faint)]"
          style={{ color: 'var(--ink)' }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
            aria-label="清空搜索词"
            className="mcp-btn mcp-btn-ghost h-6 px-1.5 text-[11px]"
          >
            清空
          </button>
        )}
        <Kbd className="hidden sm:inline-flex">ESC</Kbd>
        <button
          type="button"
          aria-label="关闭命令面板"
          onClick={() => {
            if (dialogRef.current) {
              void closeDialogWithFallback(dialogRef.current);
            } else {
              setCmdPaletteOpen(false);
            }
          }}
          className="mcp-btn mcp-btn-ghost h-7 w-7 p-0 shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Grouped Search Results */}
      <div
        id={listboxId}
        role="listbox"
        aria-label="命令面板结果"
        className="flex-1 max-h-[min(430px,58svh)] overflow-y-auto overscroll-contain p-2"
      >
        {groupedItems.groups.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
              未找到匹配「{query}」的条目
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
              可尝试输入应用代码（如 APP-012）、Jira Key（MIG-1042）、表名（SYB_）或规则编号。
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {groupedItems.groups.map((group) => {
              const groupLabelId = `${listboxId}-group-${group.group}`;
              return (
                <div key={group.group} role="group" aria-labelledby={groupLabelId}>
                  <div
                    id={groupLabelId}
                    className="px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-[0.02em]"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const flatIdx = flatIndexMap.get(item.id) ?? -1;
                      const active = flatIdx === clampedIndex;
                      return (
                        <button
                          key={item.id}
                          id={`cmd-opt-${item.id}`}
                          ref={(el) => {
                            if (flatIdx >= 0) {
                              itemRefs.current[flatIdx] = el;
                            }
                          }}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={active}
                          onMouseEnter={() => {
                            if (flatIdx >= 0) setActiveIndex(flatIdx);
                          }}
                          onClick={() => executeItem(item)}
                          className="w-full flex items-center justify-between gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors duration-100 cursor-pointer"
                          style={{
                            backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {renderGroupIcon(item.group, active)}
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-[12.5px] font-medium leading-snug"
                                style={{ color: active ? 'var(--ink)' : 'var(--ink-secondary)' }}
                              >
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div
                                  className="truncate text-[11.5px] leading-snug"
                                  style={{ color: 'var(--ink-muted)' }}
                                >
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.badgeText && (
                              <Badge tone={item.badgeTone ?? 'neutral'} mono>
                                {item.badgeText}
                              </Badge>
                            )}
                            {item.meta && (
                              <span
                                className="font-mono-tabular text-[11px]"
                                style={{ color: 'var(--ink-faint)' }}
                              >
                                {item.meta}
                              </span>
                            )}
                            {active && (
                              <CornerDownLeft
                                className="h-3.5 w-3.5 shrink-0"
                                style={{ color: 'var(--accent)' }}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calm Footer Legend */}
      <footer
        className="flex items-center justify-between gap-3 px-3.5 py-2 text-[11.5px] shrink-0"
        style={{
          borderTop: '1px solid var(--line)',
          backgroundColor: 'var(--bg-sidebar)',
          color: 'var(--ink-muted)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>选择</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd>
            <span>打开</span>
          </span>
        </div>
        <span className="font-mono-tabular text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          {groupedItems.flat.length} 项匹配
        </span>
      </footer>
    </dialog>
  );
}
