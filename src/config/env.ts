import { z } from 'zod';

/**
 * Runtime-validated environment variables.
 *
 * Validation runs once at module load. If any required var is missing or
 * malformed the app aborts early with a clear, aggregated error — we refuse
 * to ship a half-configured bundle into production.
 *
 * Only add variables here that are safe to expose in the client bundle
 * (prefixed with `VITE_`). Server-only secrets live in the Supabase project
 * dashboard or CI secret store and must never be referenced from this file.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY looks too short to be a real key'),
  VITE_SUPABASE_PROJECT_ID: z.string().optional(),
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  VITE_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  VITE_APP_ENV: z
    .enum(['development', 'staging', 'uat', 'production'])
    .default('development'),
  VITE_APP_URL: z.string().url().optional(),
  VITE_HRMS_APP_URL: z.string().url().optional(),
  VITE_APP_VERSION: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

function parseEnv(): AppEnv {
  const raw = {
    VITE_SUPABASE_URL:
      import.meta.env.VITE_SUPABASE_URL ??
      import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY:
      import.meta.env.VITE_SUPABASE_ANON_KEY ??
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
    VITE_SENTRY_TRACES_SAMPLE_RATE: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || undefined,
    VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
    VITE_HRMS_APP_URL: import.meta.env.VITE_HRMS_APP_URL || undefined,
    VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION || undefined,
  };

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    const message =
      'Invalid environment configuration.\n' +
      issues +
      '\n\nCopy .env.example to .env.local and fill in the required values.';
    console.error(message);
    throw new Error(message);
  }
  return result.data;
}

export const env: AppEnv = parseEnv();

export const isProduction = env.VITE_APP_ENV === 'production';
export const isStaging = env.VITE_APP_ENV === 'staging';
export const isDevelopment = env.VITE_APP_ENV === 'development';
