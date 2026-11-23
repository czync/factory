import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
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
 * Centered modal dialog powered by @base-ui/react/dialog:
 * - Provides accessible portal, focus containment, Esc & backdrop dismiss,
 *   and calm [data-starting-style]/[data-ending-style] motion.
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
  const dialogWidth = size === 'md' ? '600px' : '860px';

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
        <Dialog.Backdrop className="bui-backdrop" />
        <Dialog.Popup
          className="bui-dialog-popup"
          style={{ ['--dialog-width' as string]: dialogWidth }}
        >
          <div
            className="flex items-start justify-between gap-4 px-5 py-3.5 shrink-0"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div className="min-w-0">
              <Dialog.Title
                className="text-[14.5px] font-semibold tracking-[-0.015em] text-balance"
                style={{ color: 'var(--ink)' }}
              >
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description
                  className="mt-0.5 text-[12px] text-pretty"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {headerExtra}
              <Dialog.Close
                render={
                  <Button variant="ghost" size="sm" iconOnly aria-label="关闭对话框">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                }
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
