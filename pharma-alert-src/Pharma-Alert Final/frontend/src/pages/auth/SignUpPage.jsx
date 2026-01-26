import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSeniorMode } from '../../contexts/SeniorModeContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Eye, EyeOff, User, Stethoscope, ArrowLeft, Globe } from 'lucide-react';

export default function SignUpPage() {
  const { t, language, setLanguage } = useLanguage();
  const { seniorMode } = useSeniorMode();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error(language === 'el' ? 'Οι κωδικοί δεν ταιριάζουν' : 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error(language === 'el' ? 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' : 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        toast.error(error.message);
      } else {
        const pendingProfile = {
          full_name: fullName,
          role: role === 'pharmacist' ? 'pharmacist_pending' : 'patient',
          pharmacy_name: role === 'pharmacist' ? pharmacyName : null,
          language,
          senior_mode: seniorMode
        };

        sessionStorage.setItem('pendingProfile', JSON.stringify(pendingProfile));
        toast.success(
          language === 'el' 
            ? 'Λογαριασμός δημιουργήθηκε! Ελέγξτε το email σας.' 
            : 'Account created! Check your email.'
        );
        navigate(`/verify-otp?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
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
          <SelectTrigger className="w-[120px] rounded-full bg-white" data-testid="language-select-signup">
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
          {step === 1 ? (
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardHeader className="text-center pb-2">
                <CardTitle className="font-heading text-2xl text-pharma-dark-slate">
                  {t('selectRole')}
                </CardTitle>
                <CardDescription className="text-pharma-slate-grey">
                  {t('createAccount')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <button
                  onClick={() => handleRoleSelect('patient')}
                  className="w-full p-6 rounded-2xl border-2 border-pharma-grey-pale bg-white hover:border-pharma-teal hover:shadow-card-hover transition-all group"
                  data-testid="role-patient-btn"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-pharma-ice-blue flex items-center justify-center group-hover:bg-pharma-teal/10 transition-colors">
                      <User className="w-7 h-7 text-pharma-teal" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-heading font-semibold text-pharma-dark-slate text-lg">
                        {t('patient')}
                      </h3>
                      <p className="text-pharma-slate-grey text-sm">
                        {t('rolePatientDesc')}
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleSelect('pharmacist')}
                  className="w-full p-6 rounded-2xl border-2 border-pharma-grey-pale bg-white hover:border-pharma-teal hover:shadow-card-hover transition-all group"
                  data-testid="role-pharmacist-btn"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-pharma-ice-blue flex items-center justify-center group-hover:bg-pharma-teal/10 transition-colors">
                      <Stethoscope className="w-7 h-7 text-pharma-teal" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-heading font-semibold text-pharma-dark-slate text-lg">
                        {t('pharmacist')}
                      </h3>
                      <p className="text-pharma-slate-grey text-sm">
                        {t('rolePharmacistDesc')}
                      </p>
                    </div>
                  </div>
                </button>

                <p className="text-center text-sm text-pharma-slate-grey pt-4">
                  {t('alreadyHaveAccount')}{' '}
                  <Link to="/signin" className="text-pharma-teal font-medium hover:underline">
                    {t('signIn')}
                  </Link>
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardHeader className="pb-2">
                <button 
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 text-pharma-slate-grey hover:text-pharma-teal transition-colors text-sm mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('back')}
                </button>
                <CardTitle className="font-heading text-2xl text-pharma-dark-slate">
                  {t('createAccount')}
                </CardTitle>
                <CardDescription className="text-pharma-slate-grey">
                  {role === 'pharmacist' ? t('pharmacist') : t('patient')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-pharma-charcoal">
                      {language === 'el' ? 'Ονοματεπώνυμο' : 'Full Name'}
                    </Label>
                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20"
                      required
                      data-testid="signup-fullname-input"
                    />
                  </div>

                  {role === 'pharmacist' && (
                    <div className="space-y-2">
                      <Label htmlFor="pharmacyName" className="text-pharma-charcoal">
                        {language === 'el' ? 'Όνομα Φαρμακείου' : 'Pharmacy Name'}
                      </Label>
                      <Input
                        id="pharmacyName"
                        type="text"
                        value={pharmacyName}
                        onChange={(e) => setPharmacyName(e.target.value)}
                        className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20"
                        required
                        data-testid="signup-pharmacy-input"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-pharma-charcoal">{t('email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20"
                      required
                      data-testid="signup-email-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-pharma-charcoal">{t('password')}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20 pr-12"
                        required
                        data-testid="signup-password-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-pharma-slate-grey hover:text-pharma-teal"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-pharma-charcoal">{t('confirmPassword')}</Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20"
                      required
                      data-testid="signup-confirm-password-input"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white font-medium shadow-button"
                    data-testid="signup-submit-btn"
                  >
                    {loading ? t('loading') : t('createAccount')}
                  </Button>
                </form>

                <p className="text-center text-sm text-pharma-slate-grey pt-4">
                  {t('alreadyHaveAccount')}{' '}
                  <Link to="/signin" className="text-pharma-teal font-medium hover:underline">
                    {t('signIn')}
                  </Link>
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
