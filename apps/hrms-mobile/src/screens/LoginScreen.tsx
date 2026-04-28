import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { loginSchema, type LoginFormData } from '@flc/hrms-schemas';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormData) {
    setError(null);
    const { error } = await signIn(data.email, data.password);
    if (error) {
      setError('Invalid email or password');
    } else {
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 safe-top safe-bottom">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <span className="text-3xl">🏢</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">FLC HRMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="mobile-login-email" className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
          <input
            id="mobile-login-email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="you@example.com"
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="mobile-login-password" className="mb-1.5 block text-sm font-medium text-foreground">Password</label>
          <input
            id="mobile-login-password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/20 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
