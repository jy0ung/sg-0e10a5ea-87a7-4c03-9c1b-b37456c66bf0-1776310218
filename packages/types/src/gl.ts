// ===== General Ledger =====
export type GlAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountingPeriodStatus = 'open' | 'closed' | 'locked';

export type JournalEntrySourceType = 'ar_payment' | 'ap_payment' | 'manual' | 'adjustment';

export interface GlAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: GlAccountType;
  isSystem: boolean;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingPeriod {
  id: string;
  companyId: string;
  name: string;
  periodYear: number;
  periodMonth: number;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  companyId: string;
  periodId: string;
  entryDate: string;
  description: string;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  referenceNo?: string;
  postedBy?: string;
  postedAt: string;
  createdAt: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  debit: number;
  credit: number;
  createdAt: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: GlAccountType;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

export interface CreateAccountingPeriodInput {
  name: string;
  periodYear: number;
  periodMonth: number;
  startDate: string;
  endDate: string;
}

export interface CreateGlAccountInput {
  code: string;
  name: string;
  type: GlAccountType;
  description?: string;
}
