import { supabase, supabaseAnonKey, supabaseUrl } from '../supabase';

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DEFAULT_REGION = 'gr';
const DEFAULT_LANGUAGE = 'el';

const searchCache = new Map();
const reverseCache = new Map();
const normalizeText = (value) => `${value ?? ''}`.trim();

const getGoogleMapsApiKey = () => (
  process.env.REACT_APP_GOOGLE_MAPS_API_KEY
  || process.env.VITE_GOOGLE_MAPS_API_KEY
  || ''
).trim();

const toParsedAddressComponents = (components = []) => {
  const byType = {};

  components.forEach((component) => {
    if (!Array.isArray(component?.types)) return;
    component.types.forEach((type) => {
      byType[type] = component;
    });
  });

  const streetNumber = byType.street_number?.long_name || '';
  const street = byType.route?.long_name || '';
  const locality = byType.locality?.long_name
    || byType.postal_town?.long_name
    || byType.administrative_area_level_2?.long_name
    || byType.administrative_area_level_3?.long_name
    || '';
  const administrativeAreaLevel1 = byType.administrative_area_level_1?.long_name || '';
  const administrativeAreaLevel2 = byType.administrative_area_level_2?.long_name || '';
  const administrativeAreaLevel3 = byType.administrative_area_level_3?.long_name || '';
  const postalCode = byType.postal_code?.long_name || '';
  const country = byType.country?.long_name || '';

  const city = locality || administrativeAreaLevel2 || administrativeAreaLevel3 || '';
  const region = administrativeAreaLevel1 || administrativeAreaLevel2 || '';

  return {
    street,
    street_number: streetNumber,
    locality,
    administrative_area_level_1: administrativeAreaLevel1,
    administrative_area_level_2: administrativeAreaLevel2,
    administrative_area_level_3: administrativeAreaLevel3,
    postal_code: postalCode,
    country,
    city,
    region
  };
};

const toAddressText = (parsedAddressComponents, fallback) => {
  if (!parsedAddressComponents) return fallback || '';

  const street = parsedAddressComponents.street || '';
  const streetNumber = parsedAddressComponents.street_number || '';
  const streetLine = `${street}${streetNumber ? ` ${streetNumber}` : ''}`.trim();

  if (streetLine) return streetLine;
  return fallback || '';
};

const normalizeGoogleResult = (result) => {
  const lat = Number(result?.geometry?.location?.lat);
  const lng = Number(result?.geometry?.location?.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const formattedAddress = result?.formatted_address || '';
  const parsedComponents = toParsedAddressComponents(result?.address_components || []);
  const addressText = toAddressText(parsedComponents, formattedAddress);

  return {
    id: result?.place_id || `${lat},${lng},${formattedAddress || 'unknown'}`,
    place_id: result?.place_id || null,
    displayName: formattedAddress || addressText || `${lat},${lng}`,
    formatted_address: formattedAddress || null,
    address_text: addressText || formattedAddress || null,
    address_components: parsedComponents,
    latitude: lat,
    longitude: lng,
    lat,
    lng
  };
};

const getAccessTokenOrThrow = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data?.session || null;
  const expiresAtMs = Number(session?.expires_at || 0) * 1000;
  const tokenExpiresSoon = expiresAtMs > 0 && (expiresAtMs - Date.now()) < 60_000;

  if (!session?.access_token || tokenExpiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    session = refreshed?.session || session;
  }

  const accessToken = session?.access_token || null;
  if (!accessToken) {
    throw new Error('MISSING_AUTH_SESSION');
  }

  return accessToken;
};

const invokeReverseGeocode = async (accessToken, lat, lng) => {
  const endpoint = `${supabaseUrl}/functions/v1/reverse-geocode`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ lat, lng })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
};

const reverseGeocodeWithGoogleDirect = async (lat, lng) => {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('MISSING_GOOGLE_MAPS_API_KEY');
  }

  const url = new URL(GOOGLE_GEOCODING_URL);
  url.search = new URLSearchParams({
    latlng: `${lat},${lng}`,
    language: DEFAULT_LANGUAGE,
    region: DEFAULT_REGION,
    key: apiKey
  }).toString();

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Google reverse geocode failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status === 'ZERO_RESULTS') {
    return {
      formatted_address: null,
      display_name: null,
      address_text: null,
      address_components: {
        street: null,
        street_number: null,
        locality: null,
        administrative_area_level_1: null,
        administrative_area_level_2: null,
        administrative_area_level_3: null,
        postal_code: null,
        country: null,
        city: null,
        region: null
      },
      lat,
      lng
    };
  }

  if (payload?.status !== 'OK') {
    throw new Error(`Google reverse geocode error: ${payload?.status || 'UNKNOWN_ERROR'}`);
  }

  const normalized = normalizeGoogleResult((payload?.results || [])[0]);
  if (!normalized) {
    return {
      formatted_address: null,
      display_name: null,
      address_text: null,
      address_components: {
        street: null,
        street_number: null,
        locality: null,
        administrative_area_level_1: null,
        administrative_area_level_2: null,
        administrative_area_level_3: null,
        postal_code: null,
        country: null,
        city: null,
        region: null
      },
      lat,
      lng
    };
  }

  return {
    formatted_address: normalized.formatted_address ?? null,
    display_name: normalized.formatted_address ?? normalized.displayName ?? null,
    address_text: normalized.address_text ?? null,
    address_components: normalized.address_components ?? {
      street: null,
      street_number: null,
      locality: null,
      administrative_area_level_1: null,
      administrative_area_level_2: null,
      administrative_area_level_3: null,
      postal_code: null,
      country: null,
      city: null,
      region: null
    },
    lat: normalized.latitude,
    lng: normalized.longitude
  };
};

export const geocodeAddress = async (query, options = {}) => {
  const trimmedQuery = `${query || ''}`.trim();
  if (!trimmedQuery) return [];

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('MISSING_GOOGLE_MAPS_API_KEY');
  }

  const language = options.language || DEFAULT_LANGUAGE;
  const region = options.region || DEFAULT_REGION;
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 5;

  const cacheKey = `${trimmedQuery}|${language}|${region}|${limit}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }

  const url = new URL(GOOGLE_GEOCODING_URL);
  url.search = new URLSearchParams({
    address: trimmedQuery,
    language,
    region,
    key: apiKey
  }).toString();

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Google geocode failed with status ${response.status}`);
  }

  const payload = await response.json();
  const status = payload?.status;
  if (status === 'ZERO_RESULTS') {
    searchCache.set(cacheKey, []);
    return [];
  }

  if (status !== 'OK') {
    throw new Error(`Google geocode error: ${status || 'UNKNOWN_ERROR'}`);
  }

  const normalized = (payload?.results || [])
    .map(normalizeGoogleResult)
    .filter(Boolean)
    .slice(0, limit);

  searchCache.set(cacheKey, normalized);
  return normalized;
};

export const reverseGeocode = async (lat, lng) => {
  if (lat === undefined || lng === undefined || lat === null || lng === null) {
    throw new Error('Latitude and longitude are required');
  }

  const cacheKey = `${lat},${lng}`;
  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey);
  }

  const accessToken = await getAccessTokenOrThrow();
  let { response, payload } = await invokeReverseGeocode(accessToken, lat, lng);

  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed?.session?.access_token) {
      const retry = await invokeReverseGeocode(refreshed.session.access_token, lat, lng);
      response = retry.response;
      payload = retry.payload;
    }
  }

  if (!response.ok) {
    // Fallback to direct Google reverse geocoding when Edge Function auth blocks the call.
    if (response.status === 401 || response.status === 403) {
      const fallbackData = await reverseGeocodeWithGoogleDirect(lat, lng);
      reverseCache.set(cacheKey, fallbackData);
      return fallbackData;
    }
    throw new Error(payload?.error || `reverse-geocode failed (${response.status})`);
  }

  reverseCache.set(cacheKey, payload);
  return payload;
};

export const extractCityRegion = (payload) => {
  const components = payload?.address_components || {};
  const city = normalizeText(
    components.city
    || components.locality
    || components.administrative_area_level_2
    || components.administrative_area_level_3
  );
  const region = normalizeText(
    components.region
    || components.administrative_area_level_1
    || components.administrative_area_level_2
  );

  return {
    city: city || null,
    region: region || null
  };
};
