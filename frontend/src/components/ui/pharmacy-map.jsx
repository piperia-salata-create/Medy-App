import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateDistance, formatDistance } from '../../lib/geoUtils';
import { Button } from './button';
import { StatusBadge, OnCallBadge } from './status-badge';
import { Phone, Navigation, MapPin, Pill } from 'lucide-react';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom pharmacy marker icon
const createPharmacyIcon = (isOnCall = false) => {
  return L.divIcon({
    className: 'pharmacy-marker',
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: ${isOnCall ? 'linear-gradient(135deg, #3B4C9B, #2C3E50)' : 'linear-gradient(135deg, #008B8B, #006666)'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,139,139,0.3);
        border: 2px solid white;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

// User location marker
const userLocationIcon = L.divIcon({
  className: 'user-marker',
  html: `
    <div style="
      width: 20px;
      height: 20px;
      background: #3B4C9B;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(59,76,155,0.4);
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Component to handle map center updates
const MapCenterController = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  
  return null;
};

export const PharmacyMap = ({ 
  pharmacies = [], 
  userLocation = null, 
  onPharmacyClick,
  height = '400px',
  className = ''
}) => {
  const { t, language } = useLanguage();
  const [mapCenter, setMapCenter] = useState([37.9838, 23.7275]); // Athens default
  const [mapZoom] = useState(13);

  useEffect(() => {
    if (userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
    } else if (pharmacies.length > 0 && pharmacies[0].latitude) {
      setMapCenter([pharmacies[0].latitude, pharmacies[0].longitude]);
    }
  }, [userLocation, pharmacies]);

  // Open in external navigation
  const openNavigation = (pharmacy) => {
    const address = encodeURIComponent(pharmacy.address);
    // Try to detect if on mobile for app deep links
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      // Use geo: URI for mobile apps
      if (pharmacy.latitude && pharmacy.longitude) {
        window.open(`geo:${pharmacy.latitude},${pharmacy.longitude}?q=${address}`, '_blank');
      } else {
        window.open(`https://www.openstreetmap.org/search?query=${address}`, '_blank');
      }
    } else {
      // Desktop: open OpenStreetMap
      if (pharmacy.latitude && pharmacy.longitude) {
        window.open(`https://www.openstreetmap.org/?mlat=${pharmacy.latitude}&mlon=${pharmacy.longitude}&zoom=17`, '_blank');
      } else {
        window.open(`https://www.openstreetmap.org/search?query=${address}`, '_blank');
      }
    }
  };

  return (
    <div className={`rounded-2xl overflow-hidden shadow-lg ${className}`} style={{ height }}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapCenterController center={mapCenter} />
        
        {/* User Location Marker */}
        {userLocation && (
          <Marker 
            position={[userLocation.lat, userLocation.lng]} 
            icon={userLocationIcon}
          >
            <Popup>
              <div className="text-center py-1">
                <p className="font-medium text-pharma-dark-slate">
                  {language === 'el' ? 'Η τοποθεσία σας' : 'Your Location'}
                </p>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Pharmacy Markers */}
        {pharmacies.map((pharmacy) => {
          if (!pharmacy.latitude || !pharmacy.longitude) return null;
          
          const distance = userLocation 
            ? calculateDistance(userLocation.lat, userLocation.lng, pharmacy.latitude, pharmacy.longitude)
            : null;
          
          return (
            <Marker
              key={pharmacy.id}
              position={[pharmacy.latitude, pharmacy.longitude]}
              icon={createPharmacyIcon(pharmacy.is_on_call)}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-pharma-teal/10 flex items-center justify-center flex-shrink-0">
                      <Pill className="w-4 h-4 text-pharma-teal" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-pharma-dark-slate text-sm">
                        {pharmacy.name}
                      </h3>
                      {pharmacy.is_on_call && <OnCallBadge className="mt-1" />}
                    </div>
                  </div>
                  
                  <p className="text-xs text-pharma-slate-grey mb-2 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {pharmacy.address}
                  </p>
                  
                  {distance && (
                    <p className="text-xs font-medium text-pharma-teal mb-3">
                      {formatDistance(distance)} {language === 'el' ? 'μακριά' : 'away'}
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    {pharmacy.phone && (
                      <a href={`tel:${pharmacy.phone}`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full rounded-lg h-8 text-xs gap-1">
                          <Phone className="w-3 h-3" />
                          {t('callNow')}
                        </Button>
                      </a>
                    )}
                    <Button 
                      size="sm" 
                      className="flex-1 rounded-lg h-8 text-xs gap-1 bg-pharma-teal hover:bg-pharma-teal/90"
                      onClick={() => openNavigation(pharmacy)}
                    >
                      <Navigation className="w-3 h-3" />
                      {t('getDirections')}
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default PharmacyMap;
