-- ============================================
-- Drop legacy stock-model tables (safe + idempotent)
-- Assumes app is fully migrated to product_catalog + pharmacy_inventory.
-- ============================================

-- 1) Drop legacy per-pharmacy stock table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pharmacy_stock'
  ) THEN
    DROP TABLE public.pharmacy_stock;
  END IF;
END $$;

-- 2) Drop legacy medicines table only when no remaining FK depends on it
DO $$
DECLARE
  has_external_fk_refs BOOLEAN := false;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'medicines'
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class target_tbl ON target_tbl.oid = c.confrelid
      JOIN pg_namespace target_ns ON target_ns.oid = target_tbl.relnamespace
      JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src_tbl.relnamespace
      WHERE c.contype = 'f'
        AND target_ns.nspname = 'public'
        AND target_tbl.relname = 'medicines'
    )
    INTO has_external_fk_refs;

    IF NOT has_external_fk_refs THEN
      DROP TABLE public.medicines;
    END IF;
  END IF;
END $$;
