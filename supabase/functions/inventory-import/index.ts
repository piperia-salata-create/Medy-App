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

const MAX_BATCH_SIZE = 500;
const VALID_CATEGORIES = new Set(['medication', 'parapharmacy', 'product']);
const VALID_ASSOCIATION_STATUSES = new Set(['active', 'inactive', 'discontinued_local']);

const catalogSelect =
  'id,category,name_el,name_en,name_el_norm,name_en_norm,form_norm,strength_norm,desc_el,desc_en,barcode,brand,strength,form,active_ingredient_el,active_ingredient_en,created_by,created_at,updated_at';

type UnknownRecord = Record<string, unknown>;

type CatalogRow = {
  id: string;
  category: string;
  name_el: string | null;
  name_en: string | null;
  name_el_norm: string;
  name_en_norm: string;
  form_norm: string;
  strength_norm: string;
  desc_el: string | null;
  desc_en: string | null;
  barcode: string | null;
  brand: string | null;
  strength: string | null;
  form: string | null;
  active_ingredient_el: string | null;
  active_ingredient_en: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ParsedItem = {
  category: string;
  nameEl: string | null;
  nameEn: string | null;
  nameElNorm: string;
  nameEnNorm: string;
  descEl: string | null;
  descEn: string | null;
  barcode: string | null;
  brand: string | null;
  strength: string | null;
  strengthNorm: string;
  form: string | null;
  formNorm: string;
  activeIngredientEl: string | null;
  activeIngredientEn: string | null;
  price: number | null;
  priceProvided: boolean;
  notes: string | null;
  notesProvided: boolean;
  inStock: boolean;
  inStockProvided: boolean;
  associationStatus: string | null;
  associationStatusProvided: boolean;
};

type ItemError = {
  index: number;
  stage: string;
  message: string;
  item: UnknownRecord;
};

type AmbiguousRow = {
  index: number;
  message: string;
  candidate_count: number;
  candidate_ids: string[];
  created_new_catalog: boolean;
};

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  return null;
};

const asRecord = (value: unknown): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
};

const errorResponse = (status: number, payload: UnknownRecord) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const isBlank = (value: unknown): boolean =>
  typeof value !== 'string' || value.trim().length === 0;

const parseItem = (raw: unknown): { item?: ParsedItem; error?: string; cleanRaw: UnknownRecord } => {
  const cleanRaw = asRecord(raw);

  const category = normalizeText(cleanRaw.category);
  const nameEl = cleanText(cleanRaw.name_el);
  const nameEn = cleanText(cleanRaw.name_en);
  const barcode = cleanText(cleanRaw.barcode);
  const descEl = cleanText(cleanRaw.desc_el);
  const descEn = cleanText(cleanRaw.desc_en);
  const brand = cleanText(cleanRaw.brand);
  const strength = cleanText(cleanRaw.strength);
  const form = cleanText(cleanRaw.form);
  const activeIngredientEl = cleanText(cleanRaw.active_ingredient_el);
  const activeIngredientEn = cleanText(cleanRaw.active_ingredient_en);
  const notes = cleanText(cleanRaw.notes);
  const associationStatusRaw = cleanText(cleanRaw.association_status);

  if (!VALID_CATEGORIES.has(category)) {
    return {
      error: "Category must be one of: medication, parapharmacy, product.",
      cleanRaw
    };
  }

  if (!nameEl && !nameEn && !barcode) {
    return {
      error: 'Each item must include at least one of name_el, name_en, or barcode.',
      cleanRaw
    };
  }

  const priceProvided = Object.prototype.hasOwnProperty.call(cleanRaw, 'price');
  const parsedPrice = parseNumber(cleanRaw.price);
  if (priceProvided && parsedPrice === null) {
    return {
      error: 'price must be a valid number when provided.',
      cleanRaw
    };
  }
  if (parsedPrice !== null && parsedPrice < 0) {
    return {
      error: 'price cannot be negative.',
      cleanRaw
    };
  }

  const inStockProvided = Object.prototype.hasOwnProperty.call(cleanRaw, 'in_stock');
  const parsedInStock = parseBoolean(cleanRaw.in_stock);
  if (inStockProvided && parsedInStock === null) {
    return {
      error: 'in_stock must be a boolean when provided.',
      cleanRaw
    };
  }

  const associationStatusProvided = Object.prototype.hasOwnProperty.call(cleanRaw, 'association_status');
  const associationStatusNormalized = associationStatusRaw ? normalizeText(associationStatusRaw) : null;
  if (
    associationStatusProvided &&
    associationStatusNormalized &&
    !VALID_ASSOCIATION_STATUSES.has(associationStatusNormalized)
  ) {
    return {
      error: "association_status must be one of: active, inactive, discontinued_local.",
      cleanRaw
    };
  }

  return {
    cleanRaw,
    item: {
      category,
      nameEl,
      nameEn,
      nameElNorm: normalizeText(nameEl),
      nameEnNorm: normalizeText(nameEn),
      descEl,
      descEn,
      barcode,
      brand,
      strength,
      strengthNorm: normalizeText(strength),
      form,
      formNorm: normalizeText(form),
      activeIngredientEl,
      activeIngredientEn,
      price: parsedPrice,
      priceProvided,
      notes,
      notesProvided: Object.prototype.hasOwnProperty.call(cleanRaw, 'notes'),
      inStock: parsedInStock ?? true,
      inStockProvided,
      associationStatus: associationStatusNormalized,
      associationStatusProvided
    }
  };
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

const mergeCatalogById = (rows: CatalogRow[]): CatalogRow[] => {
  const byId = new Map<string, CatalogRow>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
};

const fetchNameCandidates = async (
  serviceClient: SupabaseClient,
  item: ParsedItem
): Promise<CatalogRow[]> => {
  const candidates: CatalogRow[] = [];

  if (item.nameElNorm) {
    let byElQuery = serviceClient
      .from('product_catalog')
      .select(catalogSelect)
      .eq('category', item.category)
      .eq('name_el_norm', item.nameElNorm)
      .limit(30);

    if (item.formNorm) {
      byElQuery = byElQuery.eq('form_norm', item.formNorm);
    }

    if (item.strengthNorm) {
      byElQuery = byElQuery.eq('strength_norm', item.strengthNorm);
    }

    const byEl = await byElQuery;

    if (byEl.error) throw byEl.error;
    if (Array.isArray(byEl.data)) candidates.push(...(byEl.data as CatalogRow[]));
  }

  if (item.nameEnNorm) {
    let byEnQuery = serviceClient
      .from('product_catalog')
      .select(catalogSelect)
      .eq('category', item.category)
      .eq('name_en_norm', item.nameEnNorm)
      .limit(30);

    if (item.formNorm) {
      byEnQuery = byEnQuery.eq('form_norm', item.formNorm);
    }

    if (item.strengthNorm) {
      byEnQuery = byEnQuery.eq('strength_norm', item.strengthNorm);
    }

    const byEn = await byEnQuery;

    if (byEn.error) throw byEn.error;
    if (Array.isArray(byEn.data)) candidates.push(...(byEn.data as CatalogRow[]));
  }

  return mergeCatalogById(candidates);
};

const findCatalogMatch = async (
  serviceClient: SupabaseClient,
  item: ParsedItem
): Promise<{ product: CatalogRow | null; ambiguous: CatalogRow[] }> => {
  if (item.barcode) {
    const byBarcode = await serviceClient
      .from('product_catalog')
      .select(catalogSelect)
      .eq('barcode', item.barcode)
      .limit(5);

    if (byBarcode.error) throw byBarcode.error;

    const rows = (byBarcode.data ?? []) as CatalogRow[];
    if (rows.length > 0) {
      return {
        product: rows[0] ?? null,
        ambiguous: rows.length > 1 ? rows.slice(1) : []
      };
    }
  }

  const candidates = await fetchNameCandidates(serviceClient, item);

  if (candidates.length === 1) {
    return { product: candidates[0], ambiguous: [] };
  }

  if (candidates.length > 1) {
    return { product: null, ambiguous: candidates };
  }

  return { product: null, ambiguous: [] };
};

const buildCatalogInsertPayload = (item: ParsedItem, userId: string): UnknownRecord => ({
  category: item.category,
  name_el: item.nameEl,
  name_en: item.nameEn,
  desc_el: item.descEl,
  desc_en: item.descEn,
  barcode: item.barcode,
  brand: item.brand,
  strength: item.strength,
  form: item.form,
  active_ingredient_el: item.activeIngredientEl,
  active_ingredient_en: item.activeIngredientEn,
  created_by: userId
});

const buildCatalogMissingFieldUpdate = (
  existing: CatalogRow,
  incoming: ParsedItem
): UnknownRecord => {
  const updates: UnknownRecord = {};

  if (isBlank(existing.name_el) && incoming.nameEl) updates.name_el = incoming.nameEl;
  if (isBlank(existing.name_en) && incoming.nameEn) updates.name_en = incoming.nameEn;
  if (isBlank(existing.desc_el) && incoming.descEl) updates.desc_el = incoming.descEl;
  if (isBlank(existing.desc_en) && incoming.descEn) updates.desc_en = incoming.descEn;
  if (isBlank(existing.barcode) && incoming.barcode) updates.barcode = incoming.barcode;
  if (isBlank(existing.brand) && incoming.brand) updates.brand = incoming.brand;
  if (isBlank(existing.strength) && incoming.strength) updates.strength = incoming.strength;
  if (isBlank(existing.form) && incoming.form) updates.form = incoming.form;
  if (isBlank(existing.active_ingredient_el) && incoming.activeIngredientEl) {
    updates.active_ingredient_el = incoming.activeIngredientEl;
  }
  if (isBlank(existing.active_ingredient_en) && incoming.activeIngredientEn) {
    updates.active_ingredient_en = incoming.activeIngredientEn;
  }

  return updates;
};

const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return code === '23505';
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
  const items = Array.isArray(payload.items) ? payload.items : null;

  if (!pharmacyId) {
    return errorResponse(400, { error: 'pharmacy_id is required.' });
  }

  if (!items) {
    return errorResponse(400, { error: 'items must be an array.' });
  }

  if (items.length === 0) {
    return errorResponse(400, { error: 'items cannot be empty.' });
  }

  if (items.length > MAX_BATCH_SIZE) {
    return errorResponse(400, {
      error: `Batch size exceeds limit. Maximum allowed items: ${MAX_BATCH_SIZE}.`
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

  const counts = {
    created_catalog: 0,
    updated_catalog: 0,
    upserted_inventory: 0,
    skipped_invalid: 0,
    ambiguous_skipped: 0
  };

  const errors: ItemError[] = [];
  const ambiguousRows: AmbiguousRow[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const parsed = parseItem(items[index]);
    if (!parsed.item) {
      counts.skipped_invalid += 1;
      errors.push({
        index,
        stage: 'validate',
        message: parsed.error ?? 'Invalid item.',
        item: parsed.cleanRaw
      });
      continue;
    }

    const item = parsed.item;

    let catalogRow: CatalogRow | null = null;
    let ambiguousCandidates: CatalogRow[] = [];

    try {
      const match = await findCatalogMatch(serviceClient, item);
      catalogRow = match.product;
      ambiguousCandidates = match.ambiguous;
    } catch (err) {
      counts.skipped_invalid += 1;
      errors.push({
        index,
        stage: 'catalog_match',
        message: err instanceof Error ? err.message : String(err),
        item: parsed.cleanRaw
      });
      continue;
    }

    if (!catalogRow) {
      if (ambiguousCandidates.length > 0) {
        const missingFormOrStrength = !item.formNorm || !item.strengthNorm;
        counts.ambiguous_skipped += 1;
        ambiguousRows.push({
          index,
          message: missingFormOrStrength
            ? 'Multiple catalog candidates matched category/name, but form and/or strength were missing. Row was skipped to avoid a wrong merge.'
            : 'Multiple catalog candidates matched the provided composite identity. Row was skipped to avoid a wrong merge.',
          candidate_count: ambiguousCandidates.length,
          candidate_ids: ambiguousCandidates.map((candidate) => candidate.id),
          created_new_catalog: false
        });
        continue;
      }

      try {
        const insertPayload = buildCatalogInsertPayload(item, userId);
        const inserted = await serviceClient
          .from('product_catalog')
          .insert(insertPayload)
          .select(catalogSelect)
          .single();

        if (inserted.error) {
          if (item.barcode && isUniqueViolation(inserted.error)) {
            const existingByBarcode = await serviceClient
              .from('product_catalog')
              .select(catalogSelect)
              .eq('barcode', item.barcode)
              .limit(1)
              .maybeSingle();
            if (existingByBarcode.error || !existingByBarcode.data) {
              throw inserted.error;
            }
            catalogRow = existingByBarcode.data as CatalogRow;
          } else {
            throw inserted.error;
          }
        } else {
          catalogRow = inserted.data as CatalogRow;
          counts.created_catalog += 1;
        }
      } catch (err) {
        counts.skipped_invalid += 1;
        errors.push({
          index,
          stage: 'catalog_create',
          message: err instanceof Error ? err.message : String(err),
          item: parsed.cleanRaw
        });
        continue;
      }
    } else {
      const updates = buildCatalogMissingFieldUpdate(catalogRow, item);
      if (Object.keys(updates).length > 0) {
        const updated = await serviceClient
          .from('product_catalog')
          .update(updates)
          .eq('id', catalogRow.id)
          .select(catalogSelect)
          .single();

        if (updated.error) {
          counts.skipped_invalid += 1;
          errors.push({
            index,
            stage: 'catalog_update',
            message: updated.error.message,
            item: parsed.cleanRaw
          });
          continue;
        }

        catalogRow = updated.data as CatalogRow;
        counts.updated_catalog += 1;
      }

      if (ambiguousCandidates.length > 0) {
        ambiguousRows.push({
          index,
          message: 'Multiple barcode matches found; using the first catalog row.',
          candidate_count: ambiguousCandidates.length + 1,
          candidate_ids: [catalogRow.id, ...ambiguousCandidates.map((candidate) => candidate.id)],
          created_new_catalog: false
        });
      }
    }

    if (!catalogRow) {
      counts.skipped_invalid += 1;
      errors.push({
        index,
        stage: 'catalog_resolve',
        message: 'Unable to resolve catalog row for this item.',
        item: parsed.cleanRaw
      });
      continue;
    }

    const inventoryPayload: UnknownRecord = {
      pharmacy_id: pharmacyId,
      product_id: catalogRow.id,
      association_status: item.associationStatus ?? 'active'
    };

    if (item.inStockProvided) inventoryPayload.in_stock = item.inStock;
    if (item.priceProvided) inventoryPayload.price = item.price;
    if (item.notesProvided) inventoryPayload.notes = item.notes;

    const upsertInventory = await serviceClient
      .from('pharmacy_inventory')
      .upsert(inventoryPayload, { onConflict: 'pharmacy_id,product_id' });

    if (upsertInventory.error) {
      counts.skipped_invalid += 1;
      errors.push({
        index,
        stage: 'inventory_upsert',
        message: upsertInventory.error.message,
        item: parsed.cleanRaw
      });
      continue;
    }

    counts.upserted_inventory += 1;
  }

  return new Response(
    JSON.stringify({
      pharmacy_id: pharmacyId,
      processed: items.length,
      counts,
      ambiguous_rows: ambiguousRows,
      errors
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
});
