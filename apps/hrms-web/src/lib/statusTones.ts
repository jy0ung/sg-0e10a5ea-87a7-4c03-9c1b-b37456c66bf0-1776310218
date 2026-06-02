/**
 * Centralized status / badge tone classes for the HRMS workspace.
 *
 * Retires duplicated colour maps scattered across HRMS pages. New code should
 * import toneClass(tone) instead of hand-writing bg/text colour pairs.
 */
export type Tone = 'amber' | 'red' | 'blue' | 'emerald' | 'violet' | 'slate' | 'muted';

export const TONE_CLASSES: Record<Tone, string> = {
  amber:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  red:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  blue:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  violet:  'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  slate:   'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  muted:   'bg-muted text-muted-foreground',
};

export function toneClass(tone: Tone = 'muted'): string {
  return TONE_CLASSES[tone];
}
