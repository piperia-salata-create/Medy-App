import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Users, CheckCircle2, UserPlus, ArrowRight } from 'lucide-react';

const PharmacistConnectionsCardLazy = ({ connections, userId, language, onInvite }) => {
  return (
    <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale page-enter" style={{ animationDelay: '0.1s' }} data-testid="connections-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
          <Users className="w-5 h-5 text-pharma-steel-blue" />
          {language === 'el' ? 'Συνδέσεις Φαρμακοποιών' : 'Pharmacist Connections'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-pharma-ice-blue rounded-xl">
            <p className="text-2xl font-bold text-pharma-coral" data-testid="incoming-count">
              {connections.incoming}
            </p>
            <p className="text-xs text-pharma-slate-grey">
              {language === 'el' ? 'Εισερχόμενες' : 'Incoming'}
            </p>
          </div>
          <div className="text-center p-3 bg-pharma-ice-blue rounded-xl">
            <p className="text-2xl font-bold text-pharma-royal-blue" data-testid="outgoing-count">
              {connections.outgoing}
            </p>
            <p className="text-xs text-pharma-slate-grey">
              {language === 'el' ? 'Απεσταλμένες' : 'Outgoing'}
            </p>
          </div>
          <div className="text-center p-3 bg-pharma-ice-blue rounded-xl">
            <p className="text-2xl font-bold text-pharma-sea-green" data-testid="accepted-count">
              {connections.accepted}
            </p>
            <p className="text-xs text-pharma-slate-grey">
              {language === 'el' ? 'Ενεργές' : 'Active'}
            </p>
          </div>
        </div>

        {connections.recentAccepted.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-pharma-slate-grey uppercase">
              {language === 'el' ? 'Πρόσφατες' : 'Recent'}
            </p>
            {connections.recentAccepted.map((conn) => {
              const otherUser = conn.requester_pharmacist_id === userId ? conn.target : conn.requester;
              return (
                <div key={conn.id} className="flex items-center gap-2 p-2 bg-pharma-grey-pale/30 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-pharma-sea-green flex-shrink-0" />
                  <span className="text-sm text-pharma-charcoal truncate">
                    {otherUser?.full_name || otherUser?.pharmacy_name || 'Unknown'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1 rounded-full bg-pharma-teal hover:bg-pharma-teal/90 gap-2"
            onClick={onInvite}
            data-testid="invite-pharmacist-btn"
          >
            <UserPlus className="w-4 h-4" />
            {language === 'el' ? 'Πρόσκληση' : 'Invite'}
          </Button>
          <Link to="/pharmacist/connections" className="flex-1">
            <Button variant="outline" className="w-full rounded-full gap-2" data-testid="view-connections-btn">
              {language === 'el' ? 'Όλες' : 'View All'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default PharmacistConnectionsCardLazy;
