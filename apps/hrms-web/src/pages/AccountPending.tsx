import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Shown to authenticated users whose profile is incomplete:
 *   • status === 'pending', or
 *   • company_id is NULL (e.g. created via Supabase Dashboard invite).
 *
 * The session is kept alive so administrators can see and activate the user
 * without forcing them through another password-reset flow. AuthContext
 * redirects here instead of signing them out to prevent a login loop.
 */
export default function AccountPending() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const email = session?.user?.email ?? '';

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center executive-gradient">
      <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center space-y-4">
        <Clock className="h-12 w-12 text-primary mx-auto" />
        <h1 className="text-xl font-semibold text-foreground">Account pending activation</h1>
        {email && (
          <p className="text-muted-foreground text-sm">
            Signed in as <span className="text-foreground font-medium">{email}</span>
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Your account has been created but an administrator still needs to assign
          your company and role. You'll be able to sign in normally once that's
          done — please contact your administrator.
        </p>
        <Button variant="outline" onClick={handleSignOut} className="w-full">
          Sign out
        </Button>
      </div>
    </div>
  );
}
