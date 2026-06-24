-- Migration: Scheduled report delivery infrastructure
-- Stores user preferences for recurring report generation + delivery

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id),
  report_id TEXT NOT NULL,          -- matches ReportConfig.id (e.g. 'stock', 'vehicle-lifecycle')
  report_label TEXT NOT NULL,       -- human-readable name
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER,              -- 0=Sun, 1=Mon, ... 6=Sat (for weekly)
  day_of_month INTEGER,             -- 1-28 (for monthly)
  time_of_day TIME NOT NULL DEFAULT '09:00',
  date_range TEXT NOT NULL DEFAULT 'last_30_days' CHECK (date_range IN ('last_7_days', 'last_30_days', 'last_month', 'current_month')),
  recipients TEXT[] NOT NULL DEFAULT '{}',  -- email addresses
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,             -- 'success', 'failed', 'pending'
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_company ON scheduled_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active) WHERE is_active = true;

ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_reports_same_company" ON scheduled_reports
  FOR ALL USING (is_same_company(company_id));
