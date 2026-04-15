CREATE TABLE application_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL,
  message text NOT NULL,
  context jsonb,
  user_id uuid REFERENCES auth.users(id),
  component text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE application_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_logs" ON application_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "admin_view_logs" ON application_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('super_admin', 'company_admin')
  )
);

CREATE INDEX idx_application_logs_level ON application_logs(level);
CREATE INDEX idx_application_logs_created_at ON application_logs(created_at DESC);
CREATE INDEX idx_application_logs_component ON application_logs(component);