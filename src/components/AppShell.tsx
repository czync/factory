import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Database,
  GitPullRequestArrow,
  Layers,
  Link2,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useFactory } from '@/data/store';
import { CURRENT_ENGINEER, PROGRAM_TOTALS } from '@/data/types';
import { TRANSITION_OVERLAY, closeDialogWithFallback } from '@/lib/motion';
import { AppInspectorDrawer } from './AppInspectorDrawer';
import { AuditDrawerModal } from './AuditDrawerModal';
import { CommandPalette } from './CommandPalette';
import { Button, Kbd } from './ui/Primitives';

interface AppShellProps {
  children: React.ReactNode;
}

type NavRoutePath = '/' | '/trace' | '/knowledge' | '/standards';

interface NavItemDef {
  to: NavRoutePath;
  label: string;
  zhLabel: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; 'aria-hidden'?: boolean }>;
  match: (pathname: string) => boolean;
  badge?: number;
}

export function AppShell({ children }: AppShellProps) {
  const {
    theme,
    toggleTheme,
    scope,
    setScope,
    units,
    decisionQueue,
    smeGroups,
    auditLog,
    setCmdPaletteOpen,
    resetDemoData,
    toasts,
    dismissToast,
  } = useFactory();

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mobileNavId = useId();
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Sync native <dialog> top-layer modal for mobile navigation drawer
  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;

    if (mobileNavOpen) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      void closeDialogWithFallback(dialog);
    }
  }, [mobileNavOpen]);

  // Native <dialog> cancel / close / Safari closedby="any" light-dismiss fallback
  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      if (e.cancelable) {
        e.preventDefault();
        void closeDialogWithFallback(dialog);
      }
    };

    const handleClose = () => {
      dialog.returnValue = '';
      setMobileNavOpen(false);
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
  }, []);

  const closeMobileNav = () => {
    setMobileNavOpen(false);
  };

  const closedByAttr = { closedby: 'any' } as Record<string, string>;

  const pendingReviewCount =
    decisionQueue.filter((item) => item.status === 'PENDING').length +
    smeGroups.flatMap((group) => group.rules).filter((rule) => rule.status === 'PENDING').length;

  const mineCount = units.filter((u) => u.isMine).length;
  const engineerShortName = CURRENT_ENGINEER.name.split(' ')[0] ?? '周明';

  const navItems: NavItemDef[] = [
    {
      to: '/',
      label: 'Applications',
      zhLabel: '应用全景',
      icon: Layers,
      match: (p) => p === '/',
    },
    {
      to: '/trace',
      label: 'Batch Trace',
      zhLabel: '批次追踪',
      icon: GitPullRequestArrow,
      match: (p) => p.startsWith('/trace'),
    },
    {
      to: '/knowledge',
      label: 'Knowledge & Deps',
      zhLabel: '依赖与知识仓',
      icon: Database,
      match: (p) => p.startsWith('/knowledge'),
    },
    {
      to: '/standards',
      label: 'Standards & Review',
      zhLabel: '标准与签字',
      icon: ShieldCheck,
      badge: pendingReviewCount,
      match: (p) => p.startsWith('/standards'),
    },
  ];

  const activeRoute = navItems.find((item) => item.match(pathname)) ?? navItems[0]!;

  const renderSidebarNav = (collapsed: boolean, onNavigate?: () => void) => (
    <nav aria-label="主导航" className="flex-1 overflow-y-auto px-2 py-2.5 space-y-0.5">
      {navItems.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={collapsed ? `${item.label} · ${item.zhLabel}` : undefined}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex items-center rounded-[6px] no-underline transition-colors duration-100 ${
              collapsed ? 'justify-center h-9 px-0' : 'justify-between gap-2 px-2.5 py-1.5'
            }`}
            style={{
              backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
              border: active ? '1px solid var(--line)' : '1px solid transparent',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              color: active ? 'var(--ink)' : 'var(--ink-secondary)',
            }}
          >
            <div className={`flex items-center min-w-0 ${collapsed ? '' : 'gap-2.5'}`}>
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: active ? 'var(--accent)' : 'var(--ink-muted)' }}
                aria-hidden={true}
              />
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[12.5px] font-medium">{item.label}</div>
                  <div
                    className="truncate text-[10.5px]"
                    style={{ color: active ? 'var(--ink-muted)' : 'var(--ink-faint)' }}
                  >
                    {item.zhLabel}
                  </div>
                </div>
              )}
            </div>

            {item.badge !== undefined && item.badge > 0 && (
              collapsed ? (
                <span
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--signal-warn)' }}
                  aria-label={`${item.badge} 项待签字`}
                />
              ) : (
                <span
                  className="font-mono-tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 text-[10.5px] font-medium shrink-0"
                  style={{
                    backgroundColor: 'var(--signal-warn-soft)',
                    border: '1px solid var(--signal-warn-line)',
                    color: 'var(--signal-warn)',
                  }}
                >
                  {item.badge}
                </span>
              )
            )}
          </Link>
        );
      })}
    </nav>
  );

  const renderSidebarFooter = (collapsed: boolean, onCloseMobile?: () => void) => (
    <div
      className={`shrink-0 p-2 ${collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}`}
      style={{ borderTop: '1px solid var(--line)' }}
    >
      <button
        type="button"
        onClick={() => {
          onCloseMobile?.();
          setAuditOpen(true);
        }}
        title={`SHA-256 审计账本 (${auditLog.length} 条记录)`}
        aria-label={`打开 SHA-256 审计账本，当前共 ${auditLog.length} 条记录`}
        className={`mcp-btn mcp-btn-ghost ${
          collapsed ? 'h-8 w-8 p-0 justify-center' : 'h-8 flex-1 justify-between px-2 text-[11.5px]'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
          {!collapsed && <span className="truncate">SHA-256 审计账本</span>}
        </span>
        {!collapsed && (
          <span
            className="font-mono-tabular rounded-[4px] px-1.5 py-0.5 text-[10.5px]"
            style={{
              backgroundColor: 'var(--bg-well)',
              border: '1px solid var(--line)',
              color: 'var(--ink-muted)',
            }}
          >
            {auditLog.length}
          </span>
        )}
      </button>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={() => {
          onCloseMobile?.();
          resetDemoData();
        }}
        title="重置演示账本数据"
        aria-label="重置演示账本数据"
        className="shrink-0"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--ink)' }}
    >
      {/* Desktop Collapsible Left Sidebar (216px expanded / 60px collapsed) */}
      <aside
        aria-label="主侧边导航"
        className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-hidden"
        style={{
          width: sidebarCollapsed ? '60px' : '216px',
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--line)',
          transition: 'width var(--dur-overlay) var(--ease-calm)',
        }}
      >
        {/* Brand Header (48px height aligned with top bar) */}
        <div
          className={`h-12 shrink-0 flex items-center ${
            sidebarCollapsed ? 'justify-center px-1.5' : 'justify-between gap-2 px-3'
          }`}
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          {!sidebarCollapsed && (
            <Link
              to="/"
              className="flex items-center gap-2 min-w-0 no-underline"
              style={{ color: 'var(--ink)' }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px]"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-ink)',
                }}
                aria-hidden="true"
              >
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[12px] font-semibold tracking-[-0.015em]">
                  Migration Control Plane
                </div>
                <div
                  className="truncate font-mono-tabular text-[10px]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {PROGRAM_TOTALS.totalApps} Apps · ECS DEV
                </div>
              </div>
            </Link>
          )}

          <Button
            variant="ghost"
            size="xs"
            iconOnly
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>

        {renderSidebarNav(sidebarCollapsed)}
        {renderSidebarFooter(sidebarCollapsed)}
      </aside>

      {/* Mobile Native <dialog> Left Navigation Drawer (< lg) */}
      <dialog
        ref={mobileDialogRef}
        id={mobileNavId}
        className="mcp-drawer lg:hidden"
        data-side="left"
        aria-label="移动端导航"
        style={{
          ['--drawer-width' as string]: '260px',
          backgroundColor: 'var(--bg-sidebar)',
        }}
        {...closedByAttr}
      >
        <div
          className="h-12 shrink-0 flex items-center justify-between gap-2 px-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <Link
            to="/"
            onClick={closeMobileNav}
            className="flex items-center gap-2 min-w-0 no-underline"
            style={{ color: 'var(--ink)' }}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px]"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-ink)',
              }}
              aria-hidden="true"
            >
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12px] font-semibold tracking-[-0.015em]">
                Migration Control Plane
              </div>
              <div
                className="truncate font-mono-tabular text-[10px]"
                style={{ color: 'var(--ink-faint)' }}
              >
                {PROGRAM_TOTALS.totalApps} Apps · ECS DEV
              </div>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            autoFocus
            aria-label="关闭导航菜单"
            onClick={closeMobileNav}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {renderSidebarNav(false, closeMobileNav)}
        {renderSidebarFooter(false, closeMobileNav)}
      </dialog>

      {/* Main Column: 48px Sticky Top Bar + Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className="sticky top-0 z-30 h-12 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6"
          style={{
            backgroundColor: 'var(--topbar-bg)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {/* Left: Mobile Nav Toggle + Crisp Route Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className="lg:hidden shrink-0"
              aria-label="打开导航菜单"
              aria-controls={mobileNavId}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </Button>

            <nav aria-label="页面路径" className="flex items-center gap-1.5 min-w-0 text-[12.5px]">
              <span className="hidden sm:inline truncate" style={{ color: 'var(--ink-muted)' }}>
                Control Plane
              </span>
              <ChevronRight
                className="hidden sm:inline h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--ink-faint)' }}
                aria-hidden="true"
              />
              <span className="font-semibold truncate" style={{ color: 'var(--ink)' }}>
                {activeRoute.label}
              </span>
              <span
                className="hidden md:inline text-[11.5px] truncate"
                style={{ color: 'var(--ink-muted)' }}
              >
                · {activeRoute.zhLabel}
              </span>
            </nav>
          </div>

          {/* Right: Scope Toggle + Command Palette Trigger + Theme Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* All Apps / My Apps Scope Toggle */}
            <div
              role="group"
              aria-label="应用归属范围"
              className="inline-flex items-center rounded-[6px] p-0.5"
              style={{
                backgroundColor: 'var(--bg-well)',
                border: '1px solid var(--line)',
              }}
            >
              <button
                type="button"
                aria-pressed={scope === 'ALL'}
                onClick={() => setScope('ALL')}
                className="inline-flex items-center gap-1 rounded-[4px] px-2 h-6 text-[11.5px] font-medium transition-colors duration-100 cursor-pointer"
                style={{
                  backgroundColor: scope === 'ALL' ? 'var(--bg-surface)' : 'transparent',
                  color: scope === 'ALL' ? 'var(--ink)' : 'var(--ink-muted)',
                  boxShadow: scope === 'ALL' ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <span>All Apps</span>
                <span
                  className="hidden sm:inline font-mono-tabular text-[10.5px]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {PROGRAM_TOTALS.totalApps}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={scope === 'MINE'}
                onClick={() => setScope('MINE')}
                className="inline-flex items-center gap-1 rounded-[4px] px-2 h-6 text-[11.5px] font-medium transition-colors duration-100 cursor-pointer"
                style={{
                  backgroundColor: scope === 'MINE' ? 'var(--bg-surface)' : 'transparent',
                  color: scope === 'MINE' ? 'var(--ink)' : 'var(--ink-muted)',
                  boxShadow: scope === 'MINE' ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <span>My Apps</span>
                <span
                  className="hidden sm:inline text-[11px]"
                  style={{ color: scope === 'MINE' ? 'var(--accent)' : 'var(--ink-faint)' }}
                >
                  · {engineerShortName}
                </span>
                <span
                  className="font-mono-tabular text-[10.5px]"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  {mineCount}
                </span>
              </button>
            </div>

            {/* Command Palette Trigger */}
            <button
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
              aria-label="打开全局命令面板 (⌘K)"
              className="mcp-btn mcp-btn-secondary h-7 px-2 text-[12px] gap-2"
            >
              <Search
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--ink-muted)' }}
                aria-hidden="true"
              />
              <span className="hidden md:inline" style={{ color: 'var(--ink-muted)' }}>
                检索应用 / PR / 表…
              </span>
              <Kbd>⌘K</Kbd>
            </button>

            {/* Light / Dark Theme Toggle */}
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '切换浅色工作台' : '切换暗色工作台'}
              title={theme === 'dark' ? '切换浅色工作台 (Light)' : '切换暗色工作台 (Dark)'}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </header>

        {/* Main View Canvas */}
        <main className="flex-1 min-w-0 px-4 py-4 sm:px-6">{children}</main>
      </div>

      {/* Global Overlays */}
      <AppInspectorDrawer />
      <CommandPalette />
      <AuditDrawerModal open={auditOpen} onClose={() => setAuditOpen(false)} />

      {/* Calm Top-Right Toast Stack */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-[56px] right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const dotColor =
              toast.tone === 'success'
                ? 'var(--signal-ok)'
                : toast.tone === 'danger'
                  ? 'var(--signal-danger)'
                  : toast.tone === 'warning'
                    ? 'var(--signal-warn)'
                    : 'var(--accent)';

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={TRANSITION_OVERLAY}
                className="pointer-events-auto flex items-start gap-2.5 rounded-[8px] px-3 py-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--line-strong)',
                  boxShadow: 'var(--shadow-overlay)',
                }}
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium" style={{ color: 'var(--ink)' }}>
                    {toast.title}
                  </div>
                  {toast.detail && (
                    <div
                      className="mt-0.5 text-[11.5px] leading-snug text-pretty"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      {toast.detail}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  aria-label="关闭通知"
                  onClick={() => dismissToast(toast.id)}
                  className="shrink-0"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
