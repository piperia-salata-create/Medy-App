import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const parseNumber = (value: unknown) => {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(num) ? num : null;
};

const parseAddressComponents = (components: any[] = []) => {
  const byType: Record<string, any> = {};

  for (const component of components) {
    if (!Array.isArray(component?.types)) continue;
    for (const type of component.types) {
      byType[type] = component;
    }
  }

  const administrativeAreaLevel1 = byType.administrative_area_level_1?.long_name ?? null;
  const administrativeAreaLevel2 = byType.administrative_area_level_2?.long_name ?? null;
  const administrativeAreaLevel3 = byType.administrative_area_level_3?.long_name ?? null;
  const locality = byType.locality?.long_name
    ?? byType.postal_town?.long_name
    ?? administrativeAreaLevel2
    ?? administrativeAreaLevel3
    ?? null;

  return {
    street: byType.route?.long_name ?? null,
    street_number: byType.street_number?.long_name ?? null,
    locality,
    administrative_area_level_1: administrativeAreaLevel1,
    administrative_area_level_2: administrativeAreaLevel2,
    administrative_area_level_3: administrativeAreaLevel3,
    city: locality,
    region: administrativeAreaLevel1 ?? administrativeAreaLevel2 ?? null,
    postal_code: byType.postal_code?.long_name ?? null,
    country: byType.country?.long_name ?? null
  };
};

const buildAddressText = (parts: ReturnType<typeof parseAddressComponents>, fallback: string | null) => {
  const street = parts.street ?? '';
  const streetNumber = parts.street_number ?? '';
  const streetLine = `${street}${streetNumber ? ` ${streetNumber}` : ''}`.trim();
  return streetLine || fallback;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let payload: { lat?: unknown; lon?: unknown; lng?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const lat = parseNumber(payload.lat);
  const lng = parseNumber(payload.lng ?? payload.lon);

  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(JSON.stringify({ error: 'Invalid lat/lon' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Required server-side secret:
  // GOOGLE_GEOCODING_API_KEY
  // Legacy NOMINATIM_USER_AGENT and APP_REFERER are no longer used.
  const googleApiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_GEOCODING_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.search = new URLSearchParams({
    latlng: `${lat},${lng}`,
    language: 'el',
    region: 'gr',
    key: googleApiKey
  }).toString();

  let data: any;
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Google Geocoding error ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    data = await response.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Reverse geocode failed', details: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const status = data?.status;
  if (status === 'ZERO_RESULTS') {
    return new Response(JSON.stringify({
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
        city: null,
        region: null,
        postal_code: null,
        country: null
      },
      lat,
      lng
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (status !== 'OK') {
    return new Response(JSON.stringify({ error: `Google Geocoding API status ${status || 'UNKNOWN'}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const firstResult = Array.isArray(data?.results) ? data.results[0] : null;
  const location = firstResult?.geometry?.location ?? null;
  const parsedAddress = parseAddressComponents(firstResult?.address_components || []);
  const formattedAddress = firstResult?.formatted_address ?? null;
  const addressText = buildAddressText(parsedAddress, formattedAddress);

  const responseBody = {
    formatted_address: formattedAddress,
    display_name: formattedAddress,
    address_text: addressText,
    address_components: parsedAddress,
    city: parsedAddress.city,
    region: parsedAddress.region,
    lat: Number.isFinite(location?.lat) ? Number(location.lat) : lat,
    lng: Number.isFinite(location?.lng) ? Number(location.lng) : lng
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
