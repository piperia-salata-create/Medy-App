import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
};

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const errorResponse = (status: number, payload: UnknownRecord) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const escapeCsvValue = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

const toCsv = (rows: UnknownRecord[], columns: string[]): string => {
  const header = columns.join(',');
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','))
    .join('\n');
  return `${header}\n${body}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return errorResponse(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return errorResponse(500, {
      error: 'Missing Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).'
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse(401, { error: 'Missing Authorization header.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authResult = await authClient.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    return errorResponse(401, {
      error: 'Unauthorized',
      details: authResult.error?.message ?? 'Invalid or expired token.'
    });
  }

  const userId = authResult.data.user.id;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const url = new URL(req.url);
  let body: UnknownRecord = {};
  if (req.method === 'POST') {
    try {
      body = asRecord(await req.json());
    } catch {
      return errorResponse(400, { error: 'Invalid JSON body.' });
    }
  }

  const format = normalizeText(body.format ?? url.searchParams.get('format') ?? 'json');
  if (!['json', 'csv'].includes(format)) {
    return errorResponse(400, { error: "format must be either 'json' or 'csv'." });
  }

  const query = await serviceClient
    .from('product_catalog')
    .select(
      'id,category,name_el,name_en,name_el_norm,name_en_norm,desc_el,desc_en,barcode,brand,strength,form,active_ingredient_el,active_ingredient_en,discontinued_mark_count,discontinued_proposed,discontinued_proposed_at,created_by,created_at,updated_at'
    )
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (query.error) {
    return errorResponse(500, { error: query.error.message });
  }

  const rows = (query.data ?? []) as UnknownRecord[];

  if (format === 'csv') {
    const columns = [
      'id',
      'category',
      'name_el',
      'name_en',
      'name_el_norm',
      'name_en_norm',
      'desc_el',
      'desc_en',
      'barcode',
      'brand',
      'strength',
      'form',
      'active_ingredient_el',
      'active_ingredient_en',
      'discontinued_mark_count',
      'discontinued_proposed',
      'discontinued_proposed_at',
      'created_by',
      'created_at',
      'updated_at'
    ];
    const csv = toCsv(rows, columns);
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-catalog-items.csv"'
      }
    });
  }

  return new Response(
    JSON.stringify({
      count: rows.length,
      items: rows
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
});
