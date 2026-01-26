-- ============================================
-- PHARMA-ALERT SUPABASE MIGRATION SCRIPT
-- Safe and idempotent - can be run multiple times
-- ============================================

-- ============================================
-- PART 1: ROLE BACKFILL/MIGRATION
-- Normalize any existing pharmacist_pending or pharmacist_verified to 'pharmacist'
-- ============================================

-- Backfill: Convert pharmacist_pending and pharmacist_verified to 'pharmacist'
UPDATE profiles 
SET role = 'pharmacist' 
WHERE role IN ('pharmacist_pending', 'pharmacist_verified');

-- Ensure only valid roles exist
-- (This is informational - no constraint added to allow flexibility)
-- SELECT DISTINCT role FROM profiles;

-- ============================================
-- PART 2: CREATE PHARMACIST_CONNECTIONS TABLE
-- ============================================

-- Create enum type for connection status (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_status') THEN
        CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'rejected', 'blocked');
    END IF;
END $$;

-- Create pharmacist_connections table
CREATE TABLE IF NOT EXISTS pharmacist_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_pharmacist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_pharmacist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status connection_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    
    -- Prevent duplicate connections (A->B is same as existing A->B)
    CONSTRAINT unique_connection UNIQUE (requester_pharmacist_id, target_pharmacist_id),
    
    -- Prevent self-connections
    CONSTRAINT no_self_connection CHECK (requester_pharmacist_id != target_pharmacist_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_connections_requester ON pharmacist_connections(requester_pharmacist_id);
CREATE INDEX IF NOT EXISTS idx_connections_target ON pharmacist_connections(target_pharmacist_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON pharmacist_connections(status);
CREATE INDEX IF NOT EXISTS idx_connections_requester_status ON pharmacist_connections(requester_pharmacist_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_target_status ON pharmacist_connections(target_pharmacist_id, status);

-- ============================================
-- PART 3: RLS POLICIES FOR PHARMACIST_CONNECTIONS
-- ============================================

-- Enable RLS on the table
ALTER TABLE pharmacist_connections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Pharmacists can view their connections" ON pharmacist_connections;
DROP POLICY IF EXISTS "Pharmacists can create invites" ON pharmacist_connections;
DROP POLICY IF EXISTS "Target pharmacist can update pending invites" ON pharmacist_connections;
DROP POLICY IF EXISTS "Pharmacists can delete their own invites" ON pharmacist_connections;

-- Policy 1: View connections - users can see connections where they are requester OR target
CREATE POLICY "Pharmacists can view their connections"
ON pharmacist_connections
FOR SELECT
TO authenticated
USING (
    auth.uid() = requester_pharmacist_id 
    OR auth.uid() = target_pharmacist_id
);

-- Policy 2: Create invites - only pharmacists can create invites as themselves
CREATE POLICY "Pharmacists can create invites"
ON pharmacist_connections
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = requester_pharmacist_id
    AND status = 'pending'
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'pharmacist'
    )
);

-- Policy 3: Update invites - only target pharmacist can accept/reject pending invites
CREATE POLICY "Target pharmacist can update pending invites"
ON pharmacist_connections
FOR UPDATE
TO authenticated
USING (
    auth.uid() = target_pharmacist_id
    AND status = 'pending'
)
WITH CHECK (
    auth.uid() = target_pharmacist_id
    AND status IN ('accepted', 'rejected', 'blocked')
);

-- Policy 4: Delete - only requester can delete their pending invites
CREATE POLICY "Pharmacists can delete their own invites"
ON pharmacist_connections
FOR DELETE
TO authenticated
USING (
    auth.uid() = requester_pharmacist_id
    AND status = 'pending'
);

-- ============================================
-- PART 4: HELPER FUNCTION TO CHECK IF USER IS PHARMACIST
-- ============================================

CREATE OR REPLACE FUNCTION is_pharmacist(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id 
        AND role = 'pharmacist'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 5: VERIFICATION QUERIES
-- Run these to verify the migration worked
-- ============================================

-- Check profiles roles distribution
-- SELECT role, COUNT(*) FROM profiles GROUP BY role;

-- Check if connections table exists
-- SELECT COUNT(*) FROM pharmacist_connections;

-- Check RLS policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies WHERE tablename = 'pharmacist_connections';

-- ============================================
-- END OF MIGRATION
-- ============================================
