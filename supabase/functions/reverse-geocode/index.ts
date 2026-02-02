import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DEFAULT_USER_AGENT = 'Pharma-Alert/1.0 (contact: admin@pharma-alert.local)';
const DEFAULT_REFERER = 'http://localhost:3000';

const parseNumber = (value: unknown) => {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(num) ? num : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let payload: { lat?: unknown; lon?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const lat = parseNumber(payload.lat);
  const lon = parseNumber(payload.lon);

  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(JSON.stringify({ error: 'Invalid lat/lon' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userAgent = Deno.env.get('NOMINATIM_USER_AGENT') || DEFAULT_USER_AGENT;
  const referer = Deno.env.get('APP_REFERER') || DEFAULT_REFERER;

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.search = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lon)
  }).toString();

  let data: any;
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': userAgent,
        Referer: referer,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Nominatim error ${response.status}` }), {
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

  const address = data?.address ?? null;
  const road = address?.road ?? '';
  const houseNumber = address?.house_number ?? '';
  const addressText = road
    ? `${road}${houseNumber ? ` ${houseNumber}` : ''}`.trim()
    : (data?.display_name || null);

  const responseBody = {
    display_name: data?.display_name ?? null,
    address_text: addressText,
    address,
    lat: data?.lat ?? String(lat),
    lon: data?.lon ?? String(lon)
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
