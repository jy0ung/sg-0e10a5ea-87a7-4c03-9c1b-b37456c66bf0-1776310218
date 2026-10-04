/** Restore the established sibling spacing contract after Tailwind 4 compilation.
 * v4 moves spacing to the previous child's logical end margin. Existing consumers
 * also set mt/mb/ml/mr and depend on v3's hidden-sibling filtering/specificity.
 * Only the compiler's exact space-x/y rule shape is transformed; other utilities
 * and all application rules remain untouched. Tailwind 4's individual translate also composes twice with the retained
 * animation plugin in WebKit. Move only its exact 2D translate declaration back
 * to a transform so established animation keyframes/centering compose once.
 * No dependency/compiler fork.
 * @returns {import('postcss').Plugin}
 */
export default function appearanceCompatibility() {
  return {
    postcssPlugin: 'flc-established-appearance',
    OnceExit(root) {
      root.walkDecls('translate', declaration => {
        if (declaration.value !== 'var(--tw-translate-x) var(--tw-translate-y)') return;
        declaration.prop = 'transform';
        declaration.value = 'translate(var(--tw-translate-x), var(--tw-translate-y))';
      });
      root.walkRules(rule => {
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
