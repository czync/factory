import React, { useId, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useReducedMotion,
} from 'motion/react';
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
import { CURRENT_ENGINEER, PROGRAM_TOTALS, type AppScope } from '@/data/types';
import { EASE_CALM, SPRING_INDICATOR, TRANSITION_OVERLAY } from '@/lib/motion';
import { AppInspectorDrawer } from './AppInspectorDrawer';
import { AuditDrawerModal } from './AuditDrawerModal';
import { CommandPalette } from './CommandPalette';
import { Button, Kbd, Tooltip, TooltipProvider } from './ui/Primitives';
import { SlideDrawer } from './ui/SlideDrawer';
import { NumberTicker } from './uipros/number-ticker';
import { SegmentedControl } from './uipros/segmented-control-clean';

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

interface SidebarNavProps {
  navItems: readonly NavItemDef[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ navItems, pathname, collapsed, onNavigate }: SidebarNavProps) {
  const navGroupId = useId();
  const prefersReducedMotion = Boolean(useReducedMotion());

  return (
    <LayoutGroup id={navGroupId}>
      <nav aria-label="主导航" className="flex-1 overflow-y-auto px-2 py-2.5 space-y-0.5">
        {navItems.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Tooltip
              key={item.to}
              content={`${item.label} · ${item.zhLabel}`}
              side="right"
              disabled={!collapsed}
            >
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center rounded-[6px] no-underline transition-colors duration-100 ${
                  collapsed ? 'justify-center h-9 px-0' : 'justify-between gap-2 px-2.5 py-1.5'
                }`}
                style={{
                  color: active ? 'var(--ink)' : 'var(--ink-secondary)',
                }}
              >
                {active && (
                  <motion.span
                    layoutId={prefersReducedMotion ? undefined : `${navGroupId}-active`}
                    transition={prefersReducedMotion ? { duration: 0 } : SPRING_INDICATOR}
                    className="pointer-events-none absolute inset-0 rounded-[6px]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--line)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                    aria-hidden="true"
                  />
                )}

                <div
                  className={`relative z-10 flex items-center min-w-0 ${collapsed ? '' : 'gap-2.5'}`}
                >
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

                {item.badge !== undefined &&
                  item.badge > 0 &&
                  (collapsed ? (
                    <span
                      className="absolute top-1.5 right-1.5 z-10 h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--signal-warn)' }}
                      aria-label={`${item.badge} 项待签字`}
                    />
                  ) : (
                    <span
                      className="relative z-10 font-mono-tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 text-[10.5px] font-medium shrink-0"
                      style={{
                        backgroundColor: 'var(--signal-warn-soft)',
                        border: '1px solid var(--signal-warn-line)',
                        color: 'var(--signal-warn)',
                      }}
                    >
                      <NumberTicker value={item.badge} duration={380} />
                    </span>
                  ))}
              </Link>
            </Tooltip>
          );
        })}
      </nav>
    </LayoutGroup>
  );
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
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const closeMobileNav = () => {
    setMobileNavOpen(false);
  };

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

  const renderSidebarFooter = (collapsed: boolean, onCloseMobile?: () => void) => (
    <div
      className={`shrink-0 p-2 ${collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}`}
      style={{ borderTop: '1px solid var(--line)' }}
    >
      <Tooltip
        content={`SHA-256 审计账本 (${auditLog.length} 条记录)`}
        side={collapsed ? 'right' : 'top'}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onCloseMobile?.();
            setAuditOpen(true);
          }}
          aria-label={`打开 SHA-256 审计账本，当前共 ${auditLog.length} 条记录`}
          className={
            collapsed ? 'h-8 w-8 p-0 justify-center' : 'h-8 flex-1 justify-between px-2 text-[11.5px]'
          }
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
              <NumberTicker value={auditLog.length} duration={380} />
            </span>
          )}
        </Button>
      </Tooltip>

      <Tooltip content="重置演示账本数据" side={collapsed ? 'right' : 'top'}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={() => {
            onCloseMobile?.();
            resetDemoData();
          }}
          aria-label="重置演示账本数据"
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </Tooltip>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delay={240}>
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

            <Tooltip content={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'} side="right">
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
            </Tooltip>
          </div>

          <SidebarNav navItems={navItems} pathname={pathname} collapsed={sidebarCollapsed} />
          {renderSidebarFooter(sidebarCollapsed)}
        </aside>

        {/* Mobile Left Navigation Drawer (< lg) powered by Base UI Dialog */}
        <SlideDrawer
          open={mobileNavOpen}
          onClose={closeMobileNav}
          side="left"
          width="xs"
          title="Migration Control Plane"
          subtitle={`${PROGRAM_TOTALS.totalApps} Apps · ECS DEV`}
          hideDefaultHeader
          backdropClassName="lg:hidden"
          popupClassName="lg:hidden"
        >
          <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
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
                aria-label="关闭导航菜单"
                onClick={closeMobileNav}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <SidebarNav
              navItems={navItems}
              pathname={pathname}
              collapsed={false}
              onNavigate={closeMobileNav}
            />
            {renderSidebarFooter(false, closeMobileNav)}
          </div>
        </SlideDrawer>

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
            <SegmentedControl<AppScope>
              variant="tray"
              size="sm"
              aria-label="应用归属范围"
              value={scope}
              onChange={setScope}
              options={[
                {
                  value: 'ALL',
                  label: 'All Apps',
                  count: PROGRAM_TOTALS.totalApps,
                  ariaLabel: `All Apps (${PROGRAM_TOTALS.totalApps})`,
                },
                {
                  value: 'MINE',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <span>My Apps</span>
                      <span
                        className="hidden sm:inline text-[11px]"
                        style={{ color: scope === 'MINE' ? 'var(--accent)' : 'var(--ink-faint)' }}
                      >
                        · {engineerShortName}
                      </span>
                    </span>
                  ),
                  count: mineCount,
                  ariaLabel: `My Apps · ${engineerShortName} (${mineCount})`,
                },
              ]}
            />

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
            <Tooltip
              content={theme === 'dark' ? '切换浅色工作台 (Light)' : '切换暗色工作台 (Dark)'}
              side="bottom"
              align="end"
            >
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? '切换浅色工作台' : '切换暗色工作台'}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={theme}
                    initial={
                      prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.78, rotate: -45 }
                    }
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={
                      prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.78, rotate: 45 }
                    }
                    transition={{ duration: 0.14, ease: EASE_CALM }}
                    className="inline-flex items-center justify-center"
                  >
                    {theme === 'dark' ? (
                      <Sun className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Moon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </Tooltip>
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
      </TooltipProvider>
    </MotionConfig>
  );
}
