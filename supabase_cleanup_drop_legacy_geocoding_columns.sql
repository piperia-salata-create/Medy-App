-- ============================================
-- Drop legacy geocoding columns from public.pharmacies
-- Safe + idempotent
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pharmacies'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pharmacies'
        AND column_name = 'provider'
    ) THEN
      ALTER TABLE public.pharmacies DROP COLUMN provider;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pharmacies'
        AND column_name = 'osm_id'
    ) THEN
      ALTER TABLE public.pharmacies DROP COLUMN osm_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pharmacies'
        AND column_name = 'osm_type'
    ) THEN
      ALTER TABLE public.pharmacies DROP COLUMN osm_type;
    END IF;
  END IF;
END $$;

