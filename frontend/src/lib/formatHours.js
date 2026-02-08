const DAY_LABELS = {
  mon: 'Δευ',
  tue: 'Τρι',
  wed: 'Τετ',
  thu: 'Πεμ',
  fri: 'Παρ',
  sat: 'Σαβ',
  sun: 'Κυρ'
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const isJsonLike = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

export const formatWeeklyHours = (hoursValue) => {
  if (!hoursValue) return '';

  let parsed = hoursValue;
  if (typeof hoursValue === 'string') {
    if (!isJsonLike(hoursValue)) return '';
    try {
      parsed = JSON.parse(hoursValue);
    } catch (err) {
      return '';
    }
  }

  if (!parsed || typeof parsed !== 'object') return '';

  const parts = DAY_ORDER.map((dayKey) => {
    const entry = parsed[dayKey] || {};
    const openValue = typeof entry.open === 'string' ? entry.open : '';
    const closeValue = typeof entry.close === 'string' ? entry.close : '';
    const isClosed = entry.closed === true || !openValue || !closeValue;
    const timeValue = isClosed ? 'Κλειστό' : `${openValue} - ${closeValue}`;
    return `${DAY_LABELS[dayKey]}: ${timeValue}`;
  });

  return parts.join(', ');
};
