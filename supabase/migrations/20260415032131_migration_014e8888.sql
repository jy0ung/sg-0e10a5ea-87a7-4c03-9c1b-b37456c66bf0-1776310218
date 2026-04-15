-- Create column_permissions table
CREATE TABLE column_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL DEFAULT 'vehicles',
  column_name TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('none', 'view', 'edit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, table_name, column_name)
);

-- Enable RLS on column_permissions
ALTER TABLE column_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for column_permissions
CREATE POLICY "admin_full_access" ON column_permissions FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "user_own_permissions" ON column_permissions FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'director', 'general_manager')
  ));

CREATE POLICY "admin_manage_permissions" ON column_permissions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "admin_update_permissions" ON column_permissions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "admin_delete_permissions" ON column_permissions FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Create audit_logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  changes JSONB NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  table_name TEXT,
  column_name TEXT
);

-- Create indexes for audit_logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for audit_logs
CREATE POLICY "view_own_logs" ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admin_view_all_logs" ON audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'company_admin', 'director', 'general_manager')
  ));

-- Update profiles table with permission flags
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_edit_vehicles BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_bulk_edit_vehicles BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_vehicle_details BOOLEAN DEFAULT true;

-- Add updated_at trigger for column_permissions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_column_permissions_updated_at
  BEFORE UPDATE ON column_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();