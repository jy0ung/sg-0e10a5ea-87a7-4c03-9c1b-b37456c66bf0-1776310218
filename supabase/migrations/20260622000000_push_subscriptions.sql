-- Push notification subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_company ON push_subscriptions(company_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select ON push_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY push_subscriptions_insert ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_delete ON push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
