-- ============================================
-- FIX: mark_request_executed ambiguous status
-- Safe to run multiple times
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_request_executed(p_request_id UUID)
RETURNS TABLE (
  id UUID,
  status TEXT,
  executed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_status TEXT;
  v_has_selected BOOLEAN;
  v_selected_pharmacy_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Bypass RLS inside the function; enforce checks explicitly
  PERFORM set_config('row_security', 'off', true);

  SELECT pr.status
    INTO v_request_status
  FROM public.patient_requests pr
  WHERE pr.id = p_request_id;

  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request_status <> 'accepted' THEN
    RAISE EXCEPTION 'Request not in accepted state';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_requests'
      AND column_name = 'selected_pharmacy_id'
  ) INTO v_has_selected;

  IF v_has_selected THEN
    EXECUTE 'SELECT pr.selected_pharmacy_id FROM public.patient_requests pr WHERE pr.id = $1'
      INTO v_selected_pharmacy_id
      USING p_request_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patient_request_recipients prr
    JOIN public.pharmacies p ON p.id = prr.pharmacy_id
    WHERE prr.request_id = p_request_id
      AND prr.status = 'accepted'
      AND p.owner_id = auth.uid()
      AND (v_selected_pharmacy_id IS NULL OR v_selected_pharmacy_id = p.id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to execute this request';
  END IF;

  UPDATE public.patient_requests AS pr
  SET status = 'executed',
      executed_at = now(),
      updated_at = now()
  WHERE pr.id = p_request_id
  RETURNING pr.id, pr.status, pr.executed_at
  INTO id, status, executed_at;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_request_executed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_request_executed(UUID) TO authenticated;

COMMIT;

-- ============================================
-- END OF FIX
-- ============================================
