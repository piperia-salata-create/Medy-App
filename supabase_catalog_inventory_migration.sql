-- ============================================
-- PHARMA-ALERT CATALOG + INVENTORY MIGRATION
-- Bilingual shared catalog and pharmacy inventory
-- Safe and idempotent where possible
-- ============================================

BEGIN;

-- Extensions required for UUID defaults and trigram search
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- TABLE: product_catalog
-- ============================================
CREATE TABLE IF NOT EXISTS public.product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name_el TEXT NULL,
  name_en TEXT NULL,
  name_el_norm TEXT NOT NULL DEFAULT '',
  name_en_norm TEXT NOT NULL DEFAULT '',
  desc_el TEXT NULL,
  desc_en TEXT NULL,
  barcode TEXT NULL,
  brand TEXT NULL,
  strength TEXT NULL,
  form TEXT NULL,
  active_ingredient_el TEXT NULL,
  active_ingredient_en TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure required columns exist for existing databases
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS name_el TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS name_el_norm TEXT DEFAULT '';
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS name_en_norm TEXT DEFAULT '';
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS desc_el TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS desc_en TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS strength TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS form TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS active_ingredient_el TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS active_ingredient_en TEXT;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure category is always populated
UPDATE public.product_catalog
SET category = 'product'
WHERE category IS NULL OR btrim(category) = '';

ALTER TABLE public.product_catalog ALTER COLUMN category SET DEFAULT 'product';
ALTER TABLE public.product_catalog ALTER COLUMN category SET NOT NULL;

-- Backfill and harden normalized-name columns
UPDATE public.product_catalog
SET name_el_norm = ''
WHERE name_el_norm IS NULL;

UPDATE public.product_catalog
SET name_en_norm = ''
WHERE name_en_norm IS NULL;

ALTER TABLE public.product_catalog ALTER COLUMN name_el_norm SET DEFAULT '';
ALTER TABLE public.product_catalog ALTER COLUMN name_en_norm SET DEFAULT '';
ALTER TABLE public.product_catalog ALTER COLUMN name_el_norm SET NOT NULL;
ALTER TABLE public.product_catalog ALTER COLUMN name_en_norm SET NOT NULL;

-- Backfill timestamps if null
UPDATE public.product_catalog
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.product_catalog
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE public.product_catalog ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.product_catalog ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.product_catalog ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.product_catalog ALTER COLUMN updated_at SET NOT NULL;

-- Enforce category whitelist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_catalog_category_check'
      AND conrelid = 'public.product_catalog'::regclass
  ) THEN
    ALTER TABLE public.product_catalog
      ADD CONSTRAINT product_catalog_category_check
      CHECK (category IN ('medication', 'parapharmacy', 'product'));
  END IF;
END $$;

-- Enforce name presence (at least one non-empty EL/EN name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_catalog_name_presence_check'
      AND conrelid = 'public.product_catalog'::regclass
  ) THEN
    ALTER TABLE public.product_catalog
      ADD CONSTRAINT product_catalog_name_presence_check
      CHECK (
        COALESCE(NULLIF(btrim(name_el), ''), NULLIF(btrim(name_en), '')) IS NOT NULL
      );
  END IF;
END $$;

-- ============================================
-- TABLE: pharmacy_inventory
-- ============================================
CREATE TABLE IF NOT EXISTS public.pharmacy_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.product_catalog(id) ON DELETE CASCADE,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  price NUMERIC NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS pharmacy_id UUID;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add missing foreign keys only if absent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pharmacy_inventory_pharmacy_id_fkey'
      AND conrelid = 'public.pharmacy_inventory'::regclass
  ) THEN
    ALTER TABLE public.pharmacy_inventory
      ADD CONSTRAINT pharmacy_inventory_pharmacy_id_fkey
      FOREIGN KEY (pharmacy_id)
      REFERENCES public.pharmacies(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pharmacy_inventory_product_id_fkey'
      AND conrelid = 'public.pharmacy_inventory'::regclass
  ) THEN
    ALTER TABLE public.pharmacy_inventory
      ADD CONSTRAINT pharmacy_inventory_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.product_catalog(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Set inventory column defaults and not-null
ALTER TABLE public.pharmacy_inventory ALTER COLUMN in_stock SET DEFAULT true;
UPDATE public.pharmacy_inventory SET in_stock = true WHERE in_stock IS NULL;
ALTER TABLE public.pharmacy_inventory ALTER COLUMN in_stock SET NOT NULL;

ALTER TABLE public.pharmacy_inventory ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.pharmacy_inventory ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.pharmacy_inventory SET created_at = now() WHERE created_at IS NULL;
UPDATE public.pharmacy_inventory SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.pharmacy_inventory ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.pharmacy_inventory ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.pharmacy_inventory ALTER COLUMN pharmacy_id SET NOT NULL;
ALTER TABLE public.pharmacy_inventory ALTER COLUMN product_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pharmacy_inventory_price_nonnegative_check'
      AND conrelid = 'public.pharmacy_inventory'::regclass
  ) THEN
    ALTER TABLE public.pharmacy_inventory
      ADD CONSTRAINT pharmacy_inventory_price_nonnegative_check
      CHECK (price IS NULL OR price >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pharmacy_inventory_pharmacy_product_unique'
      AND conrelid = 'public.pharmacy_inventory'::regclass
  ) THEN
    ALTER TABLE public.pharmacy_inventory
      ADD CONSTRAINT pharmacy_inventory_pharmacy_product_unique
      UNIQUE (pharmacy_id, product_id);
  END IF;
END $$;

-- ============================================
-- NORMALIZATION + UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.normalize_catalog_text(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(btrim(COALESCE(input_text, ''))), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.product_catalog_apply_normalization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name_el_norm := public.normalize_catalog_text(NEW.name_el);
  NEW.name_en_norm := public.normalize_catalog_text(NEW.name_en);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_inventory_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_catalog_normalize_names ON public.product_catalog;
CREATE TRIGGER trg_product_catalog_normalize_names
BEFORE INSERT OR UPDATE ON public.product_catalog
FOR EACH ROW
EXECUTE FUNCTION public.product_catalog_apply_normalization();

DROP TRIGGER IF EXISTS trg_product_catalog_set_updated_at ON public.product_catalog;
CREATE TRIGGER trg_product_catalog_set_updated_at
BEFORE UPDATE ON public.product_catalog
FOR EACH ROW
EXECUTE FUNCTION public.catalog_inventory_set_updated_at();

DROP TRIGGER IF EXISTS trg_pharmacy_inventory_set_updated_at ON public.pharmacy_inventory;
CREATE TRIGGER trg_pharmacy_inventory_set_updated_at
BEFORE UPDATE ON public.pharmacy_inventory
FOR EACH ROW
EXECUTE FUNCTION public.catalog_inventory_set_updated_at();

-- Backfill normalized names for existing rows
UPDATE public.product_catalog
SET
  name_el_norm = public.normalize_catalog_text(name_el),
  name_en_norm = public.normalize_catalog_text(name_en)
WHERE
  name_el_norm IS DISTINCT FROM public.normalize_catalog_text(name_el)
  OR name_en_norm IS DISTINCT FROM public.normalize_catalog_text(name_en);

-- ============================================
-- SEARCH + ACCESS INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_catalog_category
  ON public.product_catalog (category);

CREATE INDEX IF NOT EXISTS idx_product_catalog_name_el_norm_trgm
  ON public.product_catalog
  USING gin (name_el_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_catalog_name_en_norm_trgm
  ON public.product_catalog
  USING gin (name_en_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_pharmacy_id
  ON public.pharmacy_inventory (pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_product_id
  ON public.pharmacy_inventory (product_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_in_stock
  ON public.pharmacy_inventory (in_stock);

-- ============================================
-- RLS + POLICIES
-- ============================================
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_inventory ENABLE ROW LEVEL SECURITY;

-- product_catalog: read for authenticated users
DROP POLICY IF EXISTS "Authenticated can read product catalog" ON public.product_catalog;
CREATE POLICY "Authenticated can read product catalog"
  ON public.product_catalog
  FOR SELECT
  TO authenticated
  USING (true);

-- product_catalog: write via service role only (safest)
DROP POLICY IF EXISTS "Service role can insert product catalog" ON public.product_catalog;
CREATE POLICY "Service role can insert product catalog"
  ON public.product_catalog
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update product catalog" ON public.product_catalog;
CREATE POLICY "Service role can update product catalog"
  ON public.product_catalog
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can delete product catalog" ON public.product_catalog;
CREATE POLICY "Service role can delete product catalog"
  ON public.product_catalog
  FOR DELETE
  TO service_role
  USING (true);

-- Helper for pharmacy inventory write access:
-- owner is supported now; optional pharmacy_staff table is honored if it exists.
CREATE OR REPLACE FUNCTION public.can_manage_pharmacy_inventory(p_pharmacy_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.can_manage_pharmacy_inventory(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_pharmacy_inventory(UUID, UUID) TO authenticated, service_role;

-- pharmacy_inventory: read for authenticated users
DROP POLICY IF EXISTS "Authenticated can read pharmacy inventory" ON public.pharmacy_inventory;
CREATE POLICY "Authenticated can read pharmacy inventory"
  ON public.pharmacy_inventory
  FOR SELECT
  TO authenticated
  USING (true);

-- pharmacy_inventory: write for pharmacy owner/staff only
DROP POLICY IF EXISTS "Owners or staff can insert pharmacy inventory" ON public.pharmacy_inventory;
CREATE POLICY "Owners or staff can insert pharmacy inventory"
  ON public.pharmacy_inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_pharmacy_inventory(pharmacy_inventory.pharmacy_id, auth.uid()));

DROP POLICY IF EXISTS "Owners or staff can update pharmacy inventory" ON public.pharmacy_inventory;
CREATE POLICY "Owners or staff can update pharmacy inventory"
  ON public.pharmacy_inventory
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_pharmacy_inventory(pharmacy_inventory.pharmacy_id, auth.uid()))
  WITH CHECK (public.can_manage_pharmacy_inventory(pharmacy_inventory.pharmacy_id, auth.uid()));

DROP POLICY IF EXISTS "Owners or staff can delete pharmacy inventory" ON public.pharmacy_inventory;
CREATE POLICY "Owners or staff can delete pharmacy inventory"
  ON public.pharmacy_inventory
  FOR DELETE
  TO authenticated
  USING (public.can_manage_pharmacy_inventory(pharmacy_inventory.pharmacy_id, auth.uid()));

-- ============================================
-- GRANTS
-- ============================================
GRANT SELECT ON public.product_catalog TO authenticated;
GRANT ALL ON public.product_catalog TO service_role;

GRANT SELECT ON public.pharmacy_inventory TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pharmacy_inventory TO authenticated;
GRANT ALL ON public.pharmacy_inventory TO service_role;

COMMIT;

-- ============================================
-- END OF MIGRATION
-- ============================================
