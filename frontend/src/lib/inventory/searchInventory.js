import { supabase } from '../supabase';

const normalizeCatalogQuery = (value) => `${value || ''}`
  .toLowerCase()
  .trim()
  .replace(/,/g, ' ')
  .replace(/\s+/g, ' ');

const uniqueByKey = (rows, key) => {
  const seen = new Set();
  const output = [];
  (rows || []).forEach((row) => {
    const value = row?.[key];
    if (!value || seen.has(value)) return;
    seen.add(value);
    output.push(row);
  });
  return output;
};

const uniqueValues = (rows, key) => uniqueByKey(rows, key).map((row) => row?.[key]).filter(Boolean);

export const searchCatalogProducts = async ({
  query,
  maxProducts = 120,
  catalogTable = 'product_catalog',
  catalogSchema = null
} = {}) => {
  const cleaned = normalizeCatalogQuery(query);
  if (!cleaned || cleaned.length < 2) {
    return { products: [] };
  }

  const likePattern = `%${cleaned}%`;
  const catalogClient = catalogSchema ? supabase.schema(catalogSchema) : supabase;

  const { data, error } = await catalogClient
    .from(catalogTable)
    .select('id, category, name_el, name_en, name_el_norm, name_en_norm, barcode')
    .or(`name_el_norm.ilike.${likePattern},name_en_norm.ilike.${likePattern},barcode.ilike.${likePattern}`)
    .limit(maxProducts);

  if (error) {
    throw error;
  }

  return { products: uniqueByKey(data || [], 'id') };
};

export const findPharmacyIdsByProductQuery = async ({
  query,
  pharmacyIds = [],
  excludePharmacyIds = [],
  maxProducts = 120,
  associationStatus = null,
  catalogTable = 'product_catalog',
  inventoryTable = 'pharmacy_inventory',
  catalogSchema = null,
  inventorySchema = null
} = {}) => {
  const { products } = await searchCatalogProducts({ query, maxProducts, catalogTable, catalogSchema });
  const productIds = uniqueValues(products, 'id').slice(0, maxProducts);

  if (productIds.length === 0) {
    return { pharmacyIds: [], productIds: [], products: [] };
  }

  const inventoryClient = inventorySchema ? supabase.schema(inventorySchema) : supabase;
  let inventoryQuery = inventoryClient
    .from(inventoryTable)
    .select('pharmacy_id, product_id')
    .in('product_id', productIds);

  if (associationStatus && inventoryTable === 'pharmacy_inventory') {
    inventoryQuery = inventoryQuery.eq('association_status', associationStatus);
  }

  const scopedPharmacyIds = (pharmacyIds || []).filter(Boolean);
  if (scopedPharmacyIds.length > 0) {
    inventoryQuery = inventoryQuery.in('pharmacy_id', scopedPharmacyIds);
  }

  const { data: inventoryRows, error: inventoryError } = await inventoryQuery;
  if (inventoryError) {
    throw inventoryError;
  }

  let matchedPharmacyIds = uniqueValues(inventoryRows || [], 'pharmacy_id');
  if ((excludePharmacyIds || []).length > 0) {
    const excluded = new Set((excludePharmacyIds || []).filter(Boolean));
    matchedPharmacyIds = matchedPharmacyIds.filter((id) => !excluded.has(id));
  }

  return {
    pharmacyIds: matchedPharmacyIds,
    productIds,
    products
  };
};

export const getProductSuggestionLabel = (product, language = 'en') => {
  const pref = language === 'el' ? 'el' : 'en';
  const primary = pref === 'el' ? product?.name_el : product?.name_en;
  const secondary = pref === 'el' ? product?.name_en : product?.name_el;
  return (primary || secondary || product?.barcode || '').trim();
};
