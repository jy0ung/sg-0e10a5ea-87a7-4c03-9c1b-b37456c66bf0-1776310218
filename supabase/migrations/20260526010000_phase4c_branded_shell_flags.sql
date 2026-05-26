-- Phase 4c: Branded shell flag + Phase 4d offline flag
--
-- Two additional Phase 4 feature flags. The branded-shell flag gates the
-- runtime application of company_branding.accent_color, app_name (document
-- title), and favicon_path to the browser shell. The pwa-offline flag
-- gates the service-worker offline fallback for unauthenticated routes.
--
-- Both default off in production; companies opt-in via the existing
-- feature_flags table.

INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES
  (NULL, 'phase4.branded-shell', false,
    'Apply company_branding (accent color, app name, favicon) to the runtime shell.'),
  (NULL, 'phase4.pwa-offline', false,
    'PWA offline fallback (public/offline.html) for unauthenticated routes.')
ON CONFLICT (code) WHERE company_id IS NULL DO NOTHING;
