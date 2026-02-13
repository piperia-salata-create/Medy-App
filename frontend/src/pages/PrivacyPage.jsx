import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../contexts/LanguageContext';

const privacyCopy = {
  el: {
    title: 'Πολιτική Απορρήτου',
    subtitle: 'Η προστασία των προσωπικών σας δεδομένων είναι βασική προτεραιότητα του Medy.',
    effectiveDate: 'Ημερομηνία ισχύος: 13 Φεβρουαρίου 2026',
    sections: [
      {
        heading: '1. Ποια δεδομένα συλλέγουμε',
        items: [
          'Στοιχεία λογαριασμού (όνομα, email, ρόλος χρήστη).',
          'Στοιχεία αιτημάτων φαρμάκων που δημιουργείτε μέσα στην εφαρμογή.',
          'Τεχνικά δεδομένα λειτουργίας για τη βελτίωση της αξιοπιστίας της υπηρεσίας.'
        ]
      },
      {
        heading: '2. Πώς χρησιμοποιούμε τα δεδομένα',
        items: [
          'Για την εκτέλεση των βασικών λειτουργιών της εφαρμογής.',
          'Για την ενημέρωση σχετικά με την κατάσταση των αιτημάτων σας.',
          'Για βελτίωση ασφάλειας, απόδοσης και ποιότητας υπηρεσίας.'
        ]
      },
      {
        heading: '3. Νομική βάση επεξεργασίας',
        items: [
          'Εκτέλεση της παρεχόμενης υπηρεσίας.',
          'Συμμόρφωση με νομικές υποχρεώσεις όπου απαιτείται.',
          'Έννομο συμφέρον για ασφάλεια και αποτροπή κατάχρησης.'
        ]
      },
      {
        heading: '4. Κοινοποίηση δεδομένων',
        items: [
          'Δεν πωλούμε προσωπικά δεδομένα σε τρίτους.',
          'Περιορισμένη διαβίβαση μπορεί να γίνει μόνο σε συνεργάτες υποδομής (π.χ. φιλοξενία) για τη λειτουργία της υπηρεσίας.',
          'Η κοινοποίηση γίνεται μόνο όταν είναι απαραίτητη και με κατάλληλα μέτρα προστασίας.'
        ]
      },
      {
        heading: '5. Χρόνος διατήρησης',
        items: [
          'Τα δεδομένα διατηρούνται μόνο για όσο απαιτείται για τη λειτουργία της υπηρεσίας ή για νομικούς λόγους.',
          'Μπορείτε να ζητήσετε διαγραφή λογαριασμού, σύμφωνα με τις ισχύουσες υποχρεώσεις τήρησης.'
        ]
      },
      {
        heading: '6. Δικαιώματα χρήστη',
        items: [
          'Δικαίωμα πρόσβασης, διόρθωσης και διαγραφής προσωπικών δεδομένων.',
          'Δικαίωμα περιορισμού ή εναντίωσης στην επεξεργασία όπου εφαρμόζεται.',
          'Δικαίωμα υποβολής καταγγελίας στην αρμόδια αρχή προστασίας δεδομένων.'
        ]
      },
      {
        heading: '7. Ασφάλεια',
        items: [
          'Εφαρμόζουμε οργανωτικά και τεχνικά μέτρα προστασίας.',
          'Κανένα σύστημα δεν είναι απολύτως απρόσβλητο, αλλά η ασφάλεια παραμένει συνεχής προτεραιότητα.'
        ]
      }
    ]
  },
  en: {
    title: 'Privacy Policy',
    subtitle: 'Protecting your personal data is a core priority for Medy.',
    effectiveDate: 'Effective date: February 13, 2026',
    sections: [
      {
        heading: '1. Data we collect',
        items: [
          'Account details (name, email, user role).',
          'Medicine request data created inside the app.',
          'Operational technical data used to improve service reliability.'
        ]
      },
      {
        heading: '2. How we use data',
        items: [
          'To provide core application functionality.',
          'To inform you about request status updates.',
          'To improve security, performance, and service quality.'
        ]
      },
      {
        heading: '3. Legal basis',
        items: [
          'Performance of the provided service.',
          'Compliance with legal obligations where required.',
          'Legitimate interest for security and abuse prevention.'
        ]
      },
      {
        heading: '4. Data sharing',
        items: [
          'We do not sell personal data to third parties.',
          'Limited sharing may occur only with infrastructure providers (e.g. hosting) required to operate the service.',
          'Any sharing is limited to what is necessary and protected by appropriate safeguards.'
        ]
      },
      {
        heading: '5. Data retention',
        items: [
          'Data is retained only for as long as needed for service operation or legal requirements.',
          'You may request account deletion, subject to applicable legal retention obligations.'
        ]
      },
      {
        heading: '6. User rights',
        items: [
          'Right to access, correct, and delete personal data.',
          'Right to restrict or object to processing where applicable.',
          'Right to lodge a complaint with the relevant data protection authority.'
        ]
      },
      {
        heading: '7. Security',
        items: [
          'We apply organizational and technical safeguards.',
          'No system is completely immune to risk, but security remains a continuous priority.'
        ]
      }
    ]
  }
};

export default function PrivacyPage() {
  const { language } = useLanguage();
  const copy = useMemo(() => (language === 'el' ? privacyCopy.el : privacyCopy.en), [language]);

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
        <Card className="rounded-2xl border border-pharma-grey-pale/70 shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-pharma-royal-blue/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-pharma-royal-blue" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-bold text-pharma-dark-slate">{copy.title}</h2>
                <p className="text-sm text-pharma-slate-grey mt-1">{copy.subtitle}</p>
                <p className="text-xs text-pharma-slate-grey mt-2">{copy.effectiveDate}</p>
              </div>
            </div>

            <div className="space-y-6">
              {copy.sections.map((section) => (
                <section key={section.heading}>
                  <h3 className="font-semibold text-pharma-dark-slate mb-2">{section.heading}</h3>
                  <ul className="list-disc list-inside space-y-2 text-sm text-pharma-charcoal leading-relaxed">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

