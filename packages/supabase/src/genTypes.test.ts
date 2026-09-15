import { describe, expect, it } from 'vitest';
import { applyNullableRpcArgs, discoverEnums } from '../../../scripts/gen-types';

const create = {
  path: '001.sql',
  content: "CREATE TABLE public.tickets (category text CHECK (category IN ('support', 'other')));",
};

describe('migration enum discovery', () => {
  it('removes a dropped category constraint instead of restricting configurable categories', () => {
    expect(discoverEnums([create, {
      path: '002.sql',
      content: 'ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_category_check;',
    }])).toEqual([]);
  });

  it('uses the replacement constraint after a drop and add', () => {
    const result = discoverEnums([create, {
      path: '002.sql',
      content: `ALTER TABLE public.tickets DROP CONSTRAINT tickets_category_check;
        ALTER TABLE public.tickets ADD CONSTRAINT tickets_category_check
          CHECK (category IN ('finance', 'operations'));`,
    }]);
    expect(result).toHaveLength(1);
    expect(result[0].values).toEqual(['finance', 'operations']);
  });

  it('respects explicitly named constraints and later drops in the same migration', () => {
    expect(discoverEnums([{
      path: '001.sql',
      content: `CREATE TABLE public.tickets (category text);
        ALTER TABLE public.tickets ADD CONSTRAINT configurable_category CHECK (category IN ('support'));
        ALTER TABLE public.tickets DROP CONSTRAINT configurable_category;`,
    }])).toEqual([]);
  });

  it('does not remove another table constraint with the same name', () => {
    const result = discoverEnums([create, {
      path: '002.sql',
      content: 'ALTER TABLE public.archived_tickets DROP CONSTRAINT tickets_category_check;',
    }]);
    expect(result[0].values).toEqual(['support', 'other']);
  });
});

describe('nullable RPC arguments', () => {
  it('updates every overload and is idempotent', () => {
    const input = `    Functions: {
      generate_deal_no:
        | { Args: { p_branch_id: string }; Returns: string }
        | { Args: { p_branch_id?: string }; Returns: string }
      other_rpc: { Args: { p_branch_id: string }; Returns: string }
    }
    Enums: {}`;
    const overrides = { generate_deal_no: ['p_branch_id'] };
    const output = applyNullableRpcArgs(input, overrides);
    expect(output).toContain('p_branch_id: string | null');
    expect(output).toContain('p_branch_id?: string | null');
    expect(output).toContain('other_rpc: { Args: { p_branch_id: string }');
    expect(applyNullableRpcArgs(output, overrides)).toBe(output);
  });

  it('fails loudly when the generated RPC signature has drifted', () => {
    expect(() => applyNullableRpcArgs('    Functions: {}', { missing: ['p_id'] })).toThrow('Missing RPC');
  });
});
