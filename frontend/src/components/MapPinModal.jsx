import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';

const DEFAULT_CENTER = [39, 22];

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

const normalizePosition = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return [lat, lng];
  }

  if (value && typeof value === 'object' && 'lat' in value && 'lng' in value) {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return [lat, lng];
  }

  return null;
};

const MapViewUpdater = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);

  return null;
};

const MapClickHandler = ({ onSelect }) => {
  useMapEvents({
    click(event) {
      onSelect([event.latlng.lat, event.latlng.lng]);
    }
  });

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

  useEffect(() => {
    if (!open) return;
    setPosition(normalizedInitial || DEFAULT_CENTER);
  }, [open, normalizedInitial]);

  useEffect(() => {
    if (!open) return;
    if (!position) return;
    onPositionChange?.({ lat: position[0], lng: position[1] });
  }, [position, onPositionChange, open]);

  const handleConfirm = () => {
    if (!position) return;
    const [lat, lng] = position;
    if (onConfirm) {
      onConfirm({ lat, lng });
    }
    if (onOpenChange) {
      onOpenChange(false);
    }
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
          <MapContainer
            center={position || DEFAULT_CENTER}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapViewUpdater center={position} />
            <MapClickHandler onSelect={setPosition} />
            {position && (
              <Marker
                position={position}
                draggable
                eventHandlers={{
                  dragend: (event) => {
                    const marker = event.target;
                    const { lat, lng } = marker.getLatLng();
                    setPosition([lat, lng]);
                  }
                }}
              />
            )}
          </MapContainer>
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
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MapPinModal;
