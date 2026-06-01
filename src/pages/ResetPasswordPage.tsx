import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAuthCallbackParams,
  initializePasswordRecovery,
  resetLinkTimeoutMessage,
  subscribeToPasswordRecovery,
  updateRecoveryPassword,
} from '@flc/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BRANDING_DEFAULTS } from '@/services/brandingService';

const brandName = BRANDING_DEFAULTS.appName;
const brandLogo = BRANDING_DEFAULTS.logoUrl ?? '';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    let isMounted = true;

    const initializeRecovery = async () => {
      const result = await initializePasswordRecovery(getAuthCallbackParams(window.location));
      if (!isMounted) return;
      if (result.ok) {
        setIsRecovery(true);
        setError('');
      } else {
        setError(result.error ?? resetLinkTimeoutMessage);
      }
      setInitializing(false);
    };

    const subscription = subscribeToPasswordRecovery(() => {
      if (isMounted) {
        setIsRecovery(true);
        setError('');
        setInitializing(false);
      }
    });

    void initializeRecovery().catch((err) => {
      if (isMounted) {
        setError(err instanceof Error ? err.message : resetLinkTimeoutMessage);
        setInitializing(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (data: ResetPasswordFormData) => {
    setError('');
    setLoading(true);
    const { error } = await updateRecoveryPassword(data.password);
    setLoading(false);

    if (error) {
      setError(error);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center">
          <p className="text-muted-foreground">{error || 'Invalid or expired reset link.'}</p>
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
            <img src={brandLogo} alt={brandName} className="h-11 w-11 rounded-md object-contain" />
            <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
          </div>
          <p className="text-muted-foreground text-sm">Set your new password</p>
        </div>

        {success ? (
          <div className="text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="text-primary text-sm font-medium">Password updated successfully!</p>
            <p className="text-muted-foreground text-xs">Redirecting to sign in...</p>
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
