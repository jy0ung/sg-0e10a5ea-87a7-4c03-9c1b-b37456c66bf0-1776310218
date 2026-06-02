import { supabase } from '../shared/supabaseClient';

export interface RunLeaveBalanceRolloverInput {
  companyId: string;
  fromYear: number;
  toYear: number;
  maxCarryDays: number;
}

export async function runLeaveBalanceRollover(input: RunLeaveBalanceRolloverInput): Promise<void> {
  const { error } = await supabase.functions.invoke('rollover-leave-balances', {
    body: {
      company_id: input.companyId,
      from_year: input.fromYear,
      to_year: input.toYear,
      max_carry_days: input.maxCarryDays,
    },
  });
  if (error) throw error;
}
