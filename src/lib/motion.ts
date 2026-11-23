/**
 * Calm motion timing tokens (Linear / Vercel precision minimalism)
 * and <meta name="color-scheme"> synchronization helper.
 */

export const EASE_CALM = [0.2, 0, 0, 1] as const;
export const EASE_FAST = [0, 0, 0.2, 1] as const;

export const DURATION_FAST_MS = 110;
export const DURATION_OVERLAY_MS = 170;

export const DURATION_FAST = 0.11;
export const DURATION_OVERLAY = 0.17;

export const TRANSITION_FAST = {
  duration: DURATION_FAST,
  ease: EASE_FAST,
} as const;

export const TRANSITION_OVERLAY = {
  duration: DURATION_OVERLAY,
  ease: EASE_CALM,
} as const;

export const SPRING_TACTILE = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 36,
  mass: 0.7,
} as const;

export const SPRING_INDICATOR = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 34,
} as const;

export const SPRING_CHECK = {
  type: 'spring' as const,
  bounce: 0,
  duration: 0.24,
} as const;

export const TAP_PRESS = {
  scale: 0.975,
} as const;

/**
 * Keeps `<meta name="color-scheme">` and `<html data-theme>` synchronized.
 * Passing `'system'` restores `light dark` and removes `data-theme`.
 */
export function syncColorSchemeMeta(theme: 'light' | 'dark' | 'system'): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
    if (meta) meta.content = 'light dark';
    return;
  }
  document.documentElement.dataset.theme = theme;
  if (meta) meta.content = theme;
}
