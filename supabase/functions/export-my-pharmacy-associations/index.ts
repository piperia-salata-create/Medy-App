import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  createClient,
  type SupabaseClient
} from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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

const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
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

const createServiceClient = (supabaseUrl: string, serviceRoleKey: string) =>
  createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

const createAuthClient = (supabaseUrl: string, anonKey: string, authHeader: string) =>
  createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

const ensureCanManagePharmacy = async (
  serviceClient: SupabaseClient,
  pharmacyId: string,
  userId: string
): Promise<boolean> => {
  const rpcCheck = await serviceClient.rpc('can_manage_pharmacy_inventory', {
    p_pharmacy_id: pharmacyId,
    p_user_id: userId
  });

  if (!rpcCheck.error && typeof rpcCheck.data === 'boolean') {
    return rpcCheck.data;
  }

  const ownerCheck = await serviceClient
    .from('pharmacies')
    .select('id')
    .eq('id', pharmacyId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (ownerCheck.error) {
    throw ownerCheck.error;
  }

  return Boolean(ownerCheck.data?.id);
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

  const authClient = createAuthClient(supabaseUrl, anonKey, authHeader);
  const authResult = await authClient.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    return errorResponse(401, {
      error: 'Unauthorized',
      details: authResult.error?.message ?? 'Invalid or expired token.'
    });
  }

  const userId = authResult.data.user.id;
  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  let body: UnknownRecord = {};
  if (req.method === 'POST') {
    try {
      body = asRecord(await req.json());
    } catch {
      return errorResponse(400, { error: 'Invalid JSON body.' });
    }
  }

  const pharmacyId = cleanText(body.pharmacy_id ?? url.searchParams.get('pharmacy_id'));
  const format = normalizeText(body.format ?? url.searchParams.get('format') ?? 'json');
  const myOnlyInput = body.my_only ?? url.searchParams.get('my_only') ?? false;
  const myOnly = parseBoolean(myOnlyInput) ?? false;

  if (!pharmacyId) {
    return errorResponse(400, { error: 'pharmacy_id is required.' });
  }

  if (!['json', 'csv'].includes(format)) {
    return errorResponse(400, { error: "format must be either 'json' or 'csv'." });
  }

  let canManage = false;
  try {
    canManage = await ensureCanManagePharmacy(serviceClient, pharmacyId, userId);
  } catch (err) {
    return errorResponse(500, {
      error: 'Failed to verify pharmacy permissions.',
      details: err instanceof Error ? err.message : String(err)
    });
  }

  if (!canManage) {
    return errorResponse(403, { error: 'Forbidden: you cannot manage this pharmacy.' });
  }

  let query = serviceClient
    .from('pharmacy_inventory')
    .select(
      'id,pharmacy_id,product_id,association_status,in_stock,price,notes,created_at,updated_at,product:product_catalog!inner(id,category,name_el,name_en,barcode,brand,form,strength,created_by,created_at,updated_at)'
    )
    .eq('pharmacy_id', pharmacyId)
    .order('updated_at', { ascending: false });

  if (myOnly) {
    query = query.eq('product.created_by', userId);
  }

  const result = await query;

  if (result.error) {
    return errorResponse(500, { error: result.error.message });
  }

  const rows = (result.data ?? []) as UnknownRecord[];

  const flattenedRows = rows.map((row) => {
    const product = (row.product ?? {}) as UnknownRecord;
    return {
      inventory_id: row.id,
      pharmacy_id: row.pharmacy_id,
      product_id: row.product_id,
      association_status: row.association_status,
      in_stock: row.in_stock,
      price: row.price,
      notes: row.notes,
      inventory_created_at: row.created_at,
      inventory_updated_at: row.updated_at,
      product_category: product.category,
      product_name_el: product.name_el,
      product_name_en: product.name_en,
      product_barcode: product.barcode,
      product_brand: product.brand,
      product_form: product.form,
      product_strength: product.strength,
      product_created_by: product.created_by,
      product_created_at: product.created_at,
      product_updated_at: product.updated_at
    };
  });

  if (format === 'csv') {
    const columns = [
      'inventory_id',
      'pharmacy_id',
      'product_id',
      'association_status',
      'in_stock',
      'price',
      'notes',
      'inventory_created_at',
      'inventory_updated_at',
      'product_category',
      'product_name_el',
      'product_name_en',
      'product_barcode',
      'product_brand',
      'product_form',
      'product_strength',
      'product_created_by',
      'product_created_at',
      'product_updated_at'
    ];
    const csv = toCsv(flattenedRows, columns);
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-pharmacy-associations.csv"'
      }
    });
  }

  return new Response(
    JSON.stringify({
      pharmacy_id: pharmacyId,
      my_only: myOnly,
      count: flattenedRows.length,
      items: flattenedRows
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
});
