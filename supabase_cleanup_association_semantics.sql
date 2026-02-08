-- ============================================
-- Align pharmacy_inventory with declarative-association semantics
-- Safe + idempotent
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pharmacy_inventory'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pharmacy_inventory'
        AND column_name = 'in_stock'
    ) THEN
      UPDATE public.pharmacy_inventory
      SET in_stock = true
      WHERE in_stock IS DISTINCT FROM true;
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_pharmacy_inventory_in_stock;
