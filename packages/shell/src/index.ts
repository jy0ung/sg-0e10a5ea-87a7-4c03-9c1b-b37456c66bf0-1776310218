// Barrel for @flc/shell.
//
// Today: pure types + tiny pathname helpers shared by main + hrms-web.
// Tomorrow: JSX shell components will move here once @flc/ui is extracted
// from the shadcn primitives that both apps duplicate today.

export * from './types';
export { isAppShellNavItemActive } from './navUtils';
export { resolveRouteChrome } from './routeChrome';
