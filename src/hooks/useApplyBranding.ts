/**
 * useApplyBranding — applies the resolved company branding to the runtime
 * document: title, favicon, and the `--accent` CSS variable used by the
 * Tailwind theme.
 *
 * Gated by the `phase4.branded-shell` feature flag so the rollout can be
 * paused per-tenant if a brand asset misbehaves. The default-defaults
 * remain in src/index.css when the flag is off.
 */
import { useEffect } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hexToHslChannels } from '@/lib/colorToHsl';

export function useApplyBranding() {
  const { branding } = useBranding();
  const canApplyBranding = useFeatureFlag('phase4.branded-shell', false);

  // Document title
  useEffect(() => {
    if (!canApplyBranding) return;
    if (typeof document === 'undefined') return;
    if (branding.appName) document.title = branding.appName;
  }, [canApplyBranding, branding.appName]);

  // Favicon
  useEffect(() => {
    if (!canApplyBranding) return;
    if (typeof document === 'undefined') return;
    if (!branding.faviconUrl) return;

    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl;
  }, [canApplyBranding, branding.faviconUrl]);

  // Accent color → CSS variable consumed by Tailwind
  useEffect(() => {
    if (!canApplyBranding) return;
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const hsl = branding.accentColor ? hexToHslChannels(branding.accentColor) : null;
    if (hsl) {
      root.style.setProperty('--accent', hsl);
    } else {
      // Remove the inline override so the static stylesheet default wins.
      root.style.removeProperty('--accent');
    }

    // Cleanup on unmount: drop the inline override.
    return () => {
      root.style.removeProperty('--accent');
    };
  }, [canApplyBranding, branding.accentColor]);
}
