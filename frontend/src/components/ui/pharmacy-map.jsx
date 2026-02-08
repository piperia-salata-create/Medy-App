import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, InfoWindowF, useJsApiLoader } from '@react-google-maps/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateDistance, formatDistance } from '../../lib/geoUtils';
import { Button } from './button';
import { OnCallBadge } from './status-badge';
import { Phone, Navigation, MapPin, Pill } from 'lucide-react';

const DEFAULT_CENTER = { lat: 37.9838, lng: 23.7275 }; // Athens
const GOOGLE_MAPS_LOADER_ID = 'pharma-alert-google-maps';
const GOOGLE_MAPS_LIBRARIES = ['marker'];
const GOOGLE_MAPS_API_KEY = (
  process.env.REACT_APP_GOOGLE_MAPS_API_KEY
  || process.env.VITE_GOOGLE_MAPS_API_KEY
  || ''
).trim();
const GOOGLE_MAPS_MAP_ID = (
  process.env.REACT_APP_GOOGLE_MAPS_MAP_ID
  || process.env.VITE_GOOGLE_MAPS_MAP_ID
  || 'DEMO_MAP_ID'
).trim();

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const toNumericCoordinate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toMapPosition = (lat, lng) => {
  const latitude = toNumericCoordinate(lat);
  const longitude = toNumericCoordinate(lng);
  if (latitude === null || longitude === null) return null;
  return { lat: latitude, lng: longitude };
};

export const PharmacyMap = ({
  pharmacies = [],
  userLocation = null,
  onPharmacyClick,
  height = '400px',
  className = ''
}) => {
  const { t, language } = useLanguage();
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const mapRef = useRef(null);
  const markerEntriesRef = useRef([]);
  const onPharmacyClickRef = useRef(onPharmacyClick);

  const hasApiKey = Boolean(GOOGLE_MAPS_API_KEY);
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || 'missing-google-maps-api-key',
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const mapReady = hasApiKey && isLoaded && !loadError;
  const supportsAdvancedMarkers = mapReady
    && Boolean(window.google?.maps?.marker?.AdvancedMarkerElement)
    && Boolean(window.google?.maps?.marker?.PinElement);

  const normalizedPharmacies = useMemo(
    () => pharmacies
      .map((pharmacy) => ({
        ...pharmacy,
        mapPosition: toMapPosition(pharmacy?.latitude, pharmacy?.longitude)
      }))
      .filter((pharmacy) => pharmacy.mapPosition),
    [pharmacies]
  );

  const normalizedUserPosition = useMemo(
    () => toMapPosition(userLocation?.lat, userLocation?.lng),
    [userLocation]
  );

  useEffect(() => {
    onPharmacyClickRef.current = onPharmacyClick;
  }, [onPharmacyClick]);

  useEffect(() => {
    if (normalizedUserPosition) {
      setMapCenter(normalizedUserPosition);
      return;
    }
    if (normalizedPharmacies.length > 0) {
      setMapCenter(normalizedPharmacies[0].mapPosition);
    }
  }, [normalizedUserPosition, normalizedPharmacies]);

  useEffect(() => {
    if (mapRef.current && mapCenter) {
      mapRef.current.panTo(mapCenter);
    }
  }, [mapCenter]);

  const clearAdvancedMarkers = useCallback(() => {
    markerEntriesRef.current.forEach(({ marker, listeners }) => {
      listeners.forEach((listener) => listener?.remove?.());
      marker.map = null;
    });
    markerEntriesRef.current = [];
  }, []);

  useEffect(() => () => {
    clearAdvancedMarkers();
  }, [clearAdvancedMarkers]);

  useEffect(() => {
    if (!supportsAdvancedMarkers || !mapRef.current) {
      clearAdvancedMarkers();
      return;
    }

    clearAdvancedMarkers();

    const markerNamespace = window.google.maps.marker;
    const nextEntries = [];

    if (normalizedUserPosition) {
      const pin = new markerNamespace.PinElement({
        background: '#3B82F6',
        borderColor: '#1D4ED8',
        glyphColor: '#ffffff'
      });

      const marker = new markerNamespace.AdvancedMarkerElement({
        map: mapRef.current,
        position: normalizedUserPosition,
        title: language === 'el' ? 'Η τοποθεσία σας' : 'Your location',
        content: pin.element
      });

      const clickListener = marker.addListener('click', () => {
        setSelectedMarkerId('__user__');
      });

      nextEntries.push({ marker, listeners: [clickListener] });
    }

    normalizedPharmacies.forEach((pharmacy) => {
      const pin = new markerNamespace.PinElement({
        background: pharmacy.is_on_call ? '#3B4C9B' : '#008B8B',
        borderColor: pharmacy.is_on_call ? '#2C3E50' : '#006666',
        glyphColor: '#ffffff'
      });

      const marker = new markerNamespace.AdvancedMarkerElement({
        map: mapRef.current,
        position: pharmacy.mapPosition,
        title: pharmacy.name || 'Pharmacy',
        content: pin.element
      });

      const clickListener = marker.addListener('click', () => {
        setSelectedMarkerId(pharmacy.id);
        onPharmacyClickRef.current?.(pharmacy);
      });

      nextEntries.push({ marker, listeners: [clickListener] });
    });

    markerEntriesRef.current = nextEntries;
  }, [
    supportsAdvancedMarkers,
    normalizedUserPosition,
    normalizedPharmacies,
    language,
    clearAdvancedMarkers
  ]);

  const openNavigation = (pharmacy) => {
    const destination = pharmacy?.mapPosition
      ? `${pharmacy.mapPosition.lat},${pharmacy.mapPosition.lng}`
      : (pharmacy?.address || '');
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const selectedPharmacy = selectedMarkerId
    ? normalizedPharmacies.find((pharmacy) => pharmacy.id === selectedMarkerId) || null
    : null;

  return (
    <div className={`rounded-2xl overflow-hidden shadow-lg ${className}`} style={{ height }}>
      {!hasApiKey && (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-pharma-slate-grey bg-white">
          Λείπει κλειδί Google Maps API. / Google Maps API key is missing.
        </div>
      )}
      {hasApiKey && loadError && (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-pharma-coral bg-white">
          Αποτυχία φόρτωσης χάρτη. / Failed to load map.
        </div>
      )}
      {hasApiKey && !loadError && !isLoaded && (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-pharma-slate-grey bg-white">
          Φόρτωση χάρτη... / Loading map...
        </div>
      )}
      {mapReady && (
        <GoogleMap
          center={mapCenter}
          zoom={13}
          mapContainerStyle={mapContainerStyle}
          onLoad={(map) => {
            mapRef.current = map;
          }}
          options={{
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            mapId: GOOGLE_MAPS_MAP_ID
          }}
        >
          {selectedMarkerId === '__user__' && normalizedUserPosition && (
            <InfoWindowF
              position={normalizedUserPosition}
              onCloseClick={() => setSelectedMarkerId(null)}
            >
              <div className="text-center py-1">
                <p className="font-medium text-pharma-dark-slate">
                  {language === 'el' ? 'Η τοποθεσία σας' : 'Your Location'}
                </p>
              </div>
            </InfoWindowF>
          )}

          {selectedPharmacy && (
            <InfoWindowF
              position={selectedPharmacy.mapPosition}
              onCloseClick={() => setSelectedMarkerId(null)}
            >
              <div className="min-w-[200px]">
                <div className="mb-2 flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-pharma-teal/10 flex items-center justify-center flex-shrink-0">
                    <Pill className="w-4 h-4 text-pharma-teal" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-pharma-dark-slate text-sm">
                      {selectedPharmacy.name}
                    </h3>
                    {selectedPharmacy.is_on_call && <OnCallBadge className="mt-1" />}
                  </div>
                </div>

                <p className="text-xs text-pharma-slate-grey mb-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {selectedPharmacy.address}
                </p>

                {normalizedUserPosition && (
                  <p className="text-xs font-medium text-pharma-teal mb-3">
                    {formatDistance(calculateDistance(
                      normalizedUserPosition.lat,
                      normalizedUserPosition.lng,
                      selectedPharmacy.mapPosition.lat,
                      selectedPharmacy.mapPosition.lng
                    ))} {language === 'el' ? 'μακριά' : 'away'}
                  </p>
                )}

                <div className="flex gap-2">
                  {selectedPharmacy.phone && (
                    <a href={`tel:${selectedPharmacy.phone}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full rounded-lg h-8 text-xs gap-1">
                        <Phone className="w-3 h-3" />
                        {t('callNow')}
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 rounded-lg h-8 text-xs gap-1 bg-pharma-teal hover:bg-pharma-teal/90"
                    onClick={() => openNavigation(selectedPharmacy)}
                  >
                    <Navigation className="w-3 h-3" />
                    {t('getDirections')}
                  </Button>
                </div>
              </div>
            </InfoWindowF>
          )}
        </GoogleMap>
      )}
      {mapReady && !supportsAdvancedMarkers && (
        <div className="px-3 py-2 text-xs text-pharma-coral bg-pharma-coral/5 border-t border-pharma-coral/20">
          Δεν υποστηρίζονται Advanced Markers σε αυτό το περιβάλλον. / Advanced Markers are not supported in this environment.
        </div>
      )}
    </div>
  );
};

export default PharmacyMap;
