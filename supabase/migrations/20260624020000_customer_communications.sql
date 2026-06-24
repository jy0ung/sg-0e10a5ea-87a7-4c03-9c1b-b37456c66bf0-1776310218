-- Migration: Customer communication log table
-- Tracks all customer touchpoints (calls, emails, visits, messages)

CREATE TABLE IF NOT EXISTS customer_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'visit', 'message', 'meeting', 'note')),
  subject TEXT,
  body TEXT,
  contact_person TEXT,
  communication_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_comms_customer ON customer_communications(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_comms_company ON customer_communications(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_comms_date ON customer_communications(communication_date DESC);

-- RLS
ALTER TABLE customer_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_comms_same_company" ON customer_communications
  FOR ALL USING (is_same_company(company_id));
