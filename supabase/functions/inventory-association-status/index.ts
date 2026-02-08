import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  createClient,
  type SupabaseClient
} from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const VALID_ASSOCIATION_STATUSES = new Set(['active', 'inactive', 'discontinued_local']);

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

  if (req.method !== 'POST') {
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

  let payload: UnknownRecord = {};
  try {
    payload = asRecord(await req.json());
  } catch {
    return errorResponse(400, { error: 'Invalid JSON body.' });
  }

  const pharmacyId = cleanText(payload.pharmacy_id);
  const productId = cleanText(payload.product_id);
  const associationStatus = normalizeText(payload.association_status);
  const reason = cleanText(payload.reason);

  if (!pharmacyId || !productId) {
    return errorResponse(400, { error: 'pharmacy_id and product_id are required.' });
  }

  if (!VALID_ASSOCIATION_STATUSES.has(associationStatus)) {
    return errorResponse(400, {
      error: 'association_status must be one of active, inactive, discontinued_local.'
    });
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

  const productExists = await serviceClient
    .from('product_catalog')
    .select('id')
    .eq('id', productId)
    .maybeSingle();

  if (productExists.error) {
    return errorResponse(500, { error: productExists.error.message });
  }

  if (!productExists.data?.id) {
    return errorResponse(404, { error: 'Product not found.' });
  }

  const upsertInventory = await serviceClient.from('pharmacy_inventory').upsert(
    {
      pharmacy_id: pharmacyId,
      product_id: productId,
      association_status: associationStatus,
      in_stock: true
    },
    { onConflict: 'pharmacy_id,product_id' }
  );

  if (upsertInventory.error) {
    return errorResponse(500, { error: upsertInventory.error.message });
  }

  let markAction: 'upserted' | 'deleted' = 'deleted';

  if (associationStatus === 'discontinued_local') {
    const markUpsert = await serviceClient.from('product_discontinued_marks').upsert(
      {
        product_id: productId,
        pharmacy_id: pharmacyId,
        marked_by: userId,
        reason
      },
      { onConflict: 'product_id,pharmacy_id' }
    );

    if (markUpsert.error) {
      return errorResponse(500, {
        error: 'Failed to upsert product_discontinued_marks row.',
        details: markUpsert.error.message
      });
    }

    markAction = 'upserted';
  } else {
    const markDelete = await serviceClient
      .from('product_discontinued_marks')
      .delete()
      .eq('product_id', productId)
      .eq('pharmacy_id', pharmacyId);

    if (markDelete.error) {
      return errorResponse(500, {
        error: 'Failed to clear product_discontinued_marks row.',
        details: markDelete.error.message
      });
    }
  }

  const proposalState = await serviceClient
    .from('product_catalog')
    .select('id,discontinued_mark_count,discontinued_proposed,discontinued_proposed_at')
    .eq('id', productId)
    .maybeSingle();

  if (proposalState.error) {
    return errorResponse(500, {
      error: 'Updated status successfully, but failed to fetch proposal state.',
      details: proposalState.error.message
    });
  }

  return new Response(
    JSON.stringify({
      pharmacy_id: pharmacyId,
      product_id: productId,
      association_status: associationStatus,
      mark_action: markAction,
      proposal_state: proposalState.data ?? null
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
});
