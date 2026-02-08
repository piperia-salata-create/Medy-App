import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { geocodeAddress } from '../../lib/geocoding/googleGeocoding';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Clock, Shield } from 'lucide-react';

const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayLabels = {
  en: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
  el: { mon: 'Δευ', tue: 'Τρι', wed: 'Τετ', thu: 'Πεμ', fri: 'Παρ', sat: 'Σαβ', sun: 'Κυρ' }
};

const createEmptySchedule = () => dayOrder.reduce((acc, key) => {
  acc[key] = { closed: true, open: '', close: '' };
  return acc;
}, {});

const emptyForm = {
  name: '',
  address: '',
  phone: '',
  is_on_call: false,
  on_call_schedule: ''
};

const buildTimeOptions = () => {
  const options = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = String(hour).padStart(2, '0');
      const m = String(minute).padStart(2, '0');
      options.push(`${h}:${m}`);
    }
  }
  return options;
};

const timeOptions = buildTimeOptions();

const parseStructuredHours = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return { schedule: createEmptySchedule(), legacy: '' };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { schedule: createEmptySchedule(), legacy: raw };
    }

    const schedule = createEmptySchedule();
    dayOrder.forEach((day) => {
      const entry = parsed[day] || {};
      const openValue = typeof entry.open === 'string' ? entry.open : '';
      const closeValue = typeof entry.close === 'string' ? entry.close : '';
      const hasTimes = openValue && closeValue;
      schedule[day] = {
        closed: entry.closed === true || !hasTimes,
        open: hasTimes ? openValue : '',
        close: hasTimes ? closeValue : ''
      };
    });

    return { schedule, legacy: '' };
  } catch (err) {
    return { schedule: createEmptySchedule(), legacy: raw };
  }
};

const timeToMinutes = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

export default function PharmacyCreatePage() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [existingPharmacyId, setExistingPharmacyId] = useState(null);
  const [existingCoords, setExistingCoords] = useState({ latitude: null, longitude: null });
  const [hoursSchedule, setHoursSchedule] = useState(createEmptySchedule());
  const [legacyHours, setLegacyHours] = useState('');

  const isEditMode = useMemo(() => Boolean(existingPharmacyId), [existingPharmacyId]);
  const labels = language === 'el' ? dayLabels.el : dayLabels.en;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/signin', { replace: true });
      return;
    }

    const loadPharmacy = async () => {
      setLoading(true);
      setFormError('');
      try {
        const { data, error } = await supabase
          .from('pharmacies')
          .select('*')
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setExistingPharmacyId(data.id);
          setExistingCoords({
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null
          });
          setForm({
            name: data.name || '',
            address: data.address || '',
            phone: data.phone || '',
            is_on_call: Boolean(data.is_on_call),
            on_call_schedule: data.on_call_schedule || ''
          });
          const parsed = parseStructuredHours(data.hours);
          setHoursSchedule(parsed.schedule);
          setLegacyHours(parsed.legacy);
        } else {
          setExistingPharmacyId(null);
          setExistingCoords({ latitude: null, longitude: null });
          setForm({ ...emptyForm });
          setHoursSchedule(createEmptySchedule());
          setLegacyHours('');
        }
      } catch (err) {
        const message = err?.message || (language === 'el' ? 'Σφάλμα φόρτωσης.' : 'Failed to load.');
        setFormError(message);
      } finally {
        setLoading(false);
      }
    };

    loadPharmacy();
  }, [authLoading, user, navigate, language]);

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = language === 'el' ? 'Απαιτείται όνομα.' : 'Name is required.';
    }
    if (!form.address.trim()) {
      nextErrors.address = language === 'el' ? 'Απαιτείται διεύθυνση.' : 'Address is required.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getHoursPayload = () => {
    let anyOpenDay = false;
    let anyTimeSet = false;
    let hasError = false;

    const schedule = {};

    dayOrder.forEach((day) => {
      const entry = hoursSchedule[day] || { closed: true, open: '', close: '' };
      const openValue = entry.open || '';
      const closeValue = entry.close || '';

      if (openValue || closeValue) {
        anyTimeSet = true;
      }

      if (entry.closed) {
        schedule[day] = { closed: true, open: null, close: null };
        return;
      }

      anyOpenDay = true;
      if (!openValue || !closeValue) {
        hasError = true;
        schedule[day] = { closed: false, open: openValue || null, close: closeValue || null };
        return;
      }

      const openMinutes = timeToMinutes(openValue);
      const closeMinutes = timeToMinutes(closeValue);
      if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
        hasError = true;
      }

      schedule[day] = { closed: false, open: openValue, close: closeValue };
    });

    if (!anyOpenDay && !anyTimeSet) {
      if (legacyHours) {
        return { hoursValue: legacyHours, error: '' };
      }
      return { hoursValue: null, error: '' };
    }

    if (hasError) {
      return {
        hoursValue: null,
        error: language === 'el'
          ? 'Ελέγξτε τις ώρες λειτουργίας. Το κλείσιμο πρέπει να είναι μετά το άνοιγμα.'
          : 'Check the opening hours. Closing time must be later than opening time.'
      };
    }

    return { hoursValue: JSON.stringify(schedule), error: '' };
  };

  const handleChange = (field) => (eventOrValue) => {
    const value = eventOrValue?.target ? eventOrValue.target.value : eventOrValue;
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateDay = (dayKey, updates) => {
    setHoursSchedule((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        ...updates
      }
    }));
    setErrors((prev) => {
      if (!prev.hours) return prev;
      const { hours, ...rest } = prev;
      return rest;
    });
  };

  const resolveAddressCoordinates = async (address) => {
    const trimmed = address.trim();
    if (!trimmed) return { latitude: null, longitude: null, status: 'empty' };

    try {
      const results = await geocodeAddress(trimmed, {
        language,
        region: 'gr',
        limit: 1
      });
      if (Array.isArray(results) && results.length > 0) {
        const first = results[0];
        const lat = Number(first.latitude);
        const lng = Number(first.longitude);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          return { latitude: lat, longitude: lng, status: 'ok' };
        }
      }

      return { latitude: null, longitude: null, status: 'not_found' };
    } catch (err) {
      console.error('Geocode failed:', err);
      return { latitude: null, longitude: null, status: 'error' };
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setFormError('');
    if (!validate()) return;

    const { hoursValue, error: hoursError } = getHoursPayload();
    if (hoursError) {
      setErrors((prev) => ({ ...prev, hours: hoursError }));
      return;
    }

    setSaving(true);
    try {
      const geocodeResult = await resolveAddressCoordinates(form.address);
      let latitudeValue = geocodeResult.latitude;
      let longitudeValue = geocodeResult.longitude;
      const geocodeFailed = geocodeResult.status !== 'ok';

      if (geocodeFailed && isEditMode) {
        latitudeValue = existingCoords.latitude;
        longitudeValue = existingCoords.longitude;
      }

      if (isEditMode) {
        const { error } = await supabase
          .from('pharmacies')
          .update({
            name: form.name.trim(),
            address: form.address.trim(),
            phone: form.phone.trim() || null,
            hours: hoursValue,
            is_on_call: Boolean(form.is_on_call),
            on_call_schedule: form.on_call_schedule.trim() || null,
            latitude: latitudeValue,
            longitude: longitudeValue
          })
          .eq('id', existingPharmacyId);

        if (error) throw error;

        toast.success(language === 'el' ? 'Η ενημέρωση ολοκληρώθηκε.' : 'Pharmacy updated.');
      } else {
        const ownerId = user?.id || null;
        if (!ownerId) {
          const message = language === 'el'
            ? 'Δεν βρέθηκε ο χρήστης για την καταχώρηση.'
            : 'User not found for this request.';
          setFormError(message);
          toast.error(message);
          return;
        }

        const { error } = await supabase
          .from('pharmacies')
          .insert({
            owner_id: ownerId,
            name: form.name.trim(),
            address: form.address.trim(),
            phone: form.phone.trim() || null,
            hours: hoursValue,
            is_on_call: Boolean(form.is_on_call),
            on_call_schedule: form.on_call_schedule.trim() || null,
            latitude: latitudeValue,
            longitude: longitudeValue
          });

        if (error) {
          if (error.status === 403 || error.code === '42501') {
            console.error('Pharmacy insert blocked by RLS:', error);
            const message = language === 'el'
              ? 'Δεν έχετε δικαίωμα να δημιουργήσετε φαρμακείο.'
              : 'You do not have permission to create a pharmacy.';
            setFormError(message);
            toast.error(message);
            return;
          }
          throw error;
        }

        toast.success(language === 'el' ? 'Το φαρμακείο δημιουργήθηκε.' : 'Pharmacy created.');
      }

      if (geocodeResult.status !== 'ok') {
        toast(language === 'el'
          ? 'Η διεύθυνση αποθηκεύτηκε, αλλά δεν εντοπίστηκε τοποθεσία.'
          : 'Address saved but location could not be detected.');
      }

      navigate('/pharmacist', { replace: true });
    } catch (err) {
      console.error('Pharmacy save failed:', err);
      const message = err?.message || (language === 'el' ? 'Κάτι πήγε στραβά.' : 'Something went wrong.');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacy-create-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">
            {language === 'el'
              ? (isEditMode ? 'Επεξεργασία Φαρμακείου' : 'Προσθήκη Φαρμακείου')
              : (isEditMode ? 'Edit Pharmacy' : 'Add Pharmacy')}
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <Card className="gradient-card rounded-xl shadow-sm border-pharma-grey-pale/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
              <Building2 className="w-5 h-5 text-pharma-teal" />
              {language === 'el' ? 'Στοιχεία Φαρμακείου' : 'Pharmacy Details'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {isEditMode && (
              <div className="rounded-lg border border-pharma-grey-pale/70 bg-white px-3 py-2 text-xs text-pharma-slate-grey">
                {language === 'el'
                  ? 'Έχετε ήδη φαρμακείο. Επεξεργάζεστε τα υπάρχοντα στοιχεία.'
                  : 'You already have a pharmacy. You are editing the existing details.'}
              </div>
            )}

            {formError && (
              <div className="rounded-lg border border-pharma-coral/40 bg-pharma-coral/10 px-3 py-2 text-sm text-pharma-coral">
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Όνομα *' : 'Name *'}
              </label>
              <Input
                value={form.name}
                onChange={handleChange('name')}
                placeholder={language === 'el' ? 'π.χ. Φαρμακείο Κέντρου' : 'e.g. City Pharmacy'}
                className={`rounded-xl ${errors.name ? 'border-pharma-coral' : ''}`}
                data-testid="pharmacy-name-input"
                disabled={loading}
              />
              {errors.name && (
                <p className="text-xs text-pharma-coral">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Διεύθυνση *' : 'Address *'}
              </label>
              <Input
                value={form.address}
                onChange={handleChange('address')}
                placeholder={language === 'el' ? 'Οδός, αριθμός, πόλη' : 'Street, number, city'}
                className={`rounded-xl ${errors.address ? 'border-pharma-coral' : ''}`}
                data-testid="pharmacy-address-input"
                disabled={loading}
              />
              {errors.address && (
                <p className="text-xs text-pharma-coral">{errors.address}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Τηλέφωνο' : 'Phone'}
              </label>
              <Input
                value={form.phone}
                onChange={handleChange('phone')}
                placeholder={language === 'el' ? 'π.χ. 2101234567' : 'e.g. +30 210 1234567'}
                className="rounded-xl"
                data-testid="pharmacy-phone-input"
                disabled={loading}
              />
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-pharma-charcoal">
                    {language === 'el' ? 'Ωράριο λειτουργίας' : 'Opening hours'}
                  </h3>
                  <p className="text-xs text-pharma-slate-grey">
                    {language === 'el' ? 'Ορίστε ώρες ανά ημέρα.' : 'Set opening hours per day.'}
                  </p>
                </div>
              </div>

              {legacyHours && (
                <div className="rounded-lg border border-pharma-coral/40 bg-pharma-coral/10 px-3 py-2 text-xs text-pharma-coral">
                  {language === 'el'
                    ? 'Εισαγωγή από παλιό κείμενο ωραρίου.'
                    : 'Imported from legacy hours text.'}
                  <div className="mt-1 text-sm text-pharma-charcoal">
                    {legacyHours}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {dayOrder.map((day) => {
                  const entry = hoursSchedule[day];
                  return (
                    <div key={day} className="flex flex-col gap-2 rounded-xl border border-pharma-grey-pale/60 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-pharma-charcoal">
                          {labels[day]}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-pharma-slate-grey">
                            {language === 'el' ? 'Κλειστό' : 'Closed'}
                          </span>
                          <Switch
                            checked={entry.closed}
                            onCheckedChange={(checked) => updateDay(day, {
                              closed: checked,
                              open: checked ? '' : entry.open,
                              close: checked ? '' : entry.close
                            })}
                            data-testid={`hours-closed-${day}`}
                            disabled={loading}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-pharma-slate-grey">
                            {language === 'el' ? 'Άνοιγμα' : 'Opens'}
                          </label>
                          <select
                            className="h-10 w-full rounded-xl border border-pharma-grey-pale bg-white px-3 text-sm text-pharma-charcoal"
                            value={entry.open}
                            onChange={(event) => updateDay(day, { open: event.target.value })}
                            disabled={loading || entry.closed}
                          >
                            <option value="">--</option>
                            {timeOptions.map((time) => (
                              <option key={`${day}-open-${time}`} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-pharma-slate-grey">
                            {language === 'el' ? 'Κλείσιμο' : 'Closes'}
                          </label>
                          <select
                            className="h-10 w-full rounded-xl border border-pharma-grey-pale bg-white px-3 text-sm text-pharma-charcoal"
                            value={entry.close}
                            onChange={(event) => updateDay(day, { close: event.target.value })}
                            disabled={loading || entry.closed}
                          >
                            <option value="">--</option>
                            {timeOptions.map((time) => (
                              <option key={`${day}-close-${time}`} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {errors.hours && (
                <p className="text-xs text-pharma-coral">{errors.hours}</p>
              )}
            </section>

            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Πρόγραμμα εφημερίας' : 'On-call schedule'}
              </label>
              <Textarea
                value={form.on_call_schedule}
                onChange={handleChange('on_call_schedule')}
                placeholder={language === 'el' ? 'Προσθέστε λεπτομέρειες εφημερίας' : 'Add on-call details'}
                className="rounded-xl"
                rows={3}
                data-testid="pharmacy-oncall-input"
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-pharma-grey-pale/60 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-pharma-teal" />
                <div>
                  <p className="text-sm text-pharma-charcoal">
                    {language === 'el' ? 'Σε εφημερία' : 'On duty'}
                  </p>
                  <p className="text-xs text-pharma-slate-grey">
                    {language === 'el' ? 'Εμφάνιση στις εφημερίες' : 'Visible in on-call list'}
                  </p>
                </div>
              </div>
              <Switch
                checked={form.is_on_call}
                onCheckedChange={(checked) => handleChange('is_on_call')(checked)}
                data-testid="pharmacy-oncall-toggle"
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl shadow-card border-pharma-grey-pale/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-pharma-slate-grey" />
            <p className="text-xs text-pharma-slate-grey">
              {language === 'el'
                ? 'Η επαλήθευση φαρμακείου γίνεται από το σύστημα και δεν είναι επεξεργάσιμη.'
                : 'Verification is system-managed and not editable.'}
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="rounded-full flex-1"
            onClick={() => navigate('/pharmacist')}
            disabled={saving}
          >
            {language === 'el' ? 'Ακύρωση' : 'Cancel'}
          </Button>
          <Button
            className="rounded-full flex-1 bg-pharma-teal hover:bg-pharma-teal/90"
            onClick={handleSave}
            disabled={saving || loading}
            data-testid="pharmacy-save-btn"
          >
            {saving
              ? (language === 'el' ? 'Αποθήκευση...' : 'Saving...')
              : (language === 'el' ? 'Αποθήκευση' : 'Save')}
          </Button>
        </div>
      </main>
    </div>
  );
}
