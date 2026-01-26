import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft, Globe } from 'lucide-react';

export default function SignInPage() {
  const { signIn, profile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data, error } = await signIn(email, password);
      
      if (error) {
        toast.error(error.message);
      } else if (data?.user) {
        toast.success(language === 'el' ? 'Καλώς ήρθατε!' : 'Welcome back!');
        // Navigation is handled by PublicRoute redirect after profile loads
        // The AuthContext fetchProfile will set the profile, triggering redirect
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
          <SelectTrigger className="w-[120px] rounded-full bg-white" data-testid="language-select-signin">
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
                {t('signIn')}
              </CardTitle>
              <CardDescription className="text-pharma-slate-grey">
                {language === 'el' 
                  ? 'Συνδεθείτε στον λογαριασμό σας' 
                  : 'Sign in to your account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-pharma-charcoal">{t('email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20"
                    placeholder="email@example.com"
                    required
                    data-testid="signin-email-input"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password" className="text-pharma-charcoal">{t('password')}</Label>
                    <Link 
                      to="/forgot-password" 
                      className="text-sm text-pharma-teal hover:underline"
                    >
                      {t('forgotPassword')}
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 rounded-xl border-pharma-silver focus:border-pharma-teal focus:ring-pharma-teal/20 pr-12"
                      required
                      data-testid="signin-password-input"
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

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-full bg-pharma-teal hover:bg-pharma-teal/90 text-white font-medium shadow-button"
                  data-testid="signin-submit-btn"
                >
                  {loading ? t('loading') : t('signIn')}
                </Button>
              </form>

              <p className="text-center text-sm text-pharma-slate-grey pt-6">
                {t('dontHaveAccount')}{' '}
                <Link to="/signup" className="text-pharma-teal font-medium hover:underline">
                  {t('signUp')}
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
