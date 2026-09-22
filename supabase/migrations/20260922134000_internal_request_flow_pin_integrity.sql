-- Internal Request Approval Flow pin integrity.
--
-- Category/subcategory pins must stay within the same company and must point
-- to an Internal Request Approval Flow. Active state remains a lifecycle
-- concern: an admin may deactivate a pinned flow, but runtime resolution will
-- then reject the configuration until the pin is corrected.

CREATE OR REPLACE FUNCTION public.enforce_internal_request_approval_flow_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  flow_company_id text;
  flow_entity_type text;
BEGIN
  IF NEW.approval_flow_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT f.company_id, f.entity_type
    INTO flow_company_id, flow_entity_type
    FROM public.approval_flows f
   WHERE f.id = NEW.approval_flow_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pinned Approval Flow % does not exist', NEW.approval_flow_id
      USING ERRCODE = '23503';
  END IF;

  IF flow_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Pinned Approval Flow must belong to the same company'
      USING ERRCODE = '23514';
  END IF;

  IF flow_entity_type IS DISTINCT FROM 'internal_request' THEN
    RAISE EXCEPTION 'Request category/subcategory pins must target an Internal Request Approval Flow'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_request_category_approval_flow_pin_integrity
  ON public.request_categories;

CREATE TRIGGER trg_request_category_approval_flow_pin_integrity
  BEFORE INSERT OR UPDATE OF company_id, approval_flow_id
  ON public.request_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_internal_request_approval_flow_pin();

DROP TRIGGER IF EXISTS trg_request_subcategory_approval_flow_pin_integrity
  ON public.request_subcategories;

CREATE TRIGGER trg_request_subcategory_approval_flow_pin_integrity
  BEFORE INSERT OR UPDATE OF company_id, approval_flow_id
  ON public.request_subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_internal_request_approval_flow_pin();

REVOKE ALL
  ON FUNCTION public.enforce_internal_request_approval_flow_pin()
  FROM PUBLIC, anon;
