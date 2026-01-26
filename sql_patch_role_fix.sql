-- ============================================
-- PHARMA-ALERT SQL PATCH - ROLE FIX
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PART 1: DROP EXISTING TRIGGER (if any)
-- ============================================

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- ============================================
-- PART 2: CREATE TRIGGER FUNCTION
-- Reads role from raw_user_meta_data, defaults to 'patient'
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Extract role from user metadata
  user_role := NEW.raw_user_meta_data->>'role';
  
  -- Validate and normalize role
  IF user_role IS NULL OR user_role NOT IN ('patient', 'pharmacist') THEN
    user_role := 'patient';
  END IF;
  
  -- Insert into profiles with the correct role
  INSERT INTO public.profiles (
    id,
    role,
    email,
    full_name,
    pharmacy_name,
    language,
    senior_mode,
    created_at
  )
  VALUES (
    NEW.id,
    user_role,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'pharmacy_name',
    'el',
    false,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    pharmacy_name = COALESCE(EXCLUDED.pharmacy_name, profiles.pharmacy_name);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: CREATE TRIGGER
-- Fires after insert on auth.users
-- ============================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- PART 4: BACKFILL EXISTING USERS
-- Fix any users with wrong role
-- ============================================

-- Update profiles to match auth metadata for existing users
-- This corrects users who signed up as pharmacist but got patient role
UPDATE public.profiles p
SET role = 'pharmacist'
FROM auth.users u
WHERE p.id = u.id
  AND u.raw_user_meta_data->>'role' = 'pharmacist'
  AND p.role != 'pharmacist';

-- Normalize any legacy role values
UPDATE public.profiles
SET role = 'pharmacist'
WHERE role IN ('pharmacist_pending', 'pharmacist_verified');

-- ============================================
-- PART 5: ENSURE profiles.email COLUMN EXISTS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
END $$;

-- ============================================
-- PART 6: VERIFICATION QUERIES
-- Uncomment and run to verify
-- ============================================

-- Check trigger exists:
-- SELECT trigger_name, event_manipulation, action_statement 
-- FROM information_schema.triggers 
-- WHERE trigger_name = 'on_auth_user_created';

-- Check role distribution:
-- SELECT role, COUNT(*) FROM public.profiles GROUP BY role;

-- Check for mismatched roles:
-- SELECT p.id, p.role as profile_role, u.raw_user_meta_data->>'role' as meta_role
-- FROM public.profiles p
-- JOIN auth.users u ON p.id = u.id
-- WHERE p.role != COALESCE(u.raw_user_meta_data->>'role', 'patient');

-- ============================================
-- END OF PATCH
-- ============================================
