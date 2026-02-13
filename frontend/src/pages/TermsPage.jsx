import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../contexts/LanguageContext';

const termsCopy = {
  el: {
    title: 'Όροι Χρήσης',
    subtitle: 'Παρακαλούμε διαβάστε προσεκτικά τους όρους πριν χρησιμοποιήσετε την εφαρμογή Medy.',
    effectiveDate: 'Ημερομηνία ισχύος: 13 Φεβρουαρίου 2026',
    sections: [
      {
        heading: '1. Αποδοχή όρων',
        paragraphs: [
          'Με τη χρήση της εφαρμογής συμφωνείτε ότι δεσμεύεστε από τους παρόντες όρους.',
          'Αν δεν συμφωνείτε με κάποιον όρο, παρακαλούμε μην χρησιμοποιείτε την υπηρεσία.'
        ]
      },
      {
        heading: '2. Περιγραφή υπηρεσίας',
        paragraphs: [
          'Το Medy παρέχει πληροφορίες διαθεσιμότητας φαρμάκων και διευκολύνει την επικοινωνία μεταξύ ασθενών και φαρμακείων.',
          'Οι πληροφορίες διαθεσιμότητας μπορεί να αλλάξουν ανά πάσα στιγμή.'
        ]
      },
      {
        heading: '3. Ιατρική ευθύνη',
        paragraphs: [
          'Η εφαρμογή δεν παρέχει ιατρική διάγνωση ή ιατρική συμβουλή.',
          'Για οποιοδήποτε θέμα υγείας πρέπει να απευθύνεστε σε γιατρό ή φαρμακοποιό.'
        ]
      },
      {
        heading: '4. Υποχρεώσεις χρήστη',
        paragraphs: [
          'Ο χρήστης οφείλει να παρέχει ακριβείς πληροφορίες και να μην κάνει καταχρηστική χρήση της υπηρεσίας.',
          'Απαγορεύεται η χρήση της υπηρεσίας για παράνομες ή κακόβουλες ενέργειες.'
        ]
      },
      {
        heading: '5. Διαθεσιμότητα και αλλαγές',
        paragraphs: [
          'Διατηρούμε το δικαίωμα να τροποποιούμε ή να διακόπτουμε λειτουργίες της υπηρεσίας χωρίς προηγούμενη ειδοποίηση.',
          'Μπορούμε επίσης να ενημερώνουμε τους όρους χρήσης όταν απαιτείται.'
        ]
      },
      {
        heading: '6. Περιορισμός ευθύνης',
        paragraphs: [
          'Το Medy δεν ευθύνεται για άμεσες ή έμμεσες ζημίες από τη χρήση ή αδυναμία χρήσης της υπηρεσίας.',
          'Η τελική επιβεβαίωση διαθεσιμότητας και εκτέλεσης παραμένει ευθύνη του φαρμακείου και του χρήστη.'
        ]
      },
      {
        heading: '7. Επικοινωνία',
        paragraphs: [
          'Για τεχνικά ζητήματα χρησιμοποιήστε τη φόρμα "Αναφορά Σφάλματος".',
          'Θα εξετάζουμε κάθε αναφορά και θα προχωρούμε σε διορθωτικές ενέργειες όπου απαιτείται.'
        ]
      }
    ]
  },
  en: {
    title: 'Terms of Use',
    subtitle: 'Please read these terms carefully before using the Medy application.',
    effectiveDate: 'Effective date: February 13, 2026',
    sections: [
      {
        heading: '1. Acceptance of terms',
        paragraphs: [
          'By using the app, you agree to be bound by these terms.',
          'If you do not agree with any part, please do not use the service.'
        ]
      },
      {
        heading: '2. Service description',
        paragraphs: [
          'Medy provides medicine availability information and supports communication between patients and pharmacies.',
          'Availability data may change at any time.'
        ]
      },
      {
        heading: '3. Medical responsibility',
        paragraphs: [
          'The app does not provide medical diagnosis or medical advice.',
          'For any health issue, consult a doctor or pharmacist.'
        ]
      },
      {
        heading: '4. User obligations',
        paragraphs: [
          'Users must provide accurate information and avoid abusive use of the service.',
          'Illegal or malicious use of the platform is strictly prohibited.'
        ]
      },
      {
        heading: '5. Availability and changes',
        paragraphs: [
          'We may modify or discontinue parts of the service without prior notice.',
          'We may also update these terms when necessary.'
        ]
      },
      {
        heading: '6. Limitation of liability',
        paragraphs: [
          'Medy is not liable for direct or indirect damages arising from the use or inability to use the service.',
          'Final confirmation of availability and fulfillment remains the responsibility of the pharmacy and the user.'
        ]
      },
      {
        heading: '7. Contact',
        paragraphs: [
          'For technical issues, use the "Report a Bug" form.',
          'We review each report and apply corrective actions when needed.'
        ]
      }
    ]
  }
};

export default function TermsPage() {
  const { language } = useLanguage();
  const copy = useMemo(() => (language === 'el' ? termsCopy.el : termsCopy.en), [language]);

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
              <div className="w-11 h-11 rounded-xl bg-pharma-teal/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-pharma-teal" />
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
                  <div className="space-y-2 text-sm text-pharma-charcoal leading-relaxed">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

