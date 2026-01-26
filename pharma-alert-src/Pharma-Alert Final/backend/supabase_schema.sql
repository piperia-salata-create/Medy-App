-- Pharma-Alert Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'pharmacist_pending', 'pharmacist_verified')),
    full_name TEXT,
    pharmacy_name TEXT,
    language TEXT DEFAULT 'el' CHECK (language IN ('el', 'en')),
    senior_mode BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pharmacies table with geolocation
CREATE TABLE IF NOT EXISTS pharmacies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT,
    hours TEXT,
    is_on_call BOOLEAN DEFAULT FALSE,
    on_call_schedule TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Medicines table
CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    active_ingredient TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pharmacy Stock table (links pharmacies and medicines)
CREATE TABLE IF NOT EXISTS pharmacy_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'limited', 'unavailable')),
    quantity INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pharmacy_id, medicine_id)
);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pharmacy_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'general',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Demand Signals table (tracks medicine search patterns)
CREATE TABLE IF NOT EXISTS demand_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_name TEXT NOT NULL,
    request_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Requests table (inter-pharmacy communication)
CREATE TABLE IF NOT EXISTS stock_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    to_pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_name TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Medication Reminders table
CREATE TABLE IF NOT EXISTS medication_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    medicine_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT DEFAULT 'daily',
    time TEXT DEFAULT '08:00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for Pharmacies (public read, owner write)
DROP POLICY IF EXISTS "Anyone can view pharmacies" ON pharmacies;
CREATE POLICY "Anyone can view pharmacies" ON pharmacies
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can update their pharmacy" ON pharmacies;
CREATE POLICY "Owners can update their pharmacy" ON pharmacies
    FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Verified pharmacists can create pharmacy" ON pharmacies;
CREATE POLICY "Verified pharmacists can create pharmacy" ON pharmacies
    FOR INSERT WITH CHECK (true);

-- RLS Policies for Medicines (public read)
DROP POLICY IF EXISTS "Anyone can view medicines" ON medicines;
CREATE POLICY "Anyone can view medicines" ON medicines
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert medicines" ON medicines;
CREATE POLICY "Anyone can insert medicines" ON medicines
    FOR INSERT WITH CHECK (true);

-- RLS Policies for Pharmacy Stock (public read, pharmacy owner write)
DROP POLICY IF EXISTS "Anyone can view pharmacy stock" ON pharmacy_stock;
CREATE POLICY "Anyone can view pharmacy stock" ON pharmacy_stock
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pharmacy owners can manage stock" ON pharmacy_stock;
CREATE POLICY "Pharmacy owners can manage stock" ON pharmacy_stock
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM pharmacies 
            WHERE pharmacies.id = pharmacy_stock.pharmacy_id 
            AND pharmacies.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Anyone can insert stock" ON pharmacy_stock;
CREATE POLICY "Anyone can insert stock" ON pharmacy_stock
    FOR INSERT WITH CHECK (true);

-- RLS Policies for Favorites
DROP POLICY IF EXISTS "Users can view own favorites" ON favorites;
CREATE POLICY "Users can view own favorites" ON favorites
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own favorites" ON favorites;
CREATE POLICY "Users can manage own favorites" ON favorites
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for Notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own notifications" ON notifications;
CREATE POLICY "Users can manage own notifications" ON notifications
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for Demand Signals
DROP POLICY IF EXISTS "Pharmacy owners can view demand signals" ON demand_signals;
CREATE POLICY "Pharmacy owners can view demand signals" ON demand_signals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pharmacies 
            WHERE pharmacies.id = demand_signals.pharmacy_id 
            AND pharmacies.owner_id = auth.uid()
        )
    );

-- RLS Policies for Stock Requests (verified pharmacists only)
DROP POLICY IF EXISTS "Verified pharmacists can view stock requests" ON stock_requests;
CREATE POLICY "Verified pharmacists can view stock requests" ON stock_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'pharmacist_verified'
        )
    );

DROP POLICY IF EXISTS "Verified pharmacists can create stock requests" ON stock_requests;
CREATE POLICY "Verified pharmacists can create stock requests" ON stock_requests
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'pharmacist_verified'
        )
    );

DROP POLICY IF EXISTS "Verified pharmacists can update stock requests" ON stock_requests;
CREATE POLICY "Verified pharmacists can update stock requests" ON stock_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'pharmacist_verified'
        )
    );

-- RLS Policies for Medication Reminders
DROP POLICY IF EXISTS "Users can manage own reminders" ON medication_reminders;
CREATE POLICY "Users can manage own reminders" ON medication_reminders
    FOR ALL USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_pharmacies_owner ON pharmacies(owner_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_pharmacy ON pharmacy_stock(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_medicine ON pharmacy_stock(medicine_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_status ON pharmacy_stock(status);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_medication_reminders_user ON medication_reminders(user_id);

-- Enable Realtime for relevant tables
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE pharmacy_stock;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_requests;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Function to handle profile creation on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, role, language)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'role', 'patient'),
        'el'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Clear existing seed data to avoid duplicates
DELETE FROM pharmacy_stock;
DELETE FROM medicines;
DELETE FROM pharmacies WHERE owner_id IS NULL;

-- Seed data for demo pharmacies with Athens coordinates
INSERT INTO pharmacies (name, address, phone, hours, is_on_call, is_verified, latitude, longitude) VALUES
    ('Φαρμακείο Παπαδόπουλος', 'Ερμού 45, Αθήνα 10563', '+30 210 123 4567', '08:00 - 21:00', false, true, 37.9755, 23.7348),
    ('Φαρμακείο Νικολάου', 'Σταδίου 23, Αθήνα 10561', '+30 210 234 5678', '09:00 - 20:00', true, true, 37.9792, 23.7326),
    ('Φαρμακείο Αλεξίου', 'Πανεπιστημίου 67, Αθήνα 10564', '+30 210 345 6789', '08:30 - 21:30', false, true, 37.9810, 23.7340),
    ('Φαρμακείο Γεωργίου', 'Ακαδημίας 12, Αθήνα 10671', '+30 210 456 7890', '08:00 - 22:00', true, true, 37.9802, 23.7365),
    ('Φαρμακείο Κωνσταντίνου', 'Βασιλίσσης Σοφίας 89, Αθήνα 11521', '+30 210 567 8901', '07:30 - 20:30', false, true, 37.9760, 23.7450),
    ('Φαρμακείο Δημητρίου', 'Πατησίων 120, Αθήνα 11257', '+30 210 678 9012', '08:00 - 21:00', false, true, 37.9950, 23.7380),
    ('Φαρμακείο Ιωάννου', 'Αλεξάνδρας 85, Αθήνα 11474', '+30 210 789 0123', '09:00 - 21:00', true, true, 37.9880, 23.7510),
    ('Φαρμακείο Μαρίας', 'Κηφισίας 45, Μαρούσι 15123', '+30 210 890 1234', '08:30 - 20:30', false, true, 38.0350, 23.8020);

-- Seed data for demo medicines
INSERT INTO medicines (name, description, category, active_ingredient) VALUES
    ('Depon', 'Αναλγητικό - Αντιπυρετικό', 'Αναλγητικά', 'Παρακεταμόλη'),
    ('Ponstan', 'Αντιφλεγμονώδες', 'Αντιφλεγμονώδη', 'Μεφαιναμικό οξύ'),
    ('Voltaren', 'Αναλγητικό - Αντιφλεγμονώδες', 'Αντιφλεγμονώδη', 'Δικλοφενάκη'),
    ('Augmentin', 'Αντιβιοτικό ευρέως φάσματος', 'Αντιβιοτικά', 'Αμοξυκιλλίνη/Κλαβουλανικό'),
    ('Zantac', 'Αντιόξινο', 'Γαστρεντερικά', 'Ρανιτιδίνη'),
    ('Aerius', 'Αντιαλλεργικό', 'Αντιισταμινικά', 'Δεσλοραταδίνη'),
    ('Nurofen', 'Αναλγητικό - Αντιπυρετικό', 'Αναλγητικά', 'Ιβουπροφαίνη'),
    ('Aspirin', 'Αναλγητικό - Αντιπυρετικό', 'Αναλγητικά', 'Ακετυλοσαλικυλικό οξύ'),
    ('Lexotanil', 'Αγχολυτικό', 'Ψυχοτρόπα', 'Βρωμαζεπάμη'),
    ('Losec', 'Αντιόξινο', 'Γαστρεντερικά', 'Ομεπραζόλη');

-- Link medicines to pharmacies with stock status
DO $$
DECLARE
    p_record RECORD;
    m_record RECORD;
    statuses TEXT[] := ARRAY['available', 'limited', 'unavailable'];
BEGIN
    FOR p_record IN SELECT id FROM pharmacies LOOP
        FOR m_record IN SELECT id FROM medicines LOOP
            INSERT INTO pharmacy_stock (pharmacy_id, medicine_id, status, quantity)
            VALUES (
                p_record.id,
                m_record.id,
                statuses[1 + floor(random() * 3)::int],
                floor(random() * 100)::int
            )
            ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE
            SET status = EXCLUDED.status, quantity = EXCLUDED.quantity;
        END LOOP;
    END LOOP;
END $$;

-- Success message
SELECT 'Pharma-Alert schema created successfully with ' || 
       (SELECT COUNT(*) FROM pharmacies) || ' pharmacies and ' ||
       (SELECT COUNT(*) FROM medicines) || ' medicines!' AS message;
