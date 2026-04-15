---
title: Fix Vite Environment Variables
status: todo
priority: urgent
type: bug
tags: [config, reliability]
created_by: softgen
created_at: 2026-04-15T01:05:24Z
position: 1
---

## Notes
The application uses Next.js style `process.env.NEXT_PUBLIC_*` syntax for environment variables in client-side code. Since this is a Vite project, it will crash in production because `process.env` is not automatically polyfilled or available in the browser. 

We need to configure Vite to explicitly expose `NEXT_PUBLIC_` variables and update the client code to use Vite's native `import.meta.env` syntax.

## Checklist
- [ ] Update `vite.config.ts` to include `envPrefix: ["VITE_", "NEXT_PUBLIC_"]` inside `defineConfig`
- [ ] Update `src/integrations/supabase/client.ts` to replace `process.env` with `import.meta.env` (handling both `VITE_` and `NEXT_PUBLIC_` prefixes)
- [ ] Update `src/services/authService.ts` to replace `process?.env` with `import.meta.env` for `VERCEL_URL` and `SITE_URL`