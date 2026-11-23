import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, ChevronsUpDown, Copy } from 'lucide-react';
import {
  EASE_CALM,
  SPRING_CHECK,
  SPRING_INDICATOR,
  SPRING_TACTILE,
  TAP_PRESS,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

export type SignalTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

/* ==========================================================================
   Button — Base UI Button + Flat Precision Control
   ========================================================================== */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonPrimitive.Props, 'className' | 'render'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
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
  disabled = false,
  children,
  ...rest
}: ButtonProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const sizeClass = iconOnly ? BUTTON_ICON_SIZE_CLASSES[size] : BUTTON_SIZE_CLASSES[size];
  return (
    <ButtonPrimitive
      type={type}
      disabled={disabled}
      className={cn('mcp-btn', BUTTON_VARIANT_CLASSES[variant], sizeClass, className)}
      render={
        <motion.button
          whileTap={disabled || prefersReducedMotion ? undefined : TAP_PRESS}
          transition={SPRING_TACTILE}
        />
      }
      {...rest}
    >
      {children}
    </ButtonPrimitive>
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
  pulse?: boolean;
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
  pulse = false,
  className = '',
}: StatusDotProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const style = STATUS_DOT_STYLES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
      {pulse ? (
        <span
          className="relative inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ border: `1px solid ${style.dot}` }}
            initial={prefersReducedMotion ? { scale: 1.7, opacity: 0.28 } : { scale: 1, opacity: 0.5 }}
            animate={
              prefersReducedMotion
                ? { scale: 1.7, opacity: 0.28 }
                : { scale: [1, 2.3], opacity: [0.5, 0] }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 2.4, repeat: Infinity, repeatDelay: 0.4, ease: 'easeOut' }
            }
          />
          <span
            className="relative h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: style.dot }}
          />
        </span>
      ) : (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: style.dot }}
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          'truncate text-[12.5px] font-medium leading-[1.35]',
          mono && 'font-mono-tabular text-[12px]',
        )}
        style={{ color: style.text }}
      >
        {label}
      </span>
      {sublabel && (
        <span
          className={cn('truncate text-[11.5px] leading-[1.35]', mono && 'font-mono-tabular')}
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
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium leading-[1.3] whitespace-nowrap',
        mono && 'font-mono-tabular',
        className,
      )}
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
   HairlineTabs — Base UI Tabs + Horizontal 1.5px Underline
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
  const groupId = useId();
  const prefersReducedMotion = Boolean(useReducedMotion());

  return (
    <LayoutGroup id={groupId}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next as T);
          }
        }}
        className={className}
      >
        <TabsPrimitive.List
          aria-label={ariaLabel}
          activateOnFocus={activationMode === 'automatic'}
          loopFocus
          className="mcp-tablist"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <TabsPrimitive.Tab
                key={opt.value}
                id={opt.id}
                value={opt.value}
                disabled={opt.disabled}
                data-motion-indicator="true"
                className={cn(
                  'mcp-tab',
                  size === 'sm' ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3 text-[12.5px]',
                )}
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
                {active && (
                  <motion.span
                    layoutId={prefersReducedMotion ? undefined : `${groupId}-underline`}
                    transition={prefersReducedMotion ? { duration: 0 } : SPRING_INDICATOR}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 border-b-[1.5px] border-[var(--accent)]"
                  />
                )}
              </TabsPrimitive.Tab>
            );
          })}
        </TabsPrimitive.List>
      </TabsPrimitive.Root>
    </LayoutGroup>
  );
}

/* ==========================================================================
   SelectField — Base UI Select with Precision Linear Trigger & Popup
   ========================================================================== */

export interface SelectFieldOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectFieldOption<T>[];
  ariaLabel: string;
  placeholder?: string;
  mono?: boolean;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  mono = false,
  size = 'sm',
  disabled = false,
  className,
  triggerClassName,
}: SelectFieldProps<T>) {
  return (
    <SelectPrimitive.Root<T>
      value={value}
      disabled={disabled}
      items={options}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-[6px] px-2.5 text-[12px] cursor-pointer outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap',
          size === 'sm' ? 'h-7' : 'h-8',
          mono && 'font-mono-tabular',
          className,
          triggerClassName,
        )}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--line-strong)',
          color: 'var(--ink)',
        }}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate text-left" />
        <SelectPrimitive.Icon className="flex shrink-0">
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--ink-faint)' }}
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          side="bottom"
          sideOffset={4}
          align="start"
          alignItemWithTrigger={false}
          className="z-[60]"
        >
          <SelectPrimitive.Popup className="bui-select-popup">
            <SelectPrimitive.List>
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn('bui-select-item', mono && 'font-mono-tabular')}
                >
                  <SelectPrimitive.ItemText className="truncate">
                    {opt.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="flex shrink-0">
                    <Check
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: 'var(--accent)' }}
                      aria-hidden="true"
                    />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ==========================================================================
   CheckboxField — Base UI Checkbox
   ========================================================================== */

export interface CheckboxFieldProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel?: string;
  className?: string;
}

export function CheckboxField({
  checked,
  indeterminate = false,
  disabled = false,
  onCheckedChange,
  ariaLabel,
  className,
}: CheckboxFieldProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const checkTransition = prefersReducedMotion ? { duration: 0 } : SPRING_CHECK;

  return (
    <CheckboxPrimitive.Root
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(next) => onCheckedChange(next)}
      className={cn('bui-checkbox', className)}
      render={
        <motion.span
          whileTap={disabled || prefersReducedMotion ? undefined : { scale: 0.92 }}
          transition={SPRING_TACTILE}
        />
      }
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        className="flex items-center justify-center pointer-events-none"
      >
        <motion.svg
          viewBox="0 0 12 12"
          className="h-3 w-3 pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <motion.path
            d="M2.25 6.25L4.75 8.75L9.75 3.5"
            initial={false}
            animate={{
              pathLength: checked && !indeterminate ? 1 : 0,
              opacity: checked && !indeterminate ? 1 : 0,
            }}
            transition={checkTransition}
          />
          <motion.path
            d="M2.5 6h7"
            initial={false}
            animate={{
              pathLength: indeterminate ? 1 : 0,
              opacity: indeterminate ? 1 : 0,
            }}
            transition={checkTransition}
          />
        </motion.svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/* ==========================================================================
   TooltipProvider & Tooltip — Base UI Tooltip
   ========================================================================== */

export function TooltipProvider({
  delay = 240,
  closeDelay = 0,
  children,
}: {
  delay?: number;
  closeDelay?: number;
  children: React.ReactNode;
}) {
  return (
    <TooltipPrimitive.Provider delay={delay} closeDelay={closeDelay}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  disabled = false,
}: TooltipProps) {
  if (disabled || !content) {
    return children;
  }

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="z-[65]"
        >
          <TooltipPrimitive.Popup className="bui-tooltip-popup">
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ==========================================================================
   CollapsiblePanel — Base UI Collapsible Disclosure
   ========================================================================== */

export interface CollapsiblePanelProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
}

export function CollapsiblePanel({
  trigger,
  children,
  defaultOpen = false,
  className,
  triggerClassName,
  panelClassName,
}: CollapsiblePanelProps) {
  return (
    <CollapsiblePrimitive.Root defaultOpen={defaultOpen} className={className}>
      <CollapsiblePrimitive.Trigger
        className={cn(
          'group inline-flex items-center gap-1.5 text-[12px] font-medium select-none cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded-[4px]',
          triggerClassName,
        )}
        style={{ color: 'var(--accent)' }}
      >
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-data-[panel-open]:rotate-90"
          aria-hidden="true"
        />
        {trigger}
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel className={cn('bui-collapsible-panel', panelClassName)}>
        {children}
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
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
  const prefersReducedMotion = Boolean(useReducedMotion());
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
    <div className={cn('space-y-1', className)}>
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
          className="relative shrink-0"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied ? 'copied' : 'copy'}
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.92, filter: 'blur(2px)' }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, filter: 'blur(0px)' }
              }
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.92, filter: 'blur(2px)' }
              }
              transition={
                prefersReducedMotion ? { duration: 0.01 } : { duration: 0.14, ease: EASE_CALM }
              }
              className="inline-flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--signal-ok)' }}
                    aria-hidden="true"
                  />
                  <span style={{ color: 'var(--signal-ok)' }}>已复制</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>复制</span>
                </>
              )}
            </motion.span>
          </AnimatePresence>
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
      className={cn(
        'inline-flex items-center justify-center rounded-[4px] px-1.5 py-0.5 font-mono-tabular text-[11px] font-medium leading-none select-none',
        className,
      )}
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
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
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
