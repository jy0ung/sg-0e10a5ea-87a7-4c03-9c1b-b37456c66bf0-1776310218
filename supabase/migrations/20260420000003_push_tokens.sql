-- ============================================================
-- push_tokens: stores device push notification tokens per user
-- One row per (user_id, platform) pair — upserted on each login.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token       text        NOT NULL,
  platform    text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Enforce one active token per user per platform
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_platform_key
  ON public.push_tokens (user_id, platform);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx
  ON public.push_tokens (user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can upsert/read their own tokens
CREATE POLICY "Users can manage own push tokens"
  ON public.push_tokens
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (Edge Functions) can read all tokens for dispatch
CREATE POLICY "Service role can read push tokens"
  ON public.push_tokens
  FOR SELECT
  USING (auth.role() = 'service_role');
