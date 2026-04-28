import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Briefcase, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema, type LoginFormData } from '@/lib/validations';

function friendlyAuthError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return 'Incorrect email or password. Please check your details and try again.';
  }
  if (message.includes('email not confirmed')) {
    return 'Your email address has not been verified. Please check your inbox for a confirmation link.';
  }
  if (message.includes('too many requests') || message.includes('rate limit')) {
    return 'Too many login attempts. Please wait a few minutes before trying again.';
  }
  if (message.includes('user not found')) return 'No account found with that email address.';
  if (message.includes('network') || message.includes('fetch')) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }
  return raw;
}

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = (location.state as { from?: Pick<Location, 'pathname' | 'search'> })?.from;
  const from = destination ? `${destination.pathname}${destination.search ?? ''}` : '/';
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
  });

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleLoginSubmit = async (data: LoginFormData) => {
    setError('');
    setSubmitting(true);
    const { error: authError } = await login(data.email, data.password);
    setSubmitting(false);
    if (authError) setError(friendlyAuthError(authError));
    else navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-8 text-card-foreground shadow-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Briefcase className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">FLC HRMS</h1>
          </div>
          <p className="text-sm text-muted-foreground">Human resources workspace</p>
        </div>

        <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              {...loginForm.register('email')}
              className={loginForm.formState.errors.email ? 'border-destructive' : 'bg-secondary border-border'}
              placeholder="Enter your email"
            />
            {loginForm.formState.errors.email && (
              <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              {...loginForm.register('password')}
              className={loginForm.formState.errors.password ? 'border-destructive' : 'bg-secondary border-border'}
              placeholder="Enter password"
            />
            {loginForm.formState.errors.password && (
              <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting || !loginForm.formState.isValid}>
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-center">
          <Link to="/forgot-password" className="block text-sm text-muted-foreground hover:text-primary hover:underline">
            Forgot your password?
          </Link>
          <p className="text-sm text-muted-foreground">
            Received an invitation?{' '}
            <Link to="/signup" className="text-primary hover:underline">Complete your sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}