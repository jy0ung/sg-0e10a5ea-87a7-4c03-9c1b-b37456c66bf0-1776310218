-- Phase 5: Enable Supabase Realtime on key tables.
-- REPLICA IDENTITY FULL lets the CDC stream include old row data on UPDATE/DELETE.

ALTER TABLE public.vehicles       REPLICA IDENTITY FULL;
ALTER TABLE public.sales_orders   REPLICA IDENTITY FULL;
ALTER TABLE public.notifications  REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication (created by supabase platform).
-- IF NOT EXISTS guard is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sales_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
