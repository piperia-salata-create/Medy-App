export const PHARMACY_PRESENCE_HEARTBEAT_MS = 15000;
export const PHARMACY_PRESENCE_STALE_AFTER_MS = 45000;

export const isOnDutyPresenceActive = (pharmacy, nowMs = Date.now()) => {
  if (!pharmacy?.is_on_call) return false;

  const updatedAtMs = Date.parse(pharmacy?.updated_at || '');
  if (!Number.isFinite(updatedAtMs)) {
    return true;
  }

  return (nowMs - updatedAtMs) <= PHARMACY_PRESENCE_STALE_AFTER_MS;
};
