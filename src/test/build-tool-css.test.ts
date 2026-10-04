import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import appearanceCompatibility from '../../styles/postcss-compat.js';

// Compile the real entry points and source directories, including production
// optimization. This caught a spacing regression absent from the dev output.
describe.each(['src/index.css', 'apps/hrms-web/src/index.css', 'apps/hrms-mobile/src/index.css'])('%s build compatibility', entry => {
  it.each([false, true])('retains shared-source styles, sibling margins and single animation translation (minified=%s)', async minified => {
    const from = path.resolve(entry);
    const css = await readFile(from, 'utf8');
    const output = await postcss([
      tailwind({ optimize: { minify: minified } }),
      appearanceCompatibility(), autoprefixer(),
    ]).process(css, { from });
    const parsed = postcss.parse(output.css);
    let nested = false;
    parsed.walkRules(rule => { if (rule.parent?.type === 'rule') nested = true; });
    expect(nested).toBe(false); // Optimizer targets the approved browser floor in dev too.
    const spacing: postcss.Rule[] = [];
    parsed.walkRules(rule => { if (rule.selector === '.space-y-4 > :not([hidden]) ~ :not([hidden])') spacing.push(rule); });
    expect(spacing).toHaveLength(1);
    const margins: string[] = [];
    spacing[0].walkDecls(declaration => { if (declaration.prop.startsWith('margin-')) margins.push(declaration.prop); });
    expect(margins.sort()).toEqual(['margin-bottom', 'margin-top']);
    // The shared modal's existing class string must be discovered from packages,
    // and its translation must compose once with the retained animation plugin.
    const dialogRules: postcss.Rule[] = [];
    parsed.walkRules(rule => { if (rule.selector.includes('translate-x-\\[') && rule.selector.includes('50')) dialogRules.push(rule); });
    expect(dialogRules.length).toBeGreaterThan(0);
    let translated = false;
    for (const rule of dialogRules) rule.walkDecls(declaration => {
      expect(declaration.prop).not.toBe('translate');
      if (declaration.prop === 'transform') translated = declaration.value.includes('translate(var(--tw-translate-x)');
    });
    expect(translated).toBe(true);
    expect(output.css.includes('data-\\[state\\=active\\]\\:bg-background')).toBe(true);
    expect(output.css).toContain('--primary');
    expect(output.css.includes('@keyframes enter')).toBe(!entry.includes('hrms-mobile'));
  }, 30_000);

  it.each([false, true])('keeps the established shared transform order without individual rotation/scale (minified=%s)', async minified => {
    const from = path.resolve(entry);
    const css = await readFile(from, 'utf8');
    const output = await postcss([tailwind({ optimize: { minify: minified } }), appearanceCompatibility(), autoprefixer()]).process(css, { from });
    const parsed = postcss.parse(output.css);
    const transforms = new Map<string, string>();
    parsed.walkRules(rule => {
      if (['.rotate-90', '.scale-100', '.-translate-x-1\\/2', '.transform'].includes(rule.selector)) {
        rule.walkDecls(declaration => {
          expect(['translate', 'rotate', 'scale']).not.toContain(declaration.prop);
          if (declaration.prop === 'transform') transforms.set(rule.selector, declaration.value);
        });
      }
    });
    // Mobile intentionally omits unrelated root ThemeToggle sources (scale-100).
    expect(transforms.size).toBe(entry.includes('hrms-mobile') ? 3 : 4);
    expect(transforms.has('.scale-100')).toBe(!entry.includes('hrms-mobile'));
    expect(new Set(transforms.values()).size).toBe(1); // Every utility must compose the others.
    const combined = [...transforms.values()][0];
    expect(combined.indexOf('translate(')).toBeLessThan(combined.indexOf('--tw-rotate-z'));
    expect(combined.indexOf('--tw-rotate-z')).toBeLessThan(combined.indexOf('scale('));
    // Application transforms/keyframes and new 3D declarations are outside this rewrite.
    const application = await postcss([appearanceCompatibility()]).process('.custom { transform: translateX(13px) rotate(7deg); rotate: 7deg; scale: 2; } .axis { rotate: x 45deg; }', { from: undefined });
    expect(application.css).toBe('.custom { transform: translateX(13px) rotate(7deg); rotate: 7deg; scale: 2; } .axis { rotate: x 45deg; }');
  }, 30_000);
});
