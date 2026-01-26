# Pharma-Alert Fix Documentation

## SQL PATCH REQUIRED

**Run `/app/sql_patch_role_fix.sql` in Supabase SQL Editor**

This creates a trigger that reads `role` from user metadata and writes it to `profiles.role`.

---

## Files Changed

### 1. `/app/frontend/src/pages/auth/SignUpPage.jsx`
- **Fixed**: Now passes `role` in `supabase.auth.signUp({ options: { data: { role } } })`
- User metadata now contains correct role for trigger to read

### 2. `/app/frontend/src/pages/auth/VerifyOtpPage.jsx`
- **Fixed**: Upserts profile with role from sessionStorage or metadata fallback
- Routes to `/pharmacist` or `/patient` based on saved profile role

### 3. `/app/frontend/src/contexts/AuthContext.js`
- **Fixed**: `fetchProfile` creates profile if missing, using metadata role
- Added fallback: if profile doesn't exist, creates with role from auth metadata

### 4. `/app/frontend/src/pages/pharmacist/PharmacistDashboard.jsx`
- **Complete rewrite** with required features:
  - Status Card: On-duty toggle bound to `pharmacies.is_on_call`
  - Pharmacy Profile Card: name, address, phone, verification status
  - Connections Summary Card: incoming/outgoing/accepted counts, recent connections, invite CTA
  - Stock Requests Summary: pending count, recent requests

### 5. `/app/sql_patch_role_fix.sql` (NEW)
- Creates `handle_new_user()` trigger function
- Reads `raw_user_meta_data->>'role'` 
- Defaults to 'patient' if not present or invalid
- Backfills existing users with wrong roles

---

## Test Checklist

### Role Persistence
- [ ] New patient signup → `profiles.role = 'patient'`
- [ ] New pharmacist signup → `profiles.role = 'pharmacist'`
- [ ] Verify in Supabase: `SELECT role FROM profiles WHERE id = '<user_id>'`

### Routing
- [ ] Patient signup → lands on `/patient`
- [ ] Pharmacist signup → lands on `/pharmacist`
- [ ] Patient login → lands on `/patient`
- [ ] Pharmacist login → lands on `/pharmacist`
- [ ] Refresh page → stays on same dashboard
- [ ] Logout/login → stays on same dashboard

### Pharmacist Dashboard Features
- [ ] Status card visible with on-duty toggle
- [ ] Pharmacy card shows pharmacy info or "Add Pharmacy" CTA
- [ ] Connections card shows counts and recent connections
- [ ] Invite button opens email modal
- [ ] Stock requests card shows pending count

### Connections Flow
- [ ] Pharmacist A sends invite to Pharmacist B's email
- [ ] Pharmacist B sees incoming invite
- [ ] Pharmacist B accepts → both see connection
- [ ] Invite non-pharmacist email → shows "not found" error

---

## SQL Verification Queries

```sql
-- Check trigger exists
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Check role distribution
SELECT role, COUNT(*) FROM profiles GROUP BY role;

-- Find mismatched roles
SELECT p.id, p.role, u.raw_user_meta_data->>'role' as meta_role
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.role != COALESCE(u.raw_user_meta_data->>'role', 'patient');
```
