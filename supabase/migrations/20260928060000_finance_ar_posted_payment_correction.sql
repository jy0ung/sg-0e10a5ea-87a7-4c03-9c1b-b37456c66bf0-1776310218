-- Finance correction path for posted AR customer payments.
--
-- Posted journals remain immutable. Reversing a posted payment creates an
-- adjustment journal that exactly mirrors the original posting with debit and
-- credit swapped, then appends the Accounts-owned reversal event in the same
-- transaction. Unposted payment reversal keeps the existing lightweight path.

CREATE OR REPLACE FUNCTION public.guard_posted_ar_payment_reversal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_original_journal_id uuid;
BEGIN
  IF NEW.event_type <> 'reversal' THEN RETURN NEW; END IF;
  IF NEW.reversal_of_event_id IS NULL THEN
    RAISE EXCEPTION 'Reversal must identify its customer payment';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ar-gl:' || NEW.reversal_of_event_id::text, 0)
  );

  SELECT je.id INTO v_original_journal_id
    FROM public.journal_entries je
   WHERE je.source_type = 'ar_payment'
     AND je.source_id = NEW.reversal_of_event_id
   ORDER BY je.created_at
   LIMIT 1;

  IF v_original_journal_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.journal_entries correction
        WHERE correction.source_type = 'adjustment'
          AND correction.source_id = v_original_journal_id
     ) THEN
    RAISE EXCEPTION 'Posted AR payment requires a Finance correction before reversal';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_events prior
     WHERE prior.reversal_of_event_id = NEW.reversal_of_event_id
  ) THEN
    RAISE EXCEPTION 'Customer payment is already reversed';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_posted_ar_payment_reversal()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_payment_event(
  p_event_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id text;
  v_event public.payment_events%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_correction_period_id uuid;
  v_correction_journal_id uuid;
  v_reversal_id uuid;
BEGIN
  -- Posting and correction serialize on the same source-event key.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ar-gl:' || p_event_id::text, 0)
  );

  SELECT pe.* INTO v_event
    FROM public.payment_events pe
   WHERE pe.id = p_event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment event not found';
  END IF;

  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.status = 'active'
     AND p.company_id = v_event.company_id
     AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to reverse customer payments';
  END IF;

  -- Serialize against new settlement events, which lock the same invoice row.
  PERFORM 1
    FROM public.invoices i
   WHERE i.id = v_event.invoice_id
     AND i.company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer payment event not found in your company';
  END IF;

  IF v_event.event_type <> 'payment' THEN
    RAISE EXCEPTION 'Only customer payment events can be reversed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.payment_events reversal
     WHERE reversal.reversal_of_event_id = p_event_id
  ) THEN
    RAISE EXCEPTION 'Customer payment event is already reversed';
  END IF;

  SELECT je.* INTO v_original_journal
    FROM public.journal_entries je
   WHERE je.source_type = 'ar_payment'
     AND je.source_id = v_event.id
   ORDER BY je.created_at
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    -- A posted payment is accounting history. Correction requires explicit
    -- rationale and a currently open period; the original journal is untouched.
    IF NULLIF(pg_catalog.btrim(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to reverse a posted customer payment';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.journal_entries correction
       WHERE correction.source_type = 'adjustment'
         AND correction.source_id = v_original_journal.id
    ) THEN
      RAISE EXCEPTION 'Posted customer payment already has a Finance correction';
    END IF;

    SELECT ap.id INTO v_correction_period_id
      FROM public.accounting_periods ap
     WHERE ap.company_id = v_company_id
       AND ap.status = 'open'
       AND CURRENT_DATE BETWEEN ap.start_date AND ap.end_date
     ORDER BY ap.start_date DESC
     LIMIT 1
     FOR UPDATE;

    IF v_correction_period_id IS NULL THEN
      RAISE EXCEPTION 'No open accounting period covers the correction date';
    END IF;

    INSERT INTO public.journal_entries (
      company_id,
      period_id,
      entry_date,
      description,
      source_type,
      source_id,
      reference_no,
      posted_by
    ) VALUES (
      v_company_id,
      v_correction_period_id,
      CURRENT_DATE,
      'AR Payment Correction: ' ||
        COALESCE(v_event.receipt_reference, v_event.id::text),
      'adjustment',
      v_original_journal.id,
      'REV-' || v_original_journal.id::text,
      v_actor
    )
    RETURNING id INTO v_correction_journal_id;

    -- Reverse the exact accounting effect that was posted, rather than
    -- re-deriving account mappings from current configuration.
    INSERT INTO public.journal_entry_lines (
      journal_entry_id,
      account_id,
      description,
      debit,
      credit
    )
    SELECT
      v_correction_journal_id,
      line.account_id,
      COALESCE(line.description, 'Reversal of posted AR payment'),
      line.credit,
      line.debit
      FROM public.journal_entry_lines line
     WHERE line.journal_entry_id = v_original_journal.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Posted AR journal has no lines to reverse';
    END IF;

    INSERT INTO public.audit_logs (
      user_id, action, entity_type, entity_id, table_name, changes
    ) VALUES (
      v_actor,
      'correct',
      'journal_entry',
      v_correction_journal_id,
      'journal_entries',
      pg_catalog.jsonb_build_object(
        'original_journal_id', v_original_journal.id,
        'payment_event_id', v_event.id,
        'amount', v_event.amount,
        'reason', pg_catalog.btrim(p_reason),
        'period_id', v_correction_period_id
      )
    );
  END IF;

  INSERT INTO public.payment_events (
    company_id,
    invoice_id,
    event_type,
    amount,
    payment_date,
    notes,
    reversal_of_event_id,
    created_by
  ) VALUES (
    v_company_id,
    v_event.invoice_id,
    'reversal',
    v_event.amount,
    CURRENT_DATE,
    CASE
      WHEN v_correction_journal_id IS NULL THEN p_reason
      ELSE pg_catalog.btrim(p_reason) ||
        ' [Finance correction journal ' || v_correction_journal_id::text || ']'
    END,
    p_event_id,
    v_actor
  )
  RETURNING id INTO v_reversal_id;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, table_name, changes
  ) VALUES (
    v_actor,
    'reverse',
    'payment_event',
    v_reversal_id,
    'payment_events',
    pg_catalog.jsonb_build_object(
      'reversal_of_event_id', p_event_id,
      'reason', p_reason,
      'correction_journal_id', v_correction_journal_id
    )
  );

  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payment_event(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment_event(uuid, text)
  TO authenticated;
