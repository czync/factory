import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { closeDialogWithFallback } from '@/lib/motion';
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
  width?: 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * Right-side inspector drawer built on native `<dialog>` top-layer:
 * - Follows modern-web-guidance (`dialog` + `navigation-drawer`):
 *   - Uses `showModal()` for native top-layer, inert background, Esc, and focus return.
 *   - Omits redundant `role="dialog"` / `aria-modal`.
 *   - Uses `height: 100svh` (never `vh`/`dvh`) to avoid iOS viewport jump.
 *   - Uses `closedby="any"` + Safari `pointerdown`/`pointerup` rect check fallback.
 *   - Intercepts cancelable `cancel` event to play calm exit via `closeDialogWithFallback()`.
 *   - Resets `dialog.returnValue = ''` on close.
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
  children,
}: SlideDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      void closeDialogWithFallback(dialog);
    }
  }, [open]);

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
      onCloseRef.current();
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    // Safari fallback for closedby="any": require BOTH pointerdown & pointerup outside dialog rect
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

  const closedByAttr = { closedby: 'any' } as Record<string, string>;
  const drawerWidth = width === 'lg' ? '620px' : '580px';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="mcp-drawer"
      style={{ ['--drawer-width' as string]: drawerWidth }}
      {...closedByAttr}
    >
      <header
        className="shrink-0 px-5 pt-4 pb-3"
        style={{
          borderBottom: tabs ? 'none' : '1px solid var(--line)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id={titleId}
                className="text-[14.5px] font-semibold tracking-[-0.015em] text-balance"
                style={{ color: 'var(--ink)' }}
              >
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <div
                className="mt-1 text-[12px] text-pretty"
                style={{ color: 'var(--ink-muted)' }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              autoFocus
              aria-label="关闭抽屉"
              onClick={() => {
                if (dialogRef.current) {
                  void closeDialogWithFallback(dialogRef.current);
                }
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
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
    </dialog>
  );
}
