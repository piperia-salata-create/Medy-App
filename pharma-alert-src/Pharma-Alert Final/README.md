# Pharma-Alert - Βρες Φάρμακα Κοντά Σου

A production-ready pharmacy medicine availability platform with PWA support, built with React, FastAPI, and Supabase.

## 🚀 Quick Start

### 1. Set Up Supabase Database

**IMPORTANT: Run this SQL schema in your Supabase SQL Editor first:**

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Copy the contents of `/backend/supabase_schema.sql`
5. Paste and run the SQL

This creates all tables, RLS policies, and seed data (8 pharmacies, 10 medicines with stock).

### 2. Run Locally

```bash
# Frontend
cd frontend
yarn install
yarn start

# Backend (optional - most features use Supabase directly)
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

## ✨ Features

### Patient Features
- 🔍 **Medicine Search** - Real-time search across pharmacies
- 🗺️ **Map View** - OpenStreetMap with nearby pharmacies
- 📍 **Geolocation Sorting** - Pharmacies sorted by distance
- ⭐ **Favorites** - Save favorite pharmacies
- 💊 **Medication Reminders** - CRUD for medication schedules
- 🔔 **Real-time Notifications** - In-app alerts
- 👴 **Senior Mode** - Optional larger text and simplified UI (toggle in Settings)
- 📱 **PWA** - Installable on mobile/desktop

### Pharmacist Features
- 📦 **Stock Management** - Quick status updates
- 📊 **Demand Signals** - View medicine search patterns
- 🏥 **Inter-Pharmacy** (Verified Only) - Stock requests between pharmacies

### General
- 🌐 **Bilingual** - Greek (default) / English toggle
- 🎨 **Premium UI** - Brand-driven, designer-quality interface
- 📱 **Responsive** - Mobile, tablet, desktop

## 🗺️ Maps Integration

Uses **OpenStreetMap + Leaflet** (no Google Maps):
- Display nearby pharmacies on interactive map
- Calculate distances using Haversine formula
- Open external navigation (OSM on desktop, native maps on mobile)

## 🔐 Roles & Verification

| Role | Access |
|------|--------|
| `patient` | Search, favorites, reminders, notifications |
| `pharmacist_pending` | Limited dashboard (awaiting verification) |
| `pharmacist_verified` | Full dashboard + inter-pharmacy features |

**To verify a pharmacist** (admin action in Supabase):
```sql
UPDATE profiles SET role = 'pharmacist_verified' WHERE id = '<user-id>';
```

## 🎨 Design System

### Color Palette
- **Primary**: #008B8B (Teal)
- **Secondary**: #4682B4 (Steel Blue)  
- **Success**: #2E8B57 (Sea Green)
- **Accent**: #3B4C9B (Royal Blue)
- **Dark**: #2C3E50 (Dark Slate)
- **Backgrounds**: #F5F9FC, #FFFFFF

### Senior Mode (Optional)
- Disabled by default
- Enable via Settings → Senior Mode toggle
- Increases font sizes, touch targets, and contrast

## 📁 Project Structure

```
/app
├── frontend/
│   ├── public/
│   │   ├── manifest.json    # PWA manifest
│   │   └── sw.js            # Service worker
│   └── src/
│       ├── components/ui/   # Shadcn UI + custom components
│       ├── contexts/        # Auth, Language, SeniorMode, Notifications
│       ├── lib/             # Supabase client, utils
│       └── pages/
│           ├── auth/        # SignIn, SignUp
│           ├── patient/     # Dashboard, Favorites, Reminders, PharmacyDetail
│           ├── pharmacist/  # Dashboard, InterPharmacy
│           └── shared/      # Settings, Notifications
├── backend/
│   ├── server.py
│   ├── supabase_schema.sql  # ⚠️ RUN THIS IN SUPABASE FIRST
│   └── requirements.txt
└── README.md
```

## 🔔 Notifications

> **Note**: Notifications work when the app is open or installed on your device.

Real-time in-app notifications via Supabase Realtime. Push notifications for closed apps require a future native Store app version.

## 📦 Download

The complete project ZIP is available at:
- **Filename**: `pharma-alert-project.zip`
- **Location**: `/app/pharma-alert-project.zip`

## 🛠️ Environment Variables

### Frontend (`.env`)
```env
REACT_APP_SUPABASE_URL=your-supabase-url
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

### Backend (`.env`)
```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

## 📄 License

MIT
