-- ============================================
-- Inventory matching precision patch
-- Idempotent: safe to run multiple times
-- ============================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Shared normalization helper (kept aligned with existing migrations).
CREATE OR REPLACE FUNCTION public.normalize_catalog_text(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(btrim(COALESCE(input_text, ''))), '\s+', ' ', 'g')
$$;

-- Add normalized form/strength columns for deterministic matching.
ALTER TABLE IF EXISTS public.product_catalog
  ADD COLUMN IF NOT EXISTS form_norm TEXT DEFAULT '';

ALTER TABLE IF EXISTS public.product_catalog
  ADD COLUMN IF NOT EXISTS strength_norm TEXT DEFAULT '';

UPDATE public.product_catalog
SET form_norm = public.normalize_catalog_text(form)
WHERE form_norm IS NULL
   OR form_norm IS DISTINCT FROM public.normalize_catalog_text(form);

UPDATE public.product_catalog
SET strength_norm = public.normalize_catalog_text(strength)
WHERE strength_norm IS NULL
   OR strength_norm IS DISTINCT FROM public.normalize_catalog_text(strength);

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN form_norm SET DEFAULT '';

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN strength_norm SET DEFAULT '';

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN form_norm SET NOT NULL;

ALTER TABLE IF EXISTS public.product_catalog
  ALTER COLUMN strength_norm SET NOT NULL;

-- Keep all normalized columns in sync on writes.
CREATE OR REPLACE FUNCTION public.product_catalog_apply_normalization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name_el_norm := public.normalize_catalog_text(NEW.name_el);
  NEW.name_en_norm := public.normalize_catalog_text(NEW.name_en);
  NEW.form_norm := public.normalize_catalog_text(NEW.form);
  NEW.strength_norm := public.normalize_catalog_text(NEW.strength);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.product_catalog') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_product_catalog_normalize_names ON public.product_catalog;

  CREATE TRIGGER trg_product_catalog_normalize_names
  BEFORE INSERT OR UPDATE ON public.product_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.product_catalog_apply_normalization();
END $$;

-- Composite non-unique indexes for precise identity matching.
CREATE INDEX IF NOT EXISTS idx_product_catalog_match_el_form_strength
  ON public.product_catalog (category, name_el_norm, form_norm, strength_norm);

CREATE INDEX IF NOT EXISTS idx_product_catalog_match_en_form_strength
  ON public.product_catalog (category, name_en_norm, form_norm, strength_norm);

-- Trigram indexes retained for text search/lookups.
CREATE INDEX IF NOT EXISTS idx_product_catalog_name_el_norm_trgm
  ON public.product_catalog
  USING gin (name_el_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_catalog_name_en_norm_trgm
  ON public.product_catalog
  USING gin (name_en_norm gin_trgm_ops);

COMMIT;
