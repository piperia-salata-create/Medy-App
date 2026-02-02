import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Globe } from 'lucide-react';

const isDev = process.env.NODE_ENV !== 'production';

export default function VerifyOtpPage() {
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const email = new URLSearchParams(location.search).get('email') || '';

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!email) {
      toast.error(language === 'el' ? 'Λείπει το email επιβεβαίωσης.' : 'Missing confirmation email.');
      return;
    }

    if (code.length !== 6) {
      toast.error(language === 'el' ? 'Εισάγετε 6ψήφιο κωδικό.' : 'Enter the 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup'
      });

      if (verifyError) {
        toast.error(verifyError.message);
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        toast.error(sessionError.message);
        return;
      }

      if (!session) {
        toast.error(language === 'el' ? 'Δεν βρέθηκε ενεργή συνεδρία.' : 'No active session found.');
        return;
      }

      // Get pending profile from sessionStorage
      const pendingProfileRaw = sessionStorage.getItem('pendingProfile');
      let pendingProfile = null;
      
      if (pendingProfileRaw) {
        try {
          pendingProfile = JSON.parse(pendingProfileRaw);
        } catch (parseError) {
          console.error('Failed to parse pendingProfile:', parseError);
        }
      }

      // Fallback: if no pendingProfile, try to get role from user metadata
      const metadataRole = session.user.user_metadata?.role;
      const finalRole = pendingProfile?.role || metadataRole || 'patient';
      
      // Ensure role is valid
      const validRole = (finalRole === 'pharmacist') ? 'pharmacist' : 'patient';

      // Build profile data
      const profileData = {
        id: session.user.id,
        role: validRole,
        full_name: pendingProfile?.full_name || session.user.user_metadata?.full_name || '',
        pharmacy_name: pendingProfile?.pharmacy_name || session.user.user_metadata?.pharmacy_name || null,
        language: pendingProfile?.language || 'el',
        senior_mode: pendingProfile?.senior_mode || false,
        email: session.user.email
      };

      if (isDev) {
        console.log('Creating profile with role:', validRole, profileData);
      }

      // Upsert profile - this is the ONLY place profile gets created after OTP
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .upsert([profileData], { onConflict: 'id' })
        .select()
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
        toast.error(profileError.message);
        return;
      }

      if (isDev) {
        console.log('Profile created/updated:', profileRow);
      }
      sessionStorage.removeItem('pendingProfile');

      // CRITICAL: Route based on the SAVED profile role (source of truth)
      if (profileRow?.role === 'pharmacist') {
        navigate('/pharmacist');
      } else {
        navigate('/patient');
      }
    } catch (err) {
      console.error('OTP verification error:', err);
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      toast.error(language === 'el' ? 'Λείπει το email επιβεβαίωσης.' : 'Missing confirmation email.');
      return;
    }

    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(language === 'el' ? 'Ο κωδικός στάλθηκε ξανά.' : 'Code resent.');
    } catch (err) {
      toast.error(t('errorOccurred'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-pharma-ice-blue flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2 text-pharma-dark-slate hover:text-pharma-teal transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-heading font-semibold">{t('appName')}</span>
        </Link>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-[120px] rounded-full bg-white">
            <Globe className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="el">Ελληνικά</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md page-enter">
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardHeader className="text-center pb-2">
              <CardTitle className="font-heading text-2xl text-pharma-dark-slate">
                Επιβεβαίωση Email
              </CardTitle>
              <CardDescription className="text-pharma-slate-grey">
                Εισάγετε τον 6ψήφιο κωδικό που λάβατε στο email σας
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-pharma-charcoal">
                    Κωδικός OTP
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\\D/g, '').slice(0, 6))}
                    className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20"
                    autoComplete="one-time-code"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white font-medium shadow-button"
                >
                  {loading ? t('loading') : 'Επιβεβαίωση'}
                </Button>
              </form>

              <p className="text-center text-sm text-pharma-slate-grey pt-4">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="text-pharma-teal font-medium hover:underline"
                >
                  Επαναποστολή κωδικού
                </button>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
