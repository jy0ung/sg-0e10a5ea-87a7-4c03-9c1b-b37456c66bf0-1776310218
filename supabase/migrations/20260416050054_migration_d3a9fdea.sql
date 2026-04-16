-- Add INSERT policy for audit_logs table to allow authenticated users to log actions
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow any authenticated user to insert audit logs
CREATE POLICY "allow_authenticated_insert" ON audit_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Policy to allow authenticated users to view audit logs
CREATE POLICY "allow_authenticated_select" ON audit_logs 
FOR SELECT 
TO authenticated 
USING (true);