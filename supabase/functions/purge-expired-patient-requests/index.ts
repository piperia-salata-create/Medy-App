import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DAY_MS = 24 * 60 * 60 * 1000;

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return atob(padded);
};

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadRaw = decodeBase64Url(parts[1]);
    const parsed = JSON.parse(payloadRaw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const isServiceRoleRequest = (authorizationHeader: string | null, serviceRoleKey: string) => {
  if (!authorizationHeader) return false;
  const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  const payload = parseJwtPayload(token);
  return payload?.role === 'service_role';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: 'Missing Supabase environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).'
    });
  }

  if (!isServiceRoleRequest(req.headers.get('Authorization'), serviceRoleKey)) {
    return jsonResponse(403, { error: 'Forbidden: service-role invocation required.' });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const softDeleteCutoffIso = new Date(now.getTime() - (7 * DAY_MS)).toISOString();
  const hardDeleteCutoffIso = new Date(now.getTime() - DAY_MS).toISOString();

  const softDeleteCandidates = await serviceClient
    .from('patient_requests')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('expires_at', 'is', null)
    .lt('expires_at', softDeleteCutoffIso);

  if (softDeleteCandidates.error) {
    return jsonResponse(500, {
      error: 'Failed to count soft-delete candidates.',
      details: softDeleteCandidates.error.message
    });
  }

  const softDeleteCount = softDeleteCandidates.count || 0;
  if (softDeleteCount > 0) {
    const softDeleteResult = await serviceClient
      .from('patient_requests')
      .update({ deleted_at: nowIso })
      .is('deleted_at', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', softDeleteCutoffIso);

    if (softDeleteResult.error) {
      return jsonResponse(500, {
        error: 'Failed to soft-delete expired patient requests.',
        details: softDeleteResult.error.message
      });
    }
  }

  const hardDeleteCandidates = await serviceClient
    .from('patient_requests')
    .select('id', { count: 'exact', head: true })
    .not('deleted_at', 'is', null)
    .lt('deleted_at', hardDeleteCutoffIso);

  if (hardDeleteCandidates.error) {
    return jsonResponse(500, {
      error: 'Failed to count hard-delete candidates.',
      details: hardDeleteCandidates.error.message
    });
  }

  const hardDeleteCount = hardDeleteCandidates.count || 0;
  if (hardDeleteCount > 0) {
    const hardDeleteResult = await serviceClient
      .from('patient_requests')
      .delete()
      .not('deleted_at', 'is', null)
      .lt('deleted_at', hardDeleteCutoffIso);

    if (hardDeleteResult.error) {
      return jsonResponse(500, {
        error: 'Failed to hard-delete soft-deleted patient requests.',
        details: hardDeleteResult.error.message
      });
    }
  }

  return jsonResponse(200, {
    ok: true,
    executed_at: nowIso,
    soft_delete_cutoff_expires_at_lt: softDeleteCutoffIso,
    hard_delete_cutoff_deleted_at_lt: hardDeleteCutoffIso,
    soft_deleted: softDeleteCount,
    hard_deleted: hardDeleteCount
  });
});
