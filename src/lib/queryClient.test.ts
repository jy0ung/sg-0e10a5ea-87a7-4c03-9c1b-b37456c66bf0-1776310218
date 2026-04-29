import { describe, expect, it } from 'vitest';
import { APP_QUERY_DEFAULTS, createAppQueryClient } from './queryClient';

describe('createAppQueryClient', () => {
  it('uses the shared application query defaults', () => {
    const client = createAppQueryClient();

    expect(client.getDefaultOptions()).toEqual(APP_QUERY_DEFAULTS);
  });
});