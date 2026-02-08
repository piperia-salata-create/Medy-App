import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';

const DEFAULT_CENTER = { lat: 39, lng: 22 };
const MAP_CONTAINER_STYLE = { height: '100%', width: '100%' };
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

const normalizePosition = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
  }

  if (value && typeof value === 'object' && 'lat' in value && 'lng' in value) {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
  }

  return null;
};

const MapPinModal = ({
  open,
  onOpenChange,
  initialPosition,
  onConfirm,
  onPositionChange,
  title = 'Select location',
  confirmLabel = 'Confirm'
}) => {
  const normalizedInitial = useMemo(() => normalizePosition(initialPosition), [initialPosition]);
  const [position, setPosition] = useState(normalizedInitial || DEFAULT_CENTER);
  const positionRef = useRef(position);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const markerListenersRef = useRef([]);

  const hasApiKey = Boolean(GOOGLE_MAPS_API_KEY);
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || 'missing-google-maps-api-key',
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const isMapReady = hasApiKey && isLoaded && !loadError;
  const supportsAdvancedMarker = isMapReady
    && Boolean(window.google?.maps?.marker?.AdvancedMarkerElement)
    && Boolean(window.google?.maps?.marker?.PinElement);

  const updatePosition = useCallback((nextPosition) => {
    if (!nextPosition) return;
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    onPositionChange?.({ lat: nextPosition.lat, lng: nextPosition.lng });
  }, [onPositionChange]);

  useEffect(() => {
    if (!open) return;
    updatePosition(normalizedInitial || DEFAULT_CENTER);
  }, [open, normalizedInitial, updatePosition]);

  useEffect(() => {
    if (mapRef.current && position) {
      mapRef.current.panTo(position);
    }
  }, [position]);

  const clearMarker = useCallback(() => {
    markerListenersRef.current.forEach((listener) => listener?.remove?.());
    markerListenersRef.current = [];

    if (markerRef.current) {
      markerRef.current.map = null;
      markerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!supportsAdvancedMarker || !mapRef.current || !position) return;

    const markerNamespace = window.google.maps.marker;

    if (!markerRef.current) {
      const pin = new markerNamespace.PinElement({
        background: '#008B8B',
        borderColor: '#006666',
        glyphColor: '#ffffff'
      });

      const marker = new markerNamespace.AdvancedMarkerElement({
        map: mapRef.current,
        position,
        title,
        content: pin.element,
        gmpDraggable: true
      });

      const dragEndListener = marker.addListener('dragend', (event) => {
        const latFromEvent = event?.latLng?.lat?.();
        const lngFromEvent = event?.latLng?.lng?.();

        if (Number.isFinite(latFromEvent) && Number.isFinite(lngFromEvent)) {
          updatePosition({ lat: latFromEvent, lng: lngFromEvent });
          return;
        }

        const markerLat = Number(marker?.position?.lat);
        const markerLng = Number(marker?.position?.lng);
        if (Number.isFinite(markerLat) && Number.isFinite(markerLng)) {
          updatePosition({ lat: markerLat, lng: markerLng });
        }
      });

      markerRef.current = marker;
      markerListenersRef.current = [dragEndListener];
    }

    markerRef.current.position = position;
    markerRef.current.title = title;
    markerRef.current.map = mapRef.current;
  }, [position, title, supportsAdvancedMarker, updatePosition]);

  useEffect(() => () => {
    clearMarker();
  }, [clearMarker]);

  const handleMapClick = useCallback((event) => {
    const lat = event?.latLng?.lat?.();
    const lng = event?.latLng?.lng?.();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    updatePosition({ lat, lng });
  }, [updatePosition]);

  const handleConfirm = () => {
    const latestPosition = positionRef.current || position;
    if (!latestPosition) return;

    onConfirm?.({ lat: latestPosition.lat, lng: latestPosition.lng });
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white rounded-2xl max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg text-pharma-dark-slate">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="h-80 w-full overflow-hidden rounded-xl border border-pharma-grey-pale/60">
          {!hasApiKey && (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-pharma-slate-grey">
              Λείπει κλειδί Google Maps API. / Google Maps API key is missing.
            </div>
          )}
          {hasApiKey && loadError && (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-pharma-coral">
              Αποτυχία φόρτωσης χάρτη. Δοκιμάστε ξανά αργότερα. / Failed to load map. Please try again later.
            </div>
          )}
          {hasApiKey && !loadError && !isLoaded && (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-pharma-slate-grey">
              Φόρτωση χάρτη... / Loading map...
            </div>
          )}
          {isMapReady && (
            <GoogleMap
              center={position || DEFAULT_CENTER}
              zoom={13}
              mapContainerStyle={MAP_CONTAINER_STYLE}
              onClick={handleMapClick}
              onLoad={(map) => {
                mapRef.current = map;
              }}
              options={{
                fullscreenControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                mapId: GOOGLE_MAPS_MAP_ID
              }}
            />
          )}
          {isMapReady && !supportsAdvancedMarker && (
            <div className="px-3 py-2 text-xs text-pharma-coral bg-pharma-coral/5 border-t border-pharma-coral/20">
              Δεν υποστηρίζονται Advanced Markers σε αυτό το περιβάλλον. / Advanced Markers are not supported in this environment.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange?.(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90"
            onClick={handleConfirm}
            disabled={!isMapReady}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MapPinModal;
