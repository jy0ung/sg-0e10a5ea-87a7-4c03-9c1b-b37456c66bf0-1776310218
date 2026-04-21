-- Auto-Aging v2: new Excel template support
--
-- Adds five fields to `public.vehicles` that come directly from the new
-- "auto aging (CHASSIS)" template, plus a derived pipeline `stage` that
-- drives dashboards and list filters.
--
--   • color                — vehicle colour (optional text)
--   • commission_paid      — derived from the "COMM PAYOUT..." column.
--                            NULL = unknown, FALSE = "comm not paid",
--                            TRUE  = payout processed.
--   • commission_remark    — free-text captured alongside the flag
--                            (e.g. original remark from the sheet)
--   • commission_paid_at   — reserved for when finance confirms payout date;
--                            not populated by the importer today but lands
--                            the column so downstream UX can evolve without
--                            another migration.
--   • stage                — derived pipeline stage; one of the three
--                            category sections in the new template.
--   • stage_override       — optional manual override so users can pin a
--                            row to a stage when date state is inconclusive.
--
-- A BEFORE INSERT/UPDATE trigger keeps `stage` in sync with the date
-- milestones and override. The logic mirrors `src/utils/vehicleStage.ts`:
--   • override wins when set
--   • no reg_date and no reg_no -> pending_register_free_stock
--   • reg present but delivery_date or disb_date missing -> pending_deliver_loan_disburse
--   • all three present -> complete

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN,
  ADD COLUMN IF NOT EXISTS commission_remark TEXT,
  ADD COLUMN IF NOT EXISTS commission_paid_at DATE,
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS stage_override TEXT;

-- Enforce the stage enum via CHECK constraints (easier to evolve than
-- a pg enum type and cheap given the small cardinality).
DO $$ BEGIN
  ALTER TABLE public.vehicles
    ADD CONSTRAINT vehicles_stage_check
    CHECK (
      stage IS NULL OR stage IN (
        'pending_register_free_stock',
        'pending_deliver_loan_disburse',
        'complete'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicles
    ADD CONSTRAINT vehicles_stage_override_check
    CHECK (
      stage_override IS NULL OR stage_override IN (
        'pending_register_free_stock',
        'pending_deliver_loan_disburse',
        'complete'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Stage is queried frequently per company for dashboard pipeline donuts.
CREATE INDEX IF NOT EXISTS vehicles_company_stage_idx
  ON public.vehicles (company_id, stage);

-- Keep `stage` consistent with the source-of-truth dates + override.
CREATE OR REPLACE FUNCTION public.recompute_vehicle_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_override IS NOT NULL THEN
    NEW.stage := NEW.stage_override;
  ELSIF (NEW.reg_date IS NULL AND (NEW.reg_no IS NULL OR NEW.reg_no = '')) THEN
    NEW.stage := 'pending_register_free_stock';
  ELSIF NEW.delivery_date IS NOT NULL AND NEW.disb_date IS NOT NULL THEN
    NEW.stage := 'complete';
  ELSE
    NEW.stage := 'pending_deliver_loan_disburse';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_recompute_stage ON public.vehicles;
CREATE TRIGGER vehicles_recompute_stage
  BEFORE INSERT OR UPDATE OF reg_date, reg_no, delivery_date, disb_date, stage_override
  ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_vehicle_stage();

-- Backfill stage for existing rows so the dashboard pipeline has data the
-- moment this migration ships. A plain UPDATE fires the trigger for us.
UPDATE public.vehicles SET updated_at = updated_at WHERE stage IS NULL;
