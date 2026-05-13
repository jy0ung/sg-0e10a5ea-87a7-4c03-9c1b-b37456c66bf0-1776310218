import { describe, expect, it } from 'vitest';
import i18n from './index';

describe('i18n scaffold', () => {
  it('boots with the seeded English bundle', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.language).toBe('en');
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.t('nav.reports')).toBe('Reports');
    expect(i18n.t('auth.signIn')).toBe('Sign in');
  });
});
