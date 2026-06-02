import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BRANDING_DEFAULTS } from '@flc/platform-services';

const brandName = BRANDING_DEFAULTS.appName;
const brandLogo = BRANDING_DEFAULTS.logoUrl ?? '';
import { resolveAuthVerifyRedirect } from '@/lib/authVerifyRedirect';

export default function AuthVerifyPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    resolveAuthVerifyRedirect(window.location.href)
      .then((redirectTo) => {
        if (!cancelled) window.location.replace(redirectTo);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to verify this email link. Request a new link and try again.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center executive-gradient">
      <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in text-center space-y-4">
        <div className="inline-flex items-center gap-2">
          <img src={brandLogo} alt={brandName} className="h-11 w-11 rounded-md object-contain" />
          <h1 className="text-2xl font-bold text-foreground">{brandName}</h1>
        </div>
        {error ? (
          <>
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button onClick={() => window.location.replace('/login')}>Back to Sign In</Button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground text-sm">Verifying email link...</p>
          </>
        )}
      </div>
    </div>
  );
}
