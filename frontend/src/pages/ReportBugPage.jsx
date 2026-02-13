import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

const initialFormState = {
  name: '',
  email: '',
  page_url: '',
  bug_title: '',
  steps: '',
  expected_result: '',
  actual_result: '',
  severity: 'medium',
  device_info: ''
};

const copyByLanguage = {
  el: {
    title: 'Αναφορά Σφάλματος',
    subtitle: 'Στείλτε μας το πρόβλημα και η ομάδα θα το αξιολογήσει άμεσα.',
    directionsTitle: 'Οδηγίες για καλύτερη αναφορά',
    directions: [
      'Περιγράψτε με σαφήνεια τι προσπαθούσατε να κάνετε.',
      'Γράψτε τα βήματα που ακολουθήσατε πριν εμφανιστεί το πρόβλημα.',
      'Σημειώστε τι περιμένατε να συμβεί και τι συνέβη τελικά.',
      'Προσθέστε πληροφορίες συσκευής/φυλλομετρητή αν είναι διαθέσιμες.'
    ],
    fields: {
      name: 'Όνομα',
      email: 'Email',
      pageUrl: 'Σελίδα όπου εμφανίστηκε',
      bugTitle: 'Σύντομος τίτλος προβλήματος',
      steps: 'Βήματα αναπαραγωγής',
      expected: 'Αναμενόμενο αποτέλεσμα',
      actual: 'Πραγματικό αποτέλεσμα',
      severity: 'Σοβαρότητα',
      deviceInfo: 'Συσκευή / Browser (προαιρετικό)'
    },
    placeholders: {
      pageUrl: 'π.χ. /patient/pharmacies',
      bugTitle: 'π.χ. Το κουμπί Αποστολή δεν ανταποκρίνεται',
      steps: '1. Πήγα στη σελίδα ...\n2. Πάτησα ...\n3. Εμφανίστηκε ...',
      expected: 'Τι έπρεπε να συμβεί;',
      actual: 'Τι συνέβη πραγματικά;',
      deviceInfo: 'π.χ. Windows 11, Chrome 140'
    },
    severityOptions: {
      low: 'Χαμηλή',
      medium: 'Μεσαία',
      high: 'Υψηλή',
      critical: 'Κρίσιμη'
    },
    submit: 'Αποστολή Αναφοράς',
    sending: 'Αποστολή...',
    successTitle: 'Η αναφορά καταχωρήθηκε',
    successDesc: 'Ευχαριστούμε. Θα αξιολογήσουμε την αναφορά και θα προχωρήσουμε σε διορθώσεις.',
    backHome: 'Επιστροφή στην αρχική',
    accessNote: 'Οι αναφορές αποθηκεύονται στη φόρμα της εφαρμογής για άμεση διαχείριση.'
  },
  en: {
    title: 'Report a Bug',
    subtitle: 'Send us the issue and the team will review it promptly.',
    directionsTitle: 'Tips for a useful report',
    directions: [
      'Clearly describe what you were trying to do.',
      'List the exact steps before the issue appeared.',
      'State what you expected versus what actually happened.',
      'Add device/browser details when available.'
    ],
    fields: {
      name: 'Name',
      email: 'Email',
      pageUrl: 'Page where it happened',
      bugTitle: 'Short issue title',
      steps: 'Steps to reproduce',
      expected: 'Expected result',
      actual: 'Actual result',
      severity: 'Severity',
      deviceInfo: 'Device / Browser (optional)'
    },
    placeholders: {
      pageUrl: 'e.g. /patient/pharmacies',
      bugTitle: 'e.g. Send button does not respond',
      steps: '1. I opened ...\n2. I clicked ...\n3. Then ...',
      expected: 'What should have happened?',
      actual: 'What happened instead?',
      deviceInfo: 'e.g. Windows 11, Chrome 140'
    },
    severityOptions: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical'
    },
    submit: 'Submit Report',
    sending: 'Submitting...',
    successTitle: 'Report submitted',
    successDesc: 'Thank you. We will review your report and take action.',
    backHome: 'Back to home',
    accessNote: 'Reports are stored in the application form for immediate management.'
  }
};

const encodeFormData = (data) => Object.keys(data)
  .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key] ?? '')}`)
  .join('&');

export default function ReportBugPage() {
  const { language } = useLanguage();
  const copy = useMemo(() => (language === 'el' ? copyByLanguage.el : copyByLanguage.en), [language]);
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const setField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData({
          'form-name': 'bug-report',
          ...formData
        })
      });
      if (!response.ok) {
        throw new Error(`Bug form submit failed: ${response.status}`);
      }
      setSubmitted(true);
      setFormData(initialFormState);
    } catch (error) {
      setSubmitError(language === 'el'
        ? 'Αποτυχία αποστολής. Προσπαθήστε ξανά.'
        : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-pharma-ice-blue">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-pharma-grey-pale/60">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0" aria-label={language === 'el' ? 'Πίσω' : 'Back'}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-heading font-semibold text-pharma-dark-slate">{copy.title}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
          <Card className="rounded-2xl border border-pharma-grey-pale/70 shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-start gap-3 mb-6">
                <div className="w-11 h-11 rounded-xl bg-pharma-coral/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-pharma-coral" />
                </div>
                <div>
                  <h2 className="font-heading text-2xl font-bold text-pharma-dark-slate">{copy.title}</h2>
                  <p className="text-sm text-pharma-slate-grey mt-1">{copy.subtitle}</p>
                </div>
              </div>

              {submitted ? (
                <div className="rounded-xl border border-pharma-sea-green/30 bg-pharma-sea-green/5 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-pharma-sea-green mt-0.5" />
                    <div>
                      <p className="font-medium text-pharma-dark-slate">{copy.successTitle}</p>
                      <p className="text-sm text-pharma-slate-grey mt-1">{copy.successDesc}</p>
                      <div className="mt-4">
                        <Link to="/">
                          <Button size="sm" className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90">
                            {copy.backHome}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form
                  name="bug-report"
                  method="POST"
                  data-netlify="true"
                  netlify-honeypot="bot-field"
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <input type="hidden" name="form-name" value="bug-report" />
                  <p className="hidden">
                    <label>
                      Do not fill this out:
                      <input name="bot-field" onChange={() => {}} />
                    </label>
                  </p>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="bug-name" className="text-sm text-pharma-charcoal">{copy.fields.name}</label>
                      <Input
                        id="bug-name"
                        name="name"
                        value={formData.name}
                        onChange={(event) => setField('name', event.target.value)}
                        required
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bug-email" className="text-sm text-pharma-charcoal">{copy.fields.email}</label>
                      <Input
                        id="bug-email"
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={(event) => setField('email', event.target.value)}
                        required
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="bug-page" className="text-sm text-pharma-charcoal">{copy.fields.pageUrl}</label>
                    <Input
                      id="bug-page"
                      name="page_url"
                      value={formData.page_url}
                      onChange={(event) => setField('page_url', event.target.value)}
                      placeholder={copy.placeholders.pageUrl}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="bug-title" className="text-sm text-pharma-charcoal">{copy.fields.bugTitle}</label>
                    <Input
                      id="bug-title"
                      name="bug_title"
                      value={formData.bug_title}
                      onChange={(event) => setField('bug_title', event.target.value)}
                      placeholder={copy.placeholders.bugTitle}
                      required
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="bug-steps" className="text-sm text-pharma-charcoal">{copy.fields.steps}</label>
                    <Textarea
                      id="bug-steps"
                      name="steps"
                      value={formData.steps}
                      onChange={(event) => setField('steps', event.target.value)}
                      placeholder={copy.placeholders.steps}
                      rows={4}
                      required
                      className="rounded-xl"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="bug-expected" className="text-sm text-pharma-charcoal">{copy.fields.expected}</label>
                      <Textarea
                        id="bug-expected"
                        name="expected_result"
                        value={formData.expected_result}
                        onChange={(event) => setField('expected_result', event.target.value)}
                        placeholder={copy.placeholders.expected}
                        rows={3}
                        required
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bug-actual" className="text-sm text-pharma-charcoal">{copy.fields.actual}</label>
                      <Textarea
                        id="bug-actual"
                        name="actual_result"
                        value={formData.actual_result}
                        onChange={(event) => setField('actual_result', event.target.value)}
                        placeholder={copy.placeholders.actual}
                        rows={3}
                        required
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="bug-severity" className="text-sm text-pharma-charcoal">{copy.fields.severity}</label>
                      <select
                        id="bug-severity"
                        name="severity"
                        value={formData.severity}
                        onChange={(event) => setField('severity', event.target.value)}
                        className="flex h-11 w-full rounded-xl border border-pharma-slate-grey/35 bg-white px-3 text-sm text-pharma-charcoal focus:outline-none focus:ring-2 focus:ring-pharma-teal/30"
                      >
                        <option value="low">{copy.severityOptions.low}</option>
                        <option value="medium">{copy.severityOptions.medium}</option>
                        <option value="high">{copy.severityOptions.high}</option>
                        <option value="critical">{copy.severityOptions.critical}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bug-device" className="text-sm text-pharma-charcoal">{copy.fields.deviceInfo}</label>
                      <Input
                        id="bug-device"
                        name="device_info"
                        value={formData.device_info}
                        onChange={(event) => setField('device_info', event.target.value)}
                        placeholder={copy.placeholders.deviceInfo}
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  {submitError && (
                    <p className="text-sm text-pharma-coral">{submitError}</p>
                  )}

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 px-6"
                  >
                    {isSubmitting ? copy.sending : copy.submit}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-pharma-grey-pale/70 shadow-sm h-fit">
            <CardContent className="p-6">
              <h3 className="font-semibold text-pharma-dark-slate mb-3">{copy.directionsTitle}</h3>
              <ul className="space-y-2 text-sm text-pharma-charcoal leading-relaxed list-disc list-inside">
                {copy.directions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <div className="mt-5 rounded-xl border border-pharma-teal/20 bg-pharma-teal/5 p-3">
                <p className="text-xs text-pharma-slate-grey">{copy.accessNote}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
