import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (data: ResetPasswordFormData) => {
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: data.password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center">
          <p className="text-muted-foreground">Invalid or expired reset link.</p>
          <Button className="mt-4" onClick={() => navigate('/login')}>
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center executive-gradient">
      <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">F</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">FLC BI</h1>
          </div>
          <p className="text-muted-foreground text-sm">Set your new password</p>
        </div>

        {success ? (
          <div className="text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="text-primary text-sm font-medium">Password updated successfully!</p>
            <p className="text-muted-foreground text-xs">Redirecting to dashboard...</p>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">New Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register('password')}
                className={form.formState.errors.password ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter new password"
              />
              {form.formState.errors.password && (
                <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-foreground">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                {...form.register('confirmPassword')}
                className={form.formState.errors.confirmPassword ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Confirm new password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-destructive text-xs">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !form.formState.isValid}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating password...</>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
