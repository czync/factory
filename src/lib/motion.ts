/**
 * Calm motion timing tokens (Linear / Vercel precision minimalism)
 * plus modern-web-guidance top-layer <dialog> exit detection & fallback
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

/* ==========================================================================
   Modern Web Guidance: Top-layer exit capability probe (Firefox/Safari fallback)
   ========================================================================== */

let cachedSupportsDisplayTransition: boolean | undefined;

export function canTransitionDisplay(): boolean {
  if (cachedSupportsDisplayTransition !== undefined) {
    return cachedSupportsDisplayTransition;
  }
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedSupportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedSupportsDisplayTransition;
}

export function supportsTopLayerExit(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

export async function closeDialogWithFallback(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => window.setTimeout(resolve, DURATION_OVERLAY_MS + 90)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  if (dialog.open) {
    dialog.close();
  }
}
