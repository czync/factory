import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export type SignalTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

/* ==========================================================================
   Button — Flat Precision Action Control
   ========================================================================== */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md';

export interface ButtonProps extends React.ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
}

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11.5px]',
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-8 px-3 text-[13px]',
};

const BUTTON_ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 w-6 p-0',
  sm: 'h-7 w-7 p-0',
  md: 'h-8 w-8 p-0',
};

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'mcp-btn-primary',
  secondary: 'mcp-btn-secondary',
  ghost: 'mcp-btn-ghost',
  danger: 'mcp-btn-danger',
};

export function Button({
  variant = 'secondary',
  size = 'sm',
  iconOnly = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const sizeClass = iconOnly ? BUTTON_ICON_SIZE_CLASSES[size] : BUTTON_SIZE_CLASSES[size];
  return (
    <button
      type={type}
      className={`mcp-btn ${BUTTON_VARIANT_CLASSES[variant]} ${sizeClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ==========================================================================
   StatusDot — Quiet Normalcy Indicator (6px dot + restrained ink)
   ========================================================================== */

export interface StatusDotProps {
  tone: SignalTone;
  label: string;
  sublabel?: string;
  mono?: boolean;
  className?: string;
}

const STATUS_DOT_STYLES: Record<SignalTone, { dot: string; text: string }> = {
  neutral: { dot: 'var(--ink-faint)', text: 'var(--ink-secondary)' },
  accent: { dot: 'var(--accent)', text: 'var(--ink)' },
  ok: { dot: 'var(--signal-ok)', text: 'var(--ink)' },
  warn: { dot: 'var(--signal-warn)', text: 'var(--signal-warn)' },
  danger: { dot: 'var(--signal-danger)', text: 'var(--signal-danger)' },
};

export function StatusDot({
  tone,
  label,
  sublabel,
  mono = false,
  className = '',
}: StatusDotProps) {
  const style = STATUS_DOT_STYLES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`.trim()}>
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: style.dot }}
        aria-hidden="true"
      />
      <span
        className={`truncate text-[12.5px] font-medium leading-[1.35] ${
          mono ? 'font-mono-tabular text-[12px]' : ''
        }`.trim()}
        style={{ color: style.text }}
      >
        {label}
      </span>
      {sublabel && (
        <span
          className={`truncate text-[11.5px] leading-[1.35] ${mono ? 'font-mono-tabular' : ''}`.trim()}
          style={{ color: 'var(--ink-muted)' }}
        >
          {sublabel}
        </span>
      )}
    </span>
  );
}

/* ==========================================================================
   Badge — Compact Flat Tag (4px radius)
   ========================================================================== */

export interface BadgeProps {
  tone?: SignalTone;
  mono?: boolean;
  children: React.ReactNode;
  className?: string;
}

const BADGE_STYLES: Record<SignalTone, { bg: string; border: string; text: string }> = {
  neutral: {
    bg: 'var(--bg-well)',
    border: 'var(--line)',
    text: 'var(--ink-secondary)',
  },
  accent: {
    bg: 'var(--accent-soft)',
    border: 'var(--accent-line)',
    text: 'var(--accent)',
  },
  ok: {
    bg: 'var(--signal-ok-soft)',
    border: 'var(--signal-ok-line)',
    text: 'var(--signal-ok)',
  },
  warn: {
    bg: 'var(--signal-warn-soft)',
    border: 'var(--signal-warn-line)',
    text: 'var(--signal-warn)',
  },
  danger: {
    bg: 'var(--signal-danger-soft)',
    border: 'var(--signal-danger-line)',
    text: 'var(--signal-danger)',
  },
};

export function Badge({
  tone = 'neutral',
  mono = false,
  children,
  className = '',
}: BadgeProps) {
  const s = BADGE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium leading-[1.3] whitespace-nowrap ${
        mono ? 'font-mono-tabular' : ''
      } ${className}`.trim()}
      style={{
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
      }}
    >
      {children}
    </span>
  );
}

/* ==========================================================================
   HairlineTabs — Horizontal 1.5px Underline Tabs
   Follows modern-web-guidance/tabs:
   - Single-row scrollable tablist with focusgroup="tablist nomemory" + roving tabindex fallback
   - Selection styled from [aria-selected="true"] with ::after border (Forced Colors safe)
   - No aria-controls on tabs; ArrowLeft/ArrowRight/Home/End keyboard support
   ========================================================================== */

export interface HairlineTabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  dotTone?: SignalTone;
  disabled?: boolean;
  id?: string;
}

export interface HairlineTabsProps<T extends string> {
  options: readonly HairlineTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  activationMode?: 'automatic' | 'manual';
  className?: string;
}

const DOT_TONE_COLOR: Record<SignalTone, string> = {
  neutral: 'var(--ink-faint)',
  accent: 'var(--accent)',
  ok: 'var(--signal-ok)',
  warn: 'var(--signal-warn)',
  danger: 'var(--signal-danger)',
};

export function HairlineTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  activationMode = 'automatic',
  className = '',
}: HairlineTabsProps<T>) {
  const tabRefs = useRef<Map<T, HTMLButtonElement | null>>(new Map());
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const activeButton = tabRefs.current.get(value);
    if (activeButton) {
      activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      // Let native focusgroup drive focus movement when supported
      const hasNativeFocusGroup =
        typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'focusGroup');
      if (hasNativeFocusGroup) return;

      const isRtl =
        typeof window !== 'undefined' &&
        window.getComputedStyle(e.currentTarget).direction === 'rtl';
      const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
      const prevKey = isRtl ? 'ArrowRight' : 'ArrowLeft';

      if (
        e.key !== nextKey &&
        e.key !== prevKey &&
        e.key !== 'Home' &&
        e.key !== 'End'
      ) {
        return;
      }

      const enabledIndices = options
        .map((opt, idx) => (opt.disabled ? -1 : idx))
        .filter((idx) => idx >= 0);

      if (enabledIndices.length === 0) return;

      const pos = enabledIndices.indexOf(currentIndex);
      let targetIndex: number | undefined;

      if (e.key === nextKey) {
        targetIndex = enabledIndices[(pos + 1) % enabledIndices.length];
      } else if (e.key === prevKey) {
        targetIndex =
          enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
      } else if (e.key === 'Home') {
        targetIndex = enabledIndices[0];
      } else if (e.key === 'End') {
        targetIndex = enabledIndices[enabledIndices.length - 1];
      }

      if (targetIndex === undefined) return;
      const targetOption = options[targetIndex];
      if (!targetOption) return;

      e.preventDefault();
      const targetEl = tabRefs.current.get(targetOption.value);
      targetEl?.focus();
    },
    [options],
  );

  const tablistAttrs = { focusgroup: 'tablist nomemory' } as Record<string, string>;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`mcp-tablist ${className}`.trim()}
      {...tablistAttrs}
    >
      {options.map((opt, index) => {
        const active = opt.value === value;
        const focusStartAttr = active ? ({ focusgroupstart: '' } as Record<string, string>) : {};
        return (
          <button
            key={opt.value}
            id={opt.id}
            ref={(el) => {
              tabRefs.current.set(opt.value, el);
            }}
            type="button"
            role="tab"
            disabled={opt.disabled}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!opt.disabled && opt.value !== value) {
                onChange(opt.value);
              }
            }}
            onFocus={() => {
              if (activationMode === 'automatic' && !opt.disabled && opt.value !== value) {
                onChange(opt.value);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`mcp-tab ${
              size === 'sm' ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3 text-[12.5px]'
            }`}
            {...focusStartAttr}
          >
            {opt.dotTone && (
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: DOT_TONE_COLOR[opt.dotTone] }}
                aria-hidden="true"
              />
            )}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className="font-mono-tabular text-[11px]"
                style={{ color: active ? 'var(--ink-secondary)' : 'var(--ink-faint)' }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   CopyCommandBar — Compact Monospace CLI Snippet with 1-Click Copy
   ========================================================================== */

export interface CopyCommandBarProps {
  command: string;
  label?: string;
  description?: string;
  prefix?: string;
  onCopy?: (command: string) => void;
  className?: string;
}

export function CopyCommandBar({
  command,
  label,
  description,
  prefix = '$',
  onCopy,
  className = '',
}: CopyCommandBarProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      onCopy?.(command);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1800);
    }
  }, [command, onCopy]);

  return (
    <div className={`space-y-1 ${className}`.trim()}>
      {(label || description) && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {label && (
            <span className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              {description}
            </span>
          )}
        </div>
      )}
      <div
        className="flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5"
        style={{
          backgroundColor: 'var(--bg-well)',
          border: '1px solid var(--line)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
          {prefix && (
            <span
              className="font-mono-tabular text-[11.5px] select-none shrink-0"
              style={{ color: 'var(--ink-faint)' }}
              aria-hidden="true"
            >
              {prefix}
            </span>
          )}
          <code
            className="font-mono-tabular text-[12px] whitespace-nowrap select-all"
            style={{ color: 'var(--ink)' }}
          >
            {command}
          </code>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void handleCopy()}
          aria-label={copied ? '已复制命令' : `复制命令：${label ?? command}`}
          className="shrink-0"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" style={{ color: 'var(--signal-ok)' }} aria-hidden="true" />
              <span style={{ color: 'var(--signal-ok)' }}>已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>复制</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ==========================================================================
   Kbd — Compact Keyboard Shortcut Hint
   ========================================================================== */

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export function Kbd({ children, className = '' }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center rounded-[4px] px-1.5 py-0.5 font-mono-tabular text-[11px] font-medium leading-none select-none ${className}`.trim()}
      style={{
        backgroundColor: 'var(--bg-well)',
        border: '1px solid var(--line-strong)',
        color: 'var(--ink-muted)',
      }}
    >
      {children}
    </kbd>
  );
}

/* ==========================================================================
   EmptyState — Minimal Centered Quiet Empty State
   ========================================================================== */

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`.trim()}
    >
      {icon && (
        <div
          className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[6px]"
          style={{
            backgroundColor: 'var(--bg-well)',
            border: '1px solid var(--line)',
            color: 'var(--ink-muted)',
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <p className="text-[13px] font-medium text-balance" style={{ color: 'var(--ink)' }}>
        {title}
      </p>
      {description && (
        <p
          className="mt-1 max-w-md text-[12px] text-pretty"
          style={{ color: 'var(--ink-muted)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}
