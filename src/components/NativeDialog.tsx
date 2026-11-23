import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { closeDialogWithFallback } from '@/lib/motion';
import { Button } from './ui/Primitives';

export interface NativeDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}

/**
 * Native `<dialog>` modal following modern-web-guidance (`dialog`):
 * - Opens via `showModal()`, relying on native top-layer, inert background, focus containment, Esc, and focus return.
 * - Omits redundant `role="dialog"` / `aria-modal`.
 * - Uses `closedby="any"` + Safari `pointerdown`/`pointerup` outside-rect fallback.
 * - Intercepts cancelable `cancel` events to animate exit cleanly via `closeDialogWithFallback()`.
 * - Resets `dialog.returnValue = ''` on close.
 */
export function NativeDialog({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  size = 'lg',
  children,
}: NativeDialogProps) {
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

    // Safari fallback for closedby="any": require press AND release outside dialog rect
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
  const dialogWidth = size === 'md' ? '600px' : '860px';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="mcp-dialog"
      style={{ ['--dialog-width' as string]: dialogWidth }}
      {...closedByAttr}
    >
      <div
        className="flex items-start justify-between gap-4 px-5 py-3.5 shrink-0"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-[14.5px] font-semibold tracking-[-0.015em] text-balance"
            style={{ color: 'var(--ink)' }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-pretty" style={{ color: 'var(--ink-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {headerExtra}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="关闭对话框"
            autoFocus
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

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
    </dialog>
  );
}
