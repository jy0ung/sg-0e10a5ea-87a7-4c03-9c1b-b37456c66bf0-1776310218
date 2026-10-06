/** Restore the established sibling spacing contract after Tailwind 4 compilation.
 * v4 moves spacing to the previous child's logical end margin. Existing consumers
 * also set mt/mb/ml/mr and depend on v3's hidden-sibling filtering/specificity.
 * Only the compiler's exact space-x/y rule shape is transformed; other utilities
 * and all application rules remain untouched. Restore the established combined
 * transform for compiler-generated 2D translation/rotation/scale. Moving only
 * translate changes its order relative to individual rotate/scale (Carousel)
 * and retaining individual properties applies them again during legacy animation
 * keyframes (WebKit dialogs). Each utility sets its own variable and the same
 * transform, so utility order, variants and animation replacement still compose.
 * No dependency/compiler fork.
 * @returns {import('postcss').Plugin}
 */
export default function appearanceCompatibility() {
  return {
    postcssPlugin: 'flc-established-appearance',
    OnceExit(root) {
      const rotationAndSkew = 'var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, )';
      const combined = `translate(var(--tw-translate-x), var(--tw-translate-y)) ${rotationAndSkew} scale(var(--tw-scale-x, 1), var(--tw-scale-y, 1))`;
      root.walkDecls(declaration => {
        if (declaration.prop === 'translate' && declaration.value === 'var(--tw-translate-x) var(--tw-translate-y)' ||
            declaration.prop === 'scale' && declaration.value === 'var(--tw-scale-x) var(--tw-scale-y)' ||
            declaration.prop === 'transform' && declaration.value.replace(/\s/g, '') === rotationAndSkew.replace(/\s/g, '')) {
          declaration.prop = 'transform';
          declaration.value = combined;
        } else if (declaration.prop === 'rotate' && declaration.parent?.type === 'rule' &&
            declaration.parent.selector.includes('rotate-') &&
            /^(?:-?[\d.]+(?:deg|grad|rad|turn)|(?:calc|var)\(.+\))$/.test(declaration.value)) {
          // The official compiler already registers this non-inherited variable.
          // Keep 3D/axis rotations and arbitrary application transforms untouched.
          declaration.prop = '--tw-rotate-z';
          declaration.value = `rotate(${declaration.value})`;
          declaration.cloneAfter({ prop: 'transform', value: combined });
        }
      });
      root.walkRules(rule => {
        // v4 sorts data-side utilities before data-state animation defaults.
        // The retained plugin's `initial` resets then erase Select's slide offset.
        // Reset only on animated elements, at zero specificity, so explicit
        // fade/zoom/slide variants win independently of compiler rule ordering.
        const animation = rule.nodes?.find(node => node.type === 'decl' && node.prop === 'animation-name' && /^(enter|exit)$/.test(node.value));
        if (animation) {
          const defaults = rule.nodes.filter(node => node.type === 'decl' && /^--tw-(enter|exit)-/.test(node.prop) && node.value === 'initial');
          if (defaults.length) {
            rule.cloneBefore({ selector: `:where(${rule.selector})`, nodes: defaults.map(node => node.clone()) });
            for (const node of defaults) node.remove();
          }
        }
        const axis = rule.selector.includes('space-y-') ? 'y' : rule.selector.includes('space-x-') ? 'x' : null;
        const shape = rule.selector.match(/^:where\((.+?)\s*>\s*:not\(:last-child\)\)$/);
        if (!axis || !shape) return;
        const startProperty = axis === 'y' ? 'margin-block-start' : 'margin-inline-start';
        const endProperty = axis === 'y' ? 'margin-block-end' : 'margin-inline-end';
        const start = rule.nodes.find(node => node.type === 'decl' && node.prop === startProperty);
        const end = rule.nodes.find(node => node.type === 'decl' && node.prop === endProperty);
        if (!start || !end) return;
        rule.selector = `${shape[1].trim()} > :not([hidden]) ~ :not([hidden])`;
        start.prop = axis === 'y' ? 'margin-bottom' : 'margin-right';
        end.prop = axis === 'y' ? 'margin-top' : 'margin-left';
      });
    },
  };
}
