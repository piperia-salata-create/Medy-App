const DAY_LABELS = {
  el: {
    mon: '\u0394\u03b5\u03c5',
    tue: '\u03a4\u03c1\u03b9',
    wed: '\u03a4\u03b5\u03c4',
    thu: '\u03a0\u03b5\u03bc',
    fri: '\u03a0\u03b1\u03c1',
    sat: '\u03a3\u03b1\u03b2',
    sun: '\u039a\u03c5\u03c1'
  },
  en: {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun'
  }
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const isJsonLike = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

export const formatWeeklyHours = (hoursValue, language = 'el') => {
  if (!hoursValue) return '';

  let parsed = hoursValue;
  if (typeof hoursValue === 'string') {
    const trimmed = hoursValue.trim();
    if (!trimmed) return '';
    if (!isJsonLike(trimmed)) return trimmed;

    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return trimmed;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';

  const labels = language === 'el' ? DAY_LABELS.el : DAY_LABELS.en;
  const closedLabel = language === 'el' ? '\u039a\u03bb\u03b5\u03b9\u03c3\u03c4\u03cc' : 'Closed';

  const parts = DAY_ORDER.map((dayKey) => {
    const entry = parsed[dayKey] || {};
    const openValue = typeof entry.open === 'string' ? entry.open.trim() : '';
    const closeValue = typeof entry.close === 'string' ? entry.close.trim() : '';
    const isClosed = entry.closed === true || !openValue || !closeValue;
    const timeValue = isClosed ? closedLabel : `${openValue} - ${closeValue}`;
    return `${labels[dayKey]}: ${timeValue}`;
  });

  return parts.join(' \u2022 ');
};
