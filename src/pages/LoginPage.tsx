import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { loginSchema, signupSchema, type LoginFormData, type SignupFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export default function LoginPage() {
  const { login, signup, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange',
  });

  // Redirect if already authenticated
  if (!loading && isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  const handleLoginSubmit = async (data: LoginFormData) => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    const { error: err } = await login(data.email, data.password);
    setSubmitting(false);
    if (err) setError(err);
    else navigate('/', { replace: true });
  };

  const handleSignupSubmit = async (data: SignupFormData) => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    const { error: err } = await signup(data.email, data.password, data.name);
    setSubmitting(false);
    if (err) setError(err);
    else {
      setSuccess('Account created successfully! You are now signed in.');
      navigate('/', { replace: true });
    }
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

        {isSignUp ? (
          <form onSubmit={signupForm.handleSubmit(handleSignupSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Full Name</Label>
              <Input
                id="name"
                {...signupForm.register('name')}
                className={signupForm.formState.errors.name ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter your full name"
              />
              {signupForm.formState.errors.name && (
                <p className="text-destructive text-xs">{signupForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                {...signupForm.register('email')}
                className={signupForm.formState.errors.email ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter your email"
              />
              {signupForm.formState.errors.email && (
                <p className="text-destructive text-xs">{signupForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                {...signupForm.register('password')}
                className={signupForm.formState.errors.password ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter password"
              />
              {signupForm.formState.errors.password && (
                <p className="text-destructive text-xs">{signupForm.formState.errors.password.message}</p>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            {success && <p className="text-primary text-sm">{success}</p>}

            <Button type="submit" className="w-full" disabled={submitting || !signupForm.formState.isValid}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        ) : (
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
        )}

        <div className="mt-6 text-center space-y-2">
          {!isSignUp && (
            <a href="/forgot-password" className="block text-sm text-muted-foreground hover:text-primary hover:underline">
              Forgot your password?
            </a>
          )}
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); loginForm.reset(); signupForm.reset(); }}
            className="text-sm text-primary hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
