import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { loginSchema, type LoginFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = (location.state as { from?: Pick<Location, 'pathname' | 'search'> })?.from;
  const from = destination
    ? `${destination.pathname}${destination.search ?? ''}`
    : '/';
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
  });

  // Redirect if already authenticated — honour the intended destination
  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleLoginSubmit = async (data: LoginFormData) => {
    setError('');
    setSubmitting(true);
    const { error: err } = await login(data.email, data.password);
    setSubmitting(false);
    if (err) setError(err);
    else navigate(from, { replace: true });
  };

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
          <p className="text-muted-foreground text-sm">Business Intelligence Platform</p>
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
              <p className="text-destructive text-xs">{loginForm.formState.errors.email.message}</p>
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
              <p className="text-destructive text-xs">{loginForm.formState.errors.password.message}</p>
            )}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" className="w-full" disabled={submitting || !loginForm.formState.isValid}>
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <a href="/forgot-password" className="block text-sm text-muted-foreground hover:text-primary hover:underline">
            Forgot your password?
          </a>
          <p className="text-sm text-muted-foreground">
            Staff accounts are created by an administrator. If you have been invited already, use password reset to set or recover your password.
          </p>
        </div>
      </div>
    </div>
  );
}
