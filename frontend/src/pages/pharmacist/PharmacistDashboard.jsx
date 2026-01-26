import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { StatusBadge, VerifiedBadge } from '../../components/ui/status-badge';
import { SkeletonMedicineCard, SkeletonList } from '../../components/ui/skeleton-loaders';
import { EmptyState } from '../../components/ui/empty-states';
import { toast } from 'sonner';
import { 
  Search, 
  Bell, 
  Settings, 
  LogOut,
  Pill,
  Package,
  TrendingUp,
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  Menu,
  X,
  RefreshCw,
  BarChart3
} from 'lucide-react';

export default function PharmacistDashboard() {
  const { user, profile, signOut, isVerifiedPharmacist } = useAuth();
  const { t, language } = useLanguage();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  const [pharmacy, setPharmacy] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [demandSignals, setDemandSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch pharmacist's pharmacy
  const fetchPharmacy = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('owner_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setPharmacy(data);
      return data;
    } catch (error) {
      console.error('Error fetching pharmacy:', error);
    }
  }, [user]);

  // Fetch pharmacy stock
  const fetchStock = useCallback(async (pharmacyId) => {
    try {
      const { data, error } = await supabase
        .from('pharmacy_stock')
        .select(`
          *,
          medicines (id, name, description, category)
        `)
        .eq('pharmacy_id', pharmacyId);

      if (error) throw error;
      setMedicines(data || []);
    } catch (error) {
      console.error('Error fetching stock:', error);
    }
  }, []);

  // Fetch demand signals
  const fetchDemandSignals = useCallback(async (pharmacyId) => {
    try {
      const { data, error } = await supabase
        .from('demand_signals')
        .select('*')
        .eq('pharmacy_id', pharmacyId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setDemandSignals(data || []);
    } catch (error) {
      console.error('Error fetching demand signals:', error);
    }
  }, []);

  // Update stock status
  const updateStockStatus = async (stockId, newStatus) => {
    try {
      const { error } = await supabase
        .from('pharmacy_stock')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', stockId);

      if (error) throw error;
      
      setMedicines(prev => 
        prev.map(m => m.id === stockId ? { ...m, status: newStatus } : m)
      );
      
      toast.success(language === 'el' ? 'Κατάσταση ενημερώθηκε' : 'Status updated');
    } catch (error) {
      toast.error(t('errorOccurred'));
    }
  };

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const pharmacyData = await fetchPharmacy();
      if (pharmacyData) {
        await Promise.all([
          fetchStock(pharmacyData.id),
          fetchDemandSignals(pharmacyData.id)
        ]);
      }
      setLoading(false);
    };
    init();
  }, [fetchPharmacy, fetchStock, fetchDemandSignals]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!pharmacy) return;

    const channel = supabase
      .channel('pharmacist_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'demand_signals', filter: `pharmacy_id=eq.${pharmacy.id}` },
        () => fetchDemandSignals(pharmacy.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacy, fetchDemandSignals]);

  // Filter medicines
  const filteredMedicines = medicines.filter(m => {
    const matchesSearch = m.medicines?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Show pending verification message
  if (isPendingPharmacist()) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue flex items-center justify-center p-4">
        <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-pharma-steel-blue/10 flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8 text-pharma-steel-blue" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-pharma-dark-slate mb-3">
              {t('pendingVerification')}
            </h2>
            <p className="text-pharma-slate-grey mb-6">
              {t('pendingVerificationDesc')}
            </p>
            <Button 
              variant="outline"
              className="rounded-full"
              onClick={handleSignOut}
            >
              {t('signOut')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="pharmacist-dashboard">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/pharmacist" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-pharma-teal flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-pharma-dark-slate hidden sm:block">
              {t('appName')}
            </span>
            {isVerifiedPharmacist() && <VerifiedBadge className="hidden sm:flex" />}
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-2">
            {isVerifiedPharmacist() && (
              <Link to="/pharmacist/inter-pharmacy">
                <Button variant="ghost" className="rounded-full gap-2" data-testid="nav-interpharmacy-btn">
                  <Users className="w-4 h-4" />
                  {t('interPharmacy')}
                </Button>
              </Link>
            )}
            <Link to="/pharmacist/analytics">
              <Button variant="ghost" className="rounded-full gap-2" data-testid="nav-analytics-btn">
                <BarChart3 className="w-4 h-4" />
                {t('analytics')}
              </Button>
            </Link>
            <Link to="/pharmacist/notifications" className="relative">
              <Button variant="ghost" className="rounded-full gap-2" data-testid="nav-notifications-btn">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-pharma-teal text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/pharmacist/settings">
              <Button variant="ghost" className="rounded-full" data-testid="nav-settings-btn">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              className="rounded-full text-pharma-slate-grey"
              onClick={handleSignOut}
              data-testid="nav-signout-btn"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-xl hover:bg-pharma-ice-blue"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-pharma-grey-pale p-4 space-y-2 animate-slide-up">
            {isVerifiedPharmacist() && (
              <Link to="/pharmacist/inter-pharmacy" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                  <Users className="w-5 h-5" />
                  {t('interPharmacy')}
                </Button>
              </Link>
            )}
            <Link to="/pharmacist/analytics" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <BarChart3 className="w-5 h-5" />
                {t('analytics')}
              </Button>
            </Link>
            <Link to="/pharmacist/notifications" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <Bell className="w-5 h-5" />
                {t('notifications')}
              </Button>
            </Link>
            <Link to="/pharmacist/settings" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl">
                <Settings className="w-5 h-5" />
                {t('settings')}
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 rounded-xl text-pharma-slate-grey"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              {t('signOut')}
            </Button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Welcome & Stats */}
        <section className="page-enter">
          <div className="mb-6">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-pharma-dark-slate mb-1">
              {pharmacy?.name || (language === 'el' ? 'Πίνακας Ελέγχου' : 'Dashboard')}
            </h1>
            <p className="text-pharma-slate-grey">
              {language === 'el' ? 'Διαχείριση αποθέματος φαρμακείου' : 'Manage pharmacy inventory'}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pharma-sea-green/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-pharma-sea-green" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-pharma-dark-slate">
                      {medicines.filter(m => m.status === 'available').length}
                    </p>
                    <p className="text-sm text-pharma-slate-grey">{t('available')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pharma-steel-blue/10 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-pharma-steel-blue" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-pharma-dark-slate">
                      {medicines.filter(m => m.status === 'limited').length}
                    </p>
                    <p className="text-sm text-pharma-slate-grey">{t('limited')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pharma-slate-grey/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-pharma-slate-grey" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-pharma-dark-slate">
                      {medicines.filter(m => m.status === 'unavailable').length}
                    </p>
                    <p className="text-sm text-pharma-slate-grey">{t('unavailable')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pharma-royal-blue/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-pharma-royal-blue" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-pharma-dark-slate">
                      {demandSignals.length}
                    </p>
                    <p className="text-sm text-pharma-slate-grey">{t('demandSignals')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Stock Management */}
        <section className="page-enter" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h2 className="font-heading text-xl font-semibold text-pharma-dark-slate">
              {t('stockManagement')}
            </h2>
            <div className="flex gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pharma-slate-grey" />
                <Input
                  placeholder={t('search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 rounded-xl border-pharma-grey-pale"
                  data-testid="stock-search-input"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] rounded-xl" data-testid="status-filter-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all')}</SelectItem>
                  <SelectItem value="available">{t('available')}</SelectItem>
                  <SelectItem value="limited">{t('limited')}</SelectItem>
                  <SelectItem value="unavailable">{t('unavailable')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <SkeletonList count={5} CardComponent={SkeletonMedicineCard} />
          ) : filteredMedicines.length === 0 ? (
            <EmptyState 
              icon={Package}
              title={language === 'el' ? 'Δεν βρέθηκαν φάρμακα' : 'No medicines found'}
              description={language === 'el' 
                ? 'Προσθέστε φάρμακα στο απόθεμά σας'
                : 'Add medicines to your inventory'}
            />
          ) : (
            <div className="space-y-3">
              {filteredMedicines.map((stock) => (
                <Card 
                  key={stock.id}
                  className="bg-white rounded-2xl shadow-card border-pharma-grey-pale"
                  data-testid={`stock-card-${stock.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-heading font-semibold text-pharma-dark-slate text-lg">
                          {stock.medicines?.name || 'Unknown Medicine'}
                        </h3>
                        <p className="text-sm text-pharma-slate-grey">
                          {stock.medicines?.description || stock.medicines?.category}
                        </p>
                        {stock.quantity !== null && (
                          <p className="text-sm text-pharma-charcoal mt-1">
                            {language === 'el' ? 'Ποσότητα:' : 'Quantity:'} {stock.quantity}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <StatusBadge status={stock.status} />
                        <Select 
                          value={stock.status} 
                          onValueChange={(value) => updateStockStatus(stock.id, value)}
                        >
                          <SelectTrigger 
                            className="w-[160px] rounded-xl"
                            data-testid={`status-select-${stock.id}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available">{t('available')}</SelectItem>
                            <SelectItem value="limited">{t('limited')}</SelectItem>
                            <SelectItem value="unavailable">{t('unavailable')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Demand Signals */}
        {demandSignals.length > 0 && (
          <section className="page-enter" style={{ animationDelay: '0.2s' }}>
            <h2 className="font-heading text-xl font-semibold text-pharma-dark-slate mb-4">
              {t('demandSignals')}
            </h2>
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-5">
                <div className="space-y-3">
                  {demandSignals.map((signal) => (
                    <div 
                      key={signal.id}
                      className="flex items-center justify-between p-3 bg-pharma-ice-blue rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-pharma-royal-blue" />
                        <div>
                          <p className="font-medium text-pharma-charcoal">{signal.medicine_name}</p>
                          <p className="text-sm text-pharma-slate-grey">
                            {signal.request_count} {language === 'el' ? 'αιτήματα' : 'requests'}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-pharma-slate-grey">
                        {new Date(signal.created_at).toLocaleDateString(language === 'el' ? 'el-GR' : 'en-US')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
