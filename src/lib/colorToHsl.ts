/**
 * Convert a hex color (e.g. "#6366f1" or "6366f1") into the
 * `H S% L%` triple that Tailwind expects when consuming a CSS variable as
 * `hsl(var(--accent))`. Returns null for invalid input so callers can keep
 * the static default instead of writing garbage.
 */
export function hexToHslChannels(hex: string): string | null {
  if (typeof hex !== 'string') return null;

  const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;

  let value = m[1];
  if (value.length === 3) {
    value = value.split('').map(c => c + c).join('');
  }

  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
