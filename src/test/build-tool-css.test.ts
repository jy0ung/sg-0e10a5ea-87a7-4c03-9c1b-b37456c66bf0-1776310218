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
});
