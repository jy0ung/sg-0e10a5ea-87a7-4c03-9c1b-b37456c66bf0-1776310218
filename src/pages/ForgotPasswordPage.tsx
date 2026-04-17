import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authService } from '@/services/authService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email },
  });

  const handleSubmit = async (data: ForgotPasswordFormData) => {
    setError('');
    setLoading(true);
    const { error } = await authService.resetPassword(data.email);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
      setEmail(data.email);
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
          <p className="text-muted-foreground text-sm">Reset your password</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-primary text-sm">
              If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
            </p>
            <Link to="/login" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register('email')}
                className={form.formState.errors.email ? 'border-destructive' : 'bg-secondary border-border'}
                placeholder="Enter your email"
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
              )}
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !form.formState.isValid}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending reset link...</>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
