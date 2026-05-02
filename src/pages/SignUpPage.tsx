import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { updateOwnProfileName } from '@/services/profileService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';
import { inviteSignupSchema, type InviteSignupFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [email, setEmail] = useState('');

  const form = useForm<InviteSignupFormData>({
    resolver: zodResolver(inviteSignupSchema),
    mode: 'onChange',
    defaultValues: { name: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    let isMounted = true;

    const getCallbackParams = () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const searchParams = new URLSearchParams(window.location.search);

      return {
        type: hashParams.get('type') || searchParams.get('type'),
        accessToken: hashParams.get('access_token') || searchParams.get('access_token'),
        refreshToken: hashParams.get('refresh_token') || searchParams.get('refresh_token'),
        tokenHash: hashParams.get('token_hash') || searchParams.get('token_hash'),
        code: hashParams.get('code') || searchParams.get('code'),
      };
    };

    const initializeInvite = async () => {
      const { type, accessToken, refreshToken, tokenHash, code } = getCallbackParams();
      const isInviteCallback =
        (type === 'invite' || type === 'signup' || type === 'magiclink') &&
        !!(accessToken || tokenHash || code);

      if (!isInviteCallback) {
        // No tokens in URL — check if Supabase already auto-processed them
        // and established a session (the client consumes hash tokens on load)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Session exists — the user was invited and tokens were auto-consumed.
          // They still need to set their password.
          if (isMounted) {
            setEmail(session.user.email || '');
            const metaName = session.user.user_metadata?.name || '';
            if (metaName) {
              form.setValue('name', metaName, { shouldValidate: true });
            }
            setIsInvite(true);
            setInitializing(false);
          }
          return;
        }

        if (isMounted) {
          setError('Invalid or expired invitation link. Please ask your administrator to resend the invitation.');
          setInitializing(false);
        }
        return;
      }

      // Exchange code for session (PKCE flow)
      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
        if (codeError && isMounted) {
          setError('Invalid or expired invitation link. Please ask your administrator to resend the invitation.');
          setInitializing(false);
          return;
        }
      }

      // Set session from tokens (implicit flow)
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError && isMounted) {
          setError('Invalid or expired invitation link. Please ask your administrator to resend the invitation.');
          setInitializing(false);
          return;
        }
      }

      // Get the current user to pre-fill name
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isMounted) {
        setEmail(user.email || '');
        const metaName = user.user_metadata?.name || '';
        if (metaName) {
          form.setValue('name', metaName, { shouldValidate: true });
        }
        setIsInvite(true);
        setInitializing(false);
      } else if (isMounted) {
        setError('Could not verify your invitation. Please ask your administrator to resend it.');
        setInitializing(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && isMounted) {
        // When the invite token is processed, we get a SIGNED_IN event
        // The user still needs to set their password
      }
    });

    void initializeInvite();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (data: InviteSignupFormData) => {
    setError('');
    setLoading(true);

    // Update password and user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      password: data.password,
      data: { name: data.name },
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Update the profile name
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Your password was saved, but we could not verify your session to finish account setup. Please sign in and contact an administrator if your profile name is still incorrect.');
      setLoading(false);
      return;
    }

    const { error: profileError } = await updateOwnProfileName(user.id, data.name);

    if (profileError) {
      setError(`Your password was saved, but we could not update your profile name: ${profileError.message}`);
      setLoading(false);
      return;
    }

    // Sign out so they log in fresh
    await supabase.auth.signOut();
    setLoading(false);
    setSuccess(true);
    setTimeout(() => navigate('/login', { replace: true }), 2500);
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying your invitation...</p>
        </div>
      </div>
    );
  }

  if (!isInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center executive-gradient">
        <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center space-y-4">
          <p className="text-muted-foreground">{error || 'Invalid or expired invitation link.'}</p>
          <Button onClick={() => navigate('/login')}>Go to Sign In</Button>
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
            <h1 className="text-2xl font-bold text-foreground">Fook Loi Group UBS</h1>
          </div>
          <p className="text-muted-foreground text-sm">Complete your account setup</p>
        </div>

        {success ? (
          <div className="text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="text-primary text-sm font-medium">Account set up successfully!</p>
            <p className="text-muted-foreground text-xs">Redirecting to sign in...</p>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {email && (
              <div className="p-3 rounded-lg bg-secondary/50 text-sm">
                <span className="text-muted-foreground">Signing up as </span>
                <span className="text-foreground font-medium">{email}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Full Name</Label>
              <Input
                id="name"
                type="text"
                {...form.register('name')}
                className={form.formState.errors.name ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter your full name"
              />
              {form.formState.errors.name && (
                <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register('password')}
                className={form.formState.errors.password ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Create a password"
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
                placeholder="Confirm your password"
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-destructive text-xs">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading || !form.formState.isValid}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Setting up account...</>
              ) : (
                'Complete Sign Up'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
