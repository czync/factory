import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Primitives';

export interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  headerActions?: React.ReactNode;
  tabs?: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'xs' | 'sm' | 'md' | 'lg';
  side?: 'right' | 'left';
  hideDefaultHeader?: boolean;
  backdropClassName?: string;
  popupClassName?: string;
  children: React.ReactNode;
}

const DRAWER_WIDTHS: Record<NonNullable<SlideDrawerProps['width']>, string> = {
  xs: '268px',
  sm: '460px',
  md: '580px',
  lg: '620px',
};

/**
 * Slide-over drawer built on @base-ui/react/dialog:
 * - Supports right inspector drawer (default) and left navigation drawer (`side="left"`).
 * - Uses 100svh (never vh/dvh), overscroll containment, Esc/Backdrop dismiss, and focus restoration.
 */
export function SlideDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  headerActions,
  tabs,
  footer,
  width = 'md',
  side = 'right',
  hideDefaultHeader = false,
  backdropClassName,
  popupClassName,
  children,
}: SlideDrawerProps) {
  const drawerWidth = DRAWER_WIDTHS[width];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={cn('bui-backdrop', backdropClassName)} />
        <Dialog.Popup
          data-side={side}
          className={cn('bui-drawer-popup', popupClassName)}
          style={{ ['--drawer-width' as string]: drawerWidth }}
        >
          {hideDefaultHeader ? (
            <>
              <Dialog.Title className="mcp-sr-only">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="mcp-sr-only">{subtitle}</Dialog.Description>}
              {children}
            </>
          ) : (
            <>
              <header
                className="shrink-0 px-5 pt-4 pb-3"
                style={{
                  borderBottom: tabs ? 'none' : '1px solid var(--line)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Dialog.Title
                        className="text-[14.5px] font-semibold tracking-[-0.015em] text-balance"
                        style={{ color: 'var(--ink)' }}
                      >
                        {title}
                      </Dialog.Title>
                      {badge}
                    </div>
                    {subtitle && (
                      <Dialog.Description
                        className="mt-1 text-[12px] text-pretty"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        {subtitle}
                      </Dialog.Description>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {headerActions}
                    <Dialog.Close
                      render={
                        <Button variant="ghost" size="sm" iconOnly aria-label="关闭抽屉">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              </header>

              {tabs && <div className="shrink-0 px-5">{tabs}</div>}

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

              {footer && (
                <footer
                  className="shrink-0 flex items-center justify-between gap-3 px-5 py-3"
                  style={{
                    borderTop: '1px solid var(--line)',
                    backgroundColor: 'var(--bg-sidebar)',
                  }}
                >
                  {footer}
                </footer>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
