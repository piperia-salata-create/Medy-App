-- ============================================
-- ADD patient search radius to profiles
-- Safe and idempotent
-- ============================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS radius_km numeric;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'radius_km'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN radius_km SET DEFAULT 10';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_radius_km_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_radius_km_check
      CHECK (radius_km IS NULL OR (radius_km >= 1 AND radius_km <= 200));
  END IF;
END $$;

COMMIT;

-- ============================================
-- END OF MIGRATION
-- ============================================
