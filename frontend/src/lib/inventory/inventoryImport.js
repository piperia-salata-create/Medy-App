import { supabase, supabaseAnonKey, supabaseUrl } from '../supabase';

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

const invokeInventoryImport = async (accessToken, pharmacyId, items) => {
  const endpoint = `${supabaseUrl}/functions/v1/inventory-import`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      pharmacy_id: pharmacyId,
      items
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
};

const sanitizeImportItem = (item) => {
  const safeItem = { ...item };
  if (safeItem.price === null || safeItem.price === undefined || safeItem.price === '') {
    delete safeItem.price;
  }
  return safeItem;
};

const buildEdgeErrorMessage = (response, payload) => {
  const details = typeof payload?.details === 'string' ? payload.details.trim() : '';
  const error = typeof payload?.error === 'string' ? payload.error.trim() : '';
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (error && details) return `${error}: ${details}`;
  if (error) return error;
  if (message && details) return `${message}: ${details}`;
  if (message) return message;
  if (details) return details;
  return `inventory-import failed (${response.status})`;
};

export const importInventoryItems = async (pharmacyId, items) => {
  const safeItems = Array.isArray(items) ? items : [];
  if (!pharmacyId) throw new Error('Pharmacy id is required.');
  if (safeItems.length === 0) throw new Error('No inventory items to import.');

  const sanitizedItems = safeItems.map((item) => sanitizeImportItem(item));
  const accessToken = await getAccessTokenOrThrow();
  let { response, payload } = await invokeInventoryImport(accessToken, pharmacyId, sanitizedItems);

  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed?.session?.access_token) {
      const retry = await invokeInventoryImport(refreshed.session.access_token, pharmacyId, sanitizedItems);
      response = retry.response;
      payload = retry.payload;
    }
  }

  if (!response.ok) {
    throw new Error(buildEdgeErrorMessage(response, payload));
  }

  return payload;
};
