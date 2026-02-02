import { supabase } from '../supabase';

const BASE_URL = 'https://nominatim.openstreetmap.org';
const COMMON_PARAMS = {
  format: 'json',
  countrycodes: 'gr',
  'accept-language': 'el,en',
  addressdetails: '1',
  limit: '5',
  viewbox: '19.0,41.8,28.5,34.5',
  bounded: '1'
};

const searchCache = new Map();
const reverseCache = new Map();

const buildUrl = (path, params) => {
  const url = new URL(path, BASE_URL);
  url.search = new URLSearchParams(params).toString();
  return url.toString();
};

const fetchJsonWithCache = async (url, cache) => {
  if (cache.has(url)) {
    return cache.get(url);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed with status ${response.status}`);
  }

  const data = await response.json();
  cache.set(url, data);
  return data;
};

export const searchAddress = async (query) => {
  const trimmedQuery = `${query || ''}`.trim();
  if (!trimmedQuery) {
    return [];
  }

  const url = buildUrl('/search', {
    ...COMMON_PARAMS,
    q: trimmedQuery
  });

  return fetchJsonWithCache(url, searchCache);
};

export const reverseGeocode = async (lat, lon) => {
  if (lat === undefined || lon === undefined || lat === null || lon === null) {
    throw new Error('Latitude and longitude are required');
  }

  const cacheKey = `${lat},${lon}`;
  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey);
  }

  const { data, error } = await supabase.functions.invoke('reverse-geocode', {
    body: { lat, lon }
  });

  if (error) {
    throw error;
  }

  reverseCache.set(cacheKey, data);
  return data;
};
