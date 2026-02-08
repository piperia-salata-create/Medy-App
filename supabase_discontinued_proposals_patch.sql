-- ============================================
-- Discontinued Proposals + Association Status Patch
-- Idempotent patch for:
-- 1) product_catalog.created_by
-- 2) pharmacy_inventory.association_status
-- 3) product_discontinued_marks + proposal counters
-- 4) threshold trigger (>= 5 pharmacies)
-- 5) RLS policies
-- ============================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------
-- Helper: pharmacist role check
-- --------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.is_pharmacist(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_pharmacist(user_id UUID DEFAULT auth.uid())
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = $1
            AND p.role = 'pharmacist'
        )
      $body$;
    $fn$;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.is_pharmacist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pharmacist(UUID) TO authenticated, service_role;

-- Ensure access helper exists for policy checks
DO $$
BEGIN
  IF to_regprocedure('public.can_manage_pharmacy_inventory(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.can_manage_pharmacy_inventory(p_pharmacy_id UUID, p_user_id UUID DEFAULT auth.uid())
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        v_is_owner BOOLEAN := false;
        v_is_staff BOOLEAN := false;
      BEGIN
        IF p_pharmacy_id IS NULL OR p_user_id IS NULL THEN
          RETURN false;
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.pharmacies p
          WHERE p.id = p_pharmacy_id
            AND p.owner_id = p_user_id
        )
        INTO v_is_owner;

        IF v_is_owner THEN
          RETURN true;
        END IF;

        IF to_regclass('public.pharmacy_staff') IS NOT NULL THEN
          EXECUTE
            'SELECT EXISTS (
               SELECT 1
               FROM public.pharmacy_staff ps
               WHERE ps.pharmacy_id = $1
                 AND ps.user_id = $2
             )'
          INTO v_is_staff
          USING p_pharmacy_id, p_user_id;
        END IF;

        RETURN COALESCE(v_is_staff, false);
      END;
      $body$;
    $fn$;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.can_manage_pharmacy_inventory(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_pharmacy_inventory(UUID, UUID) TO authenticated, service_role;

-- --------------------------------------------
-- product_catalog: creator + proposal fields
-- --------------------------------------------
ALTER TABLE IF EXISTS public.product_catalog
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE IF EXISTS public.product_catalog
  ADD COLUMN IF NOT EXISTS discontinued_proposed BOOLEAN DEFAULT false;

ALTER TABLE IF EXISTS public.product_catalog
  ADD COLUMN IF NOT EXISTS discontinued_proposed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.product_catalog
  ADD COLUMN IF NOT EXISTS discontinued_mark_count INT DEFAULT 0;

UPDATE public.product_catalog
SET discontinued_proposed = false
WHERE discontinued_proposed IS NULL;

UPDATE public.product_catalog
SET discontinued_mark_count = 0
WHERE discontinued_mark_count IS NULL;

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN discontinued_proposed SET DEFAULT false;

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN discontinued_proposed SET NOT NULL;

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN discontinued_mark_count SET DEFAULT 0;

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN discontinued_mark_count SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.product_catalog') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_catalog'
      AND column_name = 'created_by'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_catalog'::regclass
      AND conname = 'product_catalog_created_by_fkey'
  ) THEN
    ALTER TABLE public.product_catalog
      ADD CONSTRAINT product_catalog_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Requested: partial unique index on barcode
DO $$
BEGIN
  IF to_regclass('public.product_catalog') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'product_catalog'
      AND indexname = 'idx_product_catalog_barcode_unique_nonempty'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.product_catalog pc
      WHERE pc.barcode IS NOT NULL
        AND btrim(pc.barcode) <> ''
      GROUP BY pc.barcode
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipped creating idx_product_catalog_barcode_unique_nonempty because duplicate non-empty barcodes exist.';
    ELSE
      CREATE UNIQUE INDEX idx_product_catalog_barcode_unique_nonempty
        ON public.product_catalog (barcode)
        WHERE barcode IS NOT NULL AND btrim(barcode) <> '';
    END IF;
  END IF;
END $$;

-- --------------------------------------------
-- pharmacy_inventory: local association lifecycle
-- --------------------------------------------
ALTER TABLE IF EXISTS public.pharmacy_inventory
  ADD COLUMN IF NOT EXISTS association_status TEXT DEFAULT 'active';

UPDATE public.pharmacy_inventory
SET association_status = 'active'
WHERE association_status IS NULL OR btrim(association_status) = '';

ALTER TABLE IF EXISTS public.pharmacy_inventory
  ALTER COLUMN association_status SET DEFAULT 'active';

ALTER TABLE IF EXISTS public.pharmacy_inventory
  ALTER COLUMN association_status SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.pharmacy_inventory') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_inventory'::regclass
      AND conname = 'pharmacy_inventory_association_status_check'
  ) THEN
    ALTER TABLE public.pharmacy_inventory
      ADD CONSTRAINT pharmacy_inventory_association_status_check
      CHECK (association_status IN ('active', 'inactive', 'discontinued_local'));
  END IF;
END $$;

-- --------------------------------------------
-- product_discontinued_marks table
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_discontinued_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.product_catalog(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  marked_by UUID NOT NULL DEFAULT auth.uid(),
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_discontinued_marks
  ADD COLUMN IF NOT EXISTS product_id UUID;

ALTER TABLE public.product_discontinued_marks
  ADD COLUMN IF NOT EXISTS pharmacy_id UUID;

ALTER TABLE public.product_discontinued_marks
  ADD COLUMN IF NOT EXISTS marked_by UUID;

ALTER TABLE public.product_discontinued_marks
  ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE public.product_discontinued_marks
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.product_discontinued_marks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.product_discontinued_marks
  ALTER COLUMN marked_by SET DEFAULT auth.uid();

UPDATE public.product_discontinued_marks m
SET marked_by = p.owner_id
FROM public.pharmacies p
WHERE m.marked_by IS NULL
  AND p.id = m.pharmacy_id;

UPDATE public.product_discontinued_marks
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.product_discontinued_marks
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE public.product_discontinued_marks
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.product_discontinued_marks
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.product_discontinued_marks
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.product_discontinued_marks
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_discontinued_marks
    WHERE marked_by IS NULL
  ) THEN
    ALTER TABLE public.product_discontinued_marks
      ALTER COLUMN marked_by SET NOT NULL;
  ELSE
    RAISE NOTICE 'Some rows in product_discontinued_marks still have NULL marked_by; NOT NULL was not enforced.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_discontinued_marks'::regclass
      AND conname = 'product_discontinued_marks_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_discontinued_marks
      ADD CONSTRAINT product_discontinued_marks_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.product_catalog(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_discontinued_marks'::regclass
      AND conname = 'product_discontinued_marks_pharmacy_id_fkey'
  ) THEN
    ALTER TABLE public.product_discontinued_marks
      ADD CONSTRAINT product_discontinued_marks_pharmacy_id_fkey
      FOREIGN KEY (pharmacy_id)
      REFERENCES public.pharmacies(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_discontinued_marks'::regclass
      AND conname = 'product_discontinued_marks_marked_by_fkey'
  ) THEN
    ALTER TABLE public.product_discontinued_marks
      ADD CONSTRAINT product_discontinued_marks_marked_by_fkey
      FOREIGN KEY (marked_by)
      REFERENCES auth.users(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.product_discontinued_marks'::regclass
      AND conname = 'product_discontinued_marks_product_pharmacy_unique'
  ) THEN
    ALTER TABLE public.product_discontinued_marks
      ADD CONSTRAINT product_discontinued_marks_product_pharmacy_unique
      UNIQUE (product_id, pharmacy_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_discontinued_marks_product_id
  ON public.product_discontinued_marks (product_id);

CREATE INDEX IF NOT EXISTS idx_product_discontinued_marks_pharmacy_id
  ON public.product_discontinued_marks (pharmacy_id);

CREATE OR REPLACE FUNCTION public.product_discontinued_marks_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_discontinued_marks_set_updated_at
  ON public.product_discontinued_marks;

CREATE TRIGGER trg_product_discontinued_marks_set_updated_at
BEFORE UPDATE ON public.product_discontinued_marks
FOR EACH ROW
EXECUTE FUNCTION public.product_discontinued_marks_set_updated_at();

-- --------------------------------------------
-- Proposal threshold maintenance (>= 5)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_product_discontinued_proposal(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT m.pharmacy_id)::INT
  INTO v_count
  FROM public.product_discontinued_marks m
  WHERE m.product_id = p_product_id;

  UPDATE public.product_catalog pc
  SET
    discontinued_mark_count = v_count,
    discontinued_proposed = (v_count >= 5),
    discontinued_proposed_at = CASE
      WHEN v_count >= 5 THEN COALESCE(pc.discontinued_proposed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE pc.id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_product_discontinued_proposal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_product_discontinued_proposal(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.product_discontinued_marks_recompute_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_product_discontinued_proposal(NEW.product_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_product_discontinued_proposal(OLD.product_id);
    RETURN OLD;
  ELSE
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      PERFORM public.recompute_product_discontinued_proposal(OLD.product_id);
      PERFORM public.recompute_product_discontinued_proposal(NEW.product_id);
    ELSE
      PERFORM public.recompute_product_discontinued_proposal(NEW.product_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_discontinued_marks_recompute
  ON public.product_discontinued_marks;

CREATE TRIGGER trg_product_discontinued_marks_recompute
AFTER INSERT OR DELETE OR UPDATE OF product_id, pharmacy_id
ON public.product_discontinued_marks
FOR EACH ROW
EXECUTE FUNCTION public.product_discontinued_marks_recompute_trigger();

-- Backfill counters/proposed flags from existing marks
WITH mark_counts AS (
  SELECT product_id, COUNT(DISTINCT pharmacy_id)::INT AS cnt
  FROM public.product_discontinued_marks
  GROUP BY product_id
)
UPDATE public.product_catalog pc
SET
  discontinued_mark_count = COALESCE(mc.cnt, 0),
  discontinued_proposed = (COALESCE(mc.cnt, 0) >= 5),
  discontinued_proposed_at = CASE
    WHEN COALESCE(mc.cnt, 0) >= 5 THEN COALESCE(pc.discontinued_proposed_at, now())
    ELSE NULL
  END
FROM mark_counts mc
WHERE pc.id = mc.product_id;

UPDATE public.product_catalog pc
SET
  discontinued_mark_count = 0,
  discontinued_proposed = false,
  discontinued_proposed_at = NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_discontinued_marks m
  WHERE m.product_id = pc.id
)
AND (
  pc.discontinued_mark_count <> 0
  OR pc.discontinued_proposed
  OR pc.discontinued_proposed_at IS NOT NULL
);

-- --------------------------------------------
-- RLS policies
-- --------------------------------------------
ALTER TABLE public.product_discontinued_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read product catalog" ON public.product_catalog;
CREATE POLICY "Authenticated can read product catalog"
  ON public.product_catalog
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can update product catalog" ON public.product_catalog;
CREATE POLICY "Service role can update product catalog"
  ON public.product_catalog
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can read discontinued marks" ON public.product_discontinued_marks;
CREATE POLICY "Authenticated can read discontinued marks"
  ON public.product_discontinued_marks
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Pharmacists can insert discontinued marks for managed pharmacy" ON public.product_discontinued_marks;
CREATE POLICY "Pharmacists can insert discontinued marks for managed pharmacy"
  ON public.product_discontinued_marks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_pharmacist(auth.uid())
    AND public.can_manage_pharmacy_inventory(product_discontinued_marks.pharmacy_id, auth.uid())
    AND product_discontinued_marks.marked_by = auth.uid()
  );

DROP POLICY IF EXISTS "Pharmacists can delete discontinued marks for managed pharmacy" ON public.product_discontinued_marks;
CREATE POLICY "Pharmacists can delete discontinued marks for managed pharmacy"
  ON public.product_discontinued_marks
  FOR DELETE
  TO authenticated
  USING (
    public.is_pharmacist(auth.uid())
    AND public.can_manage_pharmacy_inventory(product_discontinued_marks.pharmacy_id, auth.uid())
  );

DROP POLICY IF EXISTS "Owners or staff can update pharmacy association status" ON public.pharmacy_inventory;
CREATE POLICY "Owners or staff can update pharmacy association status"
  ON public.pharmacy_inventory
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_pharmacy_inventory(pharmacy_inventory.pharmacy_id, auth.uid()))
  WITH CHECK (public.can_manage_pharmacy_inventory(pharmacy_inventory.pharmacy_id, auth.uid()));

GRANT SELECT ON public.product_discontinued_marks TO authenticated;
GRANT INSERT, DELETE ON public.product_discontinued_marks TO authenticated;
GRANT ALL ON public.product_discontinued_marks TO service_role;

COMMIT;
