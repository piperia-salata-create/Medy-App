import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Clock,
  Plus,
  Pill,
  Trash2,
  Edit2,
  Bell,
  Check
} from 'lucide-react';

const isDev = process.env.NODE_ENV !== 'production';

export default function RemindersPage() {
  const { user, session, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState('08:00');

  // Fetch reminders
  const fetchReminders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('medication_reminders')
        .select('*')
        .eq('user_id', user.id)
        .order('time', { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isDev) {
      console.log('RemindersPage init', { user, session, authLoading });
    }
    if (authLoading) return;
    fetchReminders();
  }, [authLoading, fetchReminders, user, session]);

  // Reset form
  const resetForm = () => {
    setMedicineName('');
    setDosage('');
    setFrequency('daily');
    setTime('08:00');
    setEditingReminder(null);
  };

  // Open dialog for new reminder
  const openNewReminderDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  // Open dialog for editing
  const openEditDialog = (reminder) => {
    setEditingReminder(reminder);
    setMedicineName(reminder.medicine_name);
    setDosage(reminder.dosage || '');
    setFrequency(reminder.frequency || 'daily');
    setTime(reminder.time || '08:00');
    setDialogOpen(true);
  };

  // Save reminder
  const saveReminder = async () => {
    if (!medicineName.trim()) {
      toast.error(language === 'el' ? 'Εισάγετε όνομα φαρμάκου' : 'Enter medicine name');
      return;
    }

    setSaving(true);
    try {
      const reminderData = {
        user_id: user.id,
        medicine_name: medicineName.trim(),
        dosage: dosage.trim() || null,
        frequency,
        time,
        is_active: true
      };

      if (editingReminder) {
        // Update existing
        const { error } = await supabase
          .from('medication_reminders')
          .update(reminderData)
          .eq('id', editingReminder.id);

        if (error) throw error;
        toast.success(language === 'el' ? 'Υπενθύμιση ενημερώθηκε' : 'Reminder updated');
      } else {
        // Create new
        const { error } = await supabase
          .from('medication_reminders')
          .insert([reminderData]);

        if (error) throw error;
        toast.success(language === 'el' ? 'Υπενθύμιση δημιουργήθηκε' : 'Reminder created');
      }

      setDialogOpen(false);
      resetForm();
      fetchReminders();
    } catch (error) {
      toast.error(t('errorOccurred'));
    } finally {
      setSaving(false);
    }
  };

  // Delete reminder
  const deleteReminder = async (reminderId) => {
    try {
      const { error } = await supabase
        .from('medication_reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;
      
      setReminders(prev => prev.filter(r => r.id !== reminderId));
      toast.success(language === 'el' ? 'Υπενθύμιση διαγράφηκε' : 'Reminder deleted');
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  // Toggle reminder active state
  const toggleReminderActive = async (reminder) => {
    try {
      const { error } = await supabase
        .from('medication_reminders')
        .update({ is_active: !reminder.is_active })
        .eq('id', reminder.id);

      if (error) throw error;
      
      setReminders(prev => 
        prev.map(r => r.id === reminder.id ? { ...r, is_active: !r.is_active } : r)
      );
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  const frequencyLabels = {
    daily: language === 'el' ? 'Καθημερινά' : 'Daily',
    weekly: language === 'el' ? 'Εβδομαδιαία' : 'Weekly',
    twice_daily: language === 'el' ? 'Δύο φορές/ημέρα' : 'Twice daily',
    as_needed: language === 'el' ? 'Όταν χρειάζεται' : 'As needed'
  };

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="reminders-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-pharma-grey-pale/50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/patient">
              <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-pharma-teal" />
              <h1 className="font-heading font-semibold text-pharma-dark-slate">
                {t('medicationReminders')}
              </h1>
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-full h-9 gap-1.5 gradient-teal text-white"
            onClick={openNewReminderDialog}
            data-testid="add-reminder-btn"
          >
            <Plus className="w-4 h-4" />
            {t('addReminder')}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-xl">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reminders.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={language === 'el' ? 'Δεν έχετε υπενθυμίσεις' : 'No reminders yet'}
            description={language === 'el' 
              ? 'Δημιουργήστε υπενθυμίσεις για τα φάρμακά σας'
              : 'Create reminders for your medications'}
            action={openNewReminderDialog}
            actionLabel={t('addReminder')}
          />
        ) : (
          <div className="space-y-3 page-enter">
            {reminders.map((reminder) => (
              <Card 
                key={reminder.id}
                className={`gradient-card rounded-xl shadow-sm border transition-all ${
                  reminder.is_active 
                    ? 'border-pharma-grey-pale/50' 
                    : 'border-pharma-grey-pale/30 opacity-60'
                }`}
                data-testid={`reminder-card-${reminder.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleReminderActive(reminder)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        reminder.is_active 
                          ? 'bg-pharma-teal/10 text-pharma-teal' 
                          : 'bg-pharma-grey-pale text-pharma-slate-grey'
                      }`}
                    >
                      {reminder.is_active ? (
                        <Bell className="w-5 h-5" />
                      ) : (
                        <Check className="w-5 h-5" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className={`font-heading font-semibold ${
                            reminder.is_active ? 'text-pharma-dark-slate' : 'text-pharma-slate-grey'
                          }`}>
                            {reminder.medicine_name}
                          </h3>
                          {reminder.dosage && (
                            <p className="text-xs text-pharma-slate-grey mt-0.5">
                              {reminder.dosage}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg h-8 w-8 p-0"
                            onClick={() => openEditDialog(reminder)}
                            data-testid={`edit-reminder-${reminder.id}`}
                          >
                            <Edit2 className="w-4 h-4 text-pharma-slate-grey" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg h-8 w-8 p-0 text-pharma-slate-grey hover:text-red-500"
                            onClick={() => deleteReminder(reminder.id)}
                            data-testid={`delete-reminder-${reminder.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-sm font-medium text-pharma-teal bg-pharma-teal/10 px-2 py-0.5 rounded-full">
                          {reminder.time}
                        </span>
                        <span className="text-xs text-pharma-slate-grey">
                          {frequencyLabels[reminder.frequency] || reminder.frequency}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-pharma-dark-slate">
              {editingReminder 
                ? (language === 'el' ? 'Επεξεργασία Υπενθύμισης' : 'Edit Reminder')
                : t('addReminder')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Όνομα Φαρμάκου' : 'Medicine Name'} *
              </label>
              <Input
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                placeholder={language === 'el' ? 'π.χ. Depon 500mg' : 'e.g. Aspirin 500mg'}
                className="rounded-lg h-11"
                data-testid="reminder-medicine-input"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-pharma-charcoal">
                {language === 'el' ? 'Δοσολογία' : 'Dosage'}
              </label>
              <Input
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder={language === 'el' ? 'π.χ. 1 δισκίο' : 'e.g. 1 tablet'}
                className="rounded-lg h-11"
                data-testid="reminder-dosage-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-pharma-charcoal">
                  {t('reminderTime')}
                </label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-lg h-11"
                  data-testid="reminder-time-input"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-pharma-charcoal">
                  {t('reminderFrequency')}
                </label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger className="rounded-lg h-11" data-testid="reminder-frequency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{frequencyLabels.daily}</SelectItem>
                    <SelectItem value="twice_daily">{frequencyLabels.twice_daily}</SelectItem>
                    <SelectItem value="weekly">{frequencyLabels.weekly}</SelectItem>
                    <SelectItem value="as_needed">{frequencyLabels.as_needed}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setDialogOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              className="rounded-full gradient-teal text-white"
              onClick={saveReminder}
              disabled={saving}
              data-testid="save-reminder-btn"
            >
              {saving ? t('loading') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
