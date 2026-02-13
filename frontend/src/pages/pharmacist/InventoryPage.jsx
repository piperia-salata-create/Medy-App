import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import { importInventoryItems } from '../../lib/inventory/inventoryImport';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { EmptyState } from '../../components/ui/empty-states';
import { toast } from 'sonner';
import { ArrowLeft, Boxes, Upload, ClipboardPaste, FileText, CheckCircle2, AlertTriangle, Save, Download, RefreshCw, Pencil, Trash2 } from 'lucide-react';

const ALLOWED_CATEGORIES = ['medication', 'parapharmacy', 'product'];

const ASSOCIATION_STATUSES = ['active', 'inactive', 'discontinued_local'];

const ASSOCIATION_STATUS_LABELS = {
  active: { el: 'Ενεργό', en: 'Active' },
  inactive: { el: 'Ανενεργό', en: 'Inactive' },
  discontinued_local: { el: 'Τοπικά διακοπή', en: 'Discontinued (local)' }
};

const CATEGORY_LABELS = {
  medication: { el: 'Φάρμακο', en: 'Medication' },
  parapharmacy: { el: 'Παραφαρμακευτικό', en: 'Parapharmacy' },
  product: { el: 'Προϊόν', en: 'Product' }
};

const HEADER_KEY_MAP = {
  category: 'category',
  'category (required)': 'category',
  'item category': 'category',
  'κατηγορία': 'category',
  'κατηγορια': 'category',
  'name el': 'name_el',
  'name (el)': 'name_el',
  name_el: 'name_el',
  'greek name': 'name_el',
  'όνομα (el)': 'name_el',
  'ονομα (el)': 'name_el',
  'name en': 'name_en',
  'name (en)': 'name_en',
  name_en: 'name_en',
  'english name': 'name_en',
  'όνομα (en)': 'name_en',
  'ονομα (en)': 'name_en',
  'desc el': 'desc_el',
  'description el': 'desc_el',
  'description (el)': 'desc_el',
  'περιγραφή (el)': 'desc_el',
  'περιγραφη (el)': 'desc_el',
  'desc en': 'desc_en',
  'description en': 'desc_en',
  'description (en)': 'desc_en',
  'περιγραφή (en)': 'desc_en',
  'περιγραφη (en)': 'desc_en',
  barcode: 'barcode',
  'bar code': 'barcode',
  brand: 'brand',
  'μάρκα': 'brand',
  'μαρκα': 'brand',
  strength: 'strength',
  'περιεκτικότητα': 'strength',
  'περιεκτικοτητα': 'strength',
  form: 'form',
  'μορφή': 'form',
  'μορφη': 'form',
  'active ingredient el': 'active_ingredient_el',
  active_ingredient_el: 'active_ingredient_el',
  'active ingredient en': 'active_ingredient_en',
  active_ingredient_en: 'active_ingredient_en',
  price: 'price',
  'τιμή': 'price',
  'τιμη': 'price',
  notes: 'notes',
  'σημειώσεις': 'notes',
  'σημειωσεις': 'notes'
};

const cleanText = (value) => (value === null || value === undefined ? '' : String(value).trim());
const normalizeHeader = (value) => cleanText(value).toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
const containsGreek = (value) => /[\u0370-\u03FF]/.test(value || '');

const parseNumber = (value) => {
  const text = cleanText(value).replace(',', '.');
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : Number.NaN;
};

const parseContentDispositionFilename = (contentDisposition, fallback) => {
  const raw = String(contentDisposition || '');
  if (!raw) return fallback;

  const utfMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const basicMatch = raw.match(/filename="?([^"]+)"?/i);
  if (basicMatch?.[1]) return basicMatch[1];
  return fallback;
};

const getAccessTokenOrThrow = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data?.session || null;
  const expiresAtMs = Number(session?.expires_at || 0) * 1000;
  const tokenExpiresSoon = expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000;

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

const detectDelimiter = (headerLine) => {
  const candidates = [',', ';', '\t'];
  const counts = candidates.map((delimiter) => ({
    delimiter,
    count: (headerLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.count > 0 ? counts[0].delimiter : ',';
};

const parseDelimitedLine = (line, delimiter) => {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && next === '"' && inQuotes) {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
};

const validatePreparedItem = (item, language) => {
  if (!item.name_el && !item.name_en && !item.barcode) {
    return language === 'el'
      ? 'Απαιτείται τουλάχιστον ένα από: Όνομα (EL), Όνομα (EN), Barcode.'
      : 'At least one of Name (EL), Name (EN), Barcode is required.';
  }
  if (!ALLOWED_CATEGORIES.includes(item.category)) {
    return language === 'el' ? 'Μη έγκυρη κατηγορία.' : 'Invalid category.';
  }
  if (item.price !== null && (Number.isNaN(item.price) || item.price < 0)) {
    return language === 'el' ? 'Η τιμή πρέπει να είναι αριθμός >= 0.' : 'Price must be a number >= 0.';
  }
  return '';
};

const toPreviewRow = (index, rawItem, language, lineLabel = '') => {
  const item = {
    category: ALLOWED_CATEGORIES.includes(rawItem.category) ? rawItem.category : 'product',
    name_el: cleanText(rawItem.name_el) || null,
    name_en: cleanText(rawItem.name_en) || null,
    desc_el: cleanText(rawItem.desc_el) || null,
    desc_en: cleanText(rawItem.desc_en) || null,
    barcode: cleanText(rawItem.barcode) || null,
    brand: cleanText(rawItem.brand) || null,
    strength: cleanText(rawItem.strength) || null,
    form: cleanText(rawItem.form) || null,
    active_ingredient_el: cleanText(rawItem.active_ingredient_el) || null,
    active_ingredient_en: cleanText(rawItem.active_ingredient_en) || null,
    price: rawItem.price === null || rawItem.price === undefined || rawItem.price === '' ? null : parseNumber(rawItem.price),
    in_stock: true,
    notes: cleanText(rawItem.notes) || null
  };
  return {
    index,
    lineLabel,
    item,
    error: validatePreparedItem(item, language)
  };
};

const getImportCounts = (response) => {
  const counts = response?.counts || {};
  return {
    upsertedInventory: Number(counts.upserted_inventory || 0),
    skippedInvalid: Number(counts.skipped_invalid || 0),
    ambiguousSkipped: Number(counts.ambiguous_skipped || 0)
  };
};

export default function InventoryPage() {
  const { user, profile, isPharmacist, profileStatus } = useAuth();
  const userId = user?.id || null;
  const { language } = useLanguage();
  const navigate = useNavigate();
  const csvInputRef = useRef(null);
  const pharmacyLoadedRef = useRef(false);

  const [pharmacy, setPharmacy] = useState(null);
  const [loadingPharmacy, setLoadingPharmacy] = useState(true);

  const [pasteCategory, setPasteCategory] = useState('medication');
  const [pasteText, setPasteText] = useState('');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewSource, setPreviewSource] = useState('');
  const [previewNotice, setPreviewNotice] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('import');

  const [manualSaving, setManualSaving] = useState(false);
  const [manualSummary, setManualSummary] = useState(null);
  const [editingInventoryId, setEditingInventoryId] = useState('');
  const [manualForm, setManualForm] = useState({
    category: 'medication',
    name_el: '',
    name_en: '',
    desc_el: '',
    desc_en: '',
    price: '',
    notes: ''
  });
  const [inventoryRows, setInventoryRows] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryActionProductId, setInventoryActionProductId] = useState('');
  const [proposalActionProductId, setProposalActionProductId] = useState('');
  const [deletingInventoryId, setDeletingInventoryId] = useState('');
  const [markedProductIds, setMarkedProductIds] = useState([]);
  const [exportingCatalog, setExportingCatalog] = useState(false);
  const [exportingAssociations, setExportingAssociations] = useState(false);

  const categoryOptions = useMemo(
    () => ALLOWED_CATEGORIES.map((value) => ({
      value,
      label: CATEGORY_LABELS[value][language === 'el' ? 'el' : 'en']
    })),
    [language]
  );
  const associationStatusOptions = useMemo(
    () => ASSOCIATION_STATUSES.map((value) => ({
      value,
      label: ASSOCIATION_STATUS_LABELS[value][language === 'el' ? 'el' : 'en']
    })),
    [language]
  );

  const validPreviewRows = useMemo(() => previewRows.filter((row) => !row.error), [previewRows]);
  const invalidPreviewRows = useMemo(() => previewRows.filter((row) => row.error), [previewRows]);
  const markedProductSet = useMemo(() => new Set(markedProductIds), [markedProductIds]);

  useEffect(() => {
    if (profileStatus !== 'ready') return;
    if (profile && !isPharmacist()) navigate('/patient');
  }, [profile, isPharmacist, navigate, profileStatus]);

  useEffect(() => {
    pharmacyLoadedRef.current = false;
    setLoadingPharmacy(true);
  }, [userId]);

  const fetchMyPharmacy = useCallback(async () => {
    if (!userId) {
      setPharmacy(null);
      setLoadingPharmacy(false);
      return;
    }
    const isInitialLoad = !pharmacyLoadedRef.current;
    if (isInitialLoad) {
      setLoadingPharmacy(true);
    }
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('id, name, address')
        .eq('owner_id', userId)
        .maybeSingle();
      if (error) throw error;
      setPharmacy(data || null);
    } catch (error) {
      console.error('Error loading pharmacy for inventory:', error);
      setPharmacy(null);
    } finally {
      pharmacyLoadedRef.current = true;
      if (isInitialLoad) {
        setLoadingPharmacy(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    fetchMyPharmacy();
  }, [fetchMyPharmacy]);

  const fetchInventoryRows = useCallback(async () => {
    if (!pharmacy?.id) {
      setInventoryRows([]);
      setMarkedProductIds([]);
      return;
    }

    setLoadingInventory(true);
    try {
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('pharmacy_inventory')
        .select(`
          id,
          pharmacy_id,
          product_id,
          association_status,
          in_stock,
          price,
          notes,
          updated_at,
          product:product_catalog (
            id,
            category,
            name_el,
            name_en,
            desc_el,
            desc_en,
            barcode,
            brand,
            form,
            strength,
            discontinued_mark_count,
            discontinued_proposed
          )
        `)
        .eq('pharmacy_id', pharmacy.id)
        .order('updated_at', { ascending: false });

      if (inventoryError) throw inventoryError;
      setInventoryRows(inventoryData || []);

      const { data: markData, error: markError } = await supabase
        .from('product_discontinued_marks')
        .select('product_id')
        .eq('pharmacy_id', pharmacy.id);

      if (markError) {
        console.error('Error loading discontinued marks:', markError);
        setMarkedProductIds([]);
      } else {
        setMarkedProductIds((markData || []).map((row) => row.product_id).filter(Boolean));
      }
    } catch (error) {
      console.error('Error loading inventory rows:', error);
      setInventoryRows([]);
      setMarkedProductIds([]);
    } finally {
      setLoadingInventory(false);
    }
  }, [pharmacy?.id]);

  useEffect(() => {
    fetchInventoryRows();
  }, [fetchInventoryRows]);

  const downloadCsvFromEdge = useCallback(async ({ functionName, query = {}, fallbackFileName }) => {
    const accessToken = await getAccessTokenOrThrow();
    const queryString = new URLSearchParams({
      format: 'csv',
      ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== null && value !== undefined && value !== ''))
    }).toString();
    const endpoint = `${supabaseUrl}/functions/v1/${functionName}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      }
    });

    let payload = null;
    if (!response.ok) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(payload?.error || `${functionName} failed (${response.status})`);
    }

    const blob = await response.blob();
    const filename = parseContentDispositionFilename(
      response.headers.get('Content-Disposition'),
      fallbackFileName
    );
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }, []);

  const exportMyCatalogItems = useCallback(async () => {
    setExportingCatalog(true);
    try {
      await downloadCsvFromEdge({
        functionName: 'export-my-catalog-items',
        fallbackFileName: 'my-catalog-items.csv'
      });
      toast.success(language === 'el' ? 'Η εξαγωγή καταλόγου ολοκληρώθηκε.' : 'Catalog export completed.');
    } catch (error) {
      console.error('Export my catalog items failed:', error);
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία εξαγωγής καταλόγου.' : 'Catalog export failed.'));
    } finally {
      setExportingCatalog(false);
    }
  }, [downloadCsvFromEdge, language]);

  const exportMyPharmacyAssociations = useCallback(async () => {
    if (!pharmacy?.id) return;
    setExportingAssociations(true);
    try {
      await downloadCsvFromEdge({
        functionName: 'export-my-pharmacy-associations',
        query: { pharmacy_id: pharmacy.id },
        fallbackFileName: 'my-pharmacy-associations.csv'
      });
      toast.success(language === 'el' ? 'Η εξαγωγή συσχετίσεων ολοκληρώθηκε.' : 'Association export completed.');
    } catch (error) {
      console.error('Export my pharmacy associations failed:', error);
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία εξαγωγής συσχετίσεων.' : 'Association export failed.'));
    } finally {
      setExportingAssociations(false);
    }
  }, [downloadCsvFromEdge, language, pharmacy?.id]);

  const updateAssociationStatus = useCallback(async (row, nextStatus) => {
    const inventoryId = row?.id;
    const productId = row?.product_id || row?.product?.id || '';
    if (!inventoryId || !ASSOCIATION_STATUSES.includes(nextStatus)) return;

    setInventoryActionProductId(productId || inventoryId);
    try {
      const { error } = await supabase
        .from('pharmacy_inventory')
        .update({ association_status: nextStatus })
        .eq('id', inventoryId);

      if (error) throw error;

      setInventoryRows((prev) => prev.map((entry) => (
        entry.id === inventoryId
          ? { ...entry, association_status: nextStatus }
          : entry
      )));
      toast.success(language === 'el' ? 'Η κατάσταση συσχέτισης ενημερώθηκε.' : 'Association status updated.');
    } catch (error) {
      console.error('Association status update failed:', error);
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία ενημέρωσης κατάστασης.' : 'Failed to update status.'));
    } finally {
      setInventoryActionProductId('');
    }
  }, [language]);

  const toggleGlobalProposalMark = useCallback(async (row) => {
    const productId = row?.product_id || row?.product?.id || null;
    if (!pharmacy?.id || !productId || !userId) return;

    const currentlyMarked = markedProductSet.has(productId);
    setProposalActionProductId(productId);

    try {
      if (currentlyMarked) {
        const { error } = await supabase
          .from('product_discontinued_marks')
          .delete()
          .eq('pharmacy_id', pharmacy.id)
          .eq('product_id', productId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_discontinued_marks')
          .upsert(
            {
              product_id: productId,
              pharmacy_id: pharmacy.id,
              marked_by: userId
            },
            { onConflict: 'product_id,pharmacy_id' }
          );
        if (error) throw error;
      }

      await fetchInventoryRows();
      toast.success(
        currentlyMarked
          ? (language === 'el' ? 'Η πρόταση διακοπής αφαιρέθηκε.' : 'Discontinued proposal mark removed.')
          : (language === 'el' ? 'Η πρόταση διακοπής καταχωρήθηκε.' : 'Discontinued proposal mark saved.')
      );
    } catch (error) {
      console.error('Toggle discontinued proposal failed:', error);
      toast.error(
        error?.message || (language === 'el'
          ? 'Αποτυχία ενημέρωσης πρότασης διακοπής.'
          : 'Failed to update discontinued proposal.')
      );
    } finally {
      setProposalActionProductId('');
    }
  }, [fetchInventoryRows, language, markedProductSet, pharmacy?.id, userId]);

  const loadInventoryRowIntoManualForm = useCallback((row) => {
    const product = row?.product || {};
    const productCategory = cleanText(product?.category)?.toLowerCase();
    const category = ALLOWED_CATEGORIES.includes(productCategory) ? productCategory : 'product';
    const priceValue = row?.price;
    setManualForm({
      category,
      name_el: cleanText(product?.name_el) || '',
      name_en: cleanText(product?.name_en) || '',
      desc_el: cleanText(product?.desc_el) || '',
      desc_en: cleanText(product?.desc_en) || '',
      price: priceValue === null || priceValue === undefined ? '' : String(priceValue),
      notes: cleanText(row?.notes) || ''
    });
    setEditingInventoryId(row?.id || '');
    setManualSummary(null);
    setActiveTab('manual');
    toast.success(language === 'el' ? 'Τα στοιχεία φορτώθηκαν για διόρθωση.' : 'Item loaded for correction.');
  }, [language]);

  const deleteInventoryRow = useCallback(async (row) => {
    const inventoryId = row?.id;
    if (!inventoryId) return;

    const confirmed = window.confirm(
      language === 'el'
        ? 'Να διαγραφεί αυτή η εγγραφή από το απόθεμα;'
        : 'Delete this row from inventory?'
    );
    if (!confirmed) return;

    setDeletingInventoryId(inventoryId);
    try {
      const { error } = await supabase
        .from('pharmacy_inventory')
        .delete()
        .eq('id', inventoryId);
      if (error) throw error;

      await fetchInventoryRows();
      if (editingInventoryId === inventoryId) {
        setEditingInventoryId('');
      }
      toast.success(language === 'el' ? 'Η εγγραφή αφαιρέθηκε από το απόθεμα.' : 'Inventory row deleted.');
    } catch (error) {
      console.error('Delete inventory row failed:', error);
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία διαγραφής εγγραφής.' : 'Failed to delete inventory row.'));
    } finally {
      setDeletingInventoryId('');
    }
  }, [editingInventoryId, fetchInventoryRows, language]);

  const buildPreviewFromTableRows = useCallback((rows, sourceTag, defaultCategory = 'product') => {
    const nonEmptyRows = (Array.isArray(rows) ? rows : [])
      .map((row) => (Array.isArray(row) ? row.map((cell) => cleanText(cell) || '') : []))
      .filter((row) => row.some((cell) => cell.length > 0));

    if (nonEmptyRows.length < 2) {
      setPreviewRows([]);
      setPreviewNotice(language === 'el' ? 'Το αρχείο δεν περιέχει δεδομένα.' : 'File does not contain data rows.');
      return false;
    }

    const headers = nonEmptyRows[0].map(normalizeHeader);
    const mappedKeys = headers.map((header) => HEADER_KEY_MAP[header] || null);
    if (mappedKeys.filter(Boolean).length === 0) {
      setPreviewRows([]);
      setPreviewNotice(language === 'el'
        ? 'Δεν αναγνωρίστηκαν κεφαλίδες. Χρησιμοποιήστε category,name_el,name_en,price.'
        : 'No recognized headers. Use category,name_el,name_en,price.');
      return false;
    }

    const nextRows = [];
    for (let i = 1; i < nonEmptyRows.length; i += 1) {
      const cells = nonEmptyRows[i];
      const obj = { category: defaultCategory };
      mappedKeys.forEach((key, idx) => {
        if (!key) return;
        obj[key] = cells[idx] ?? '';
      });
      obj.category = cleanText(obj.category).toLowerCase() || defaultCategory || 'product';
      nextRows.push(toPreviewRow(i, obj, language, `${String(sourceTag || 'file').toUpperCase()} ${i + 1}`));
    }

    setPreviewRows(nextRows);
    setPreviewSource(sourceTag || 'file');
    setPreviewNotice('');
    return true;
  }, [language]);

  const buildCsvPreview = async (file) => {
    const lowerName = String(file?.name || '').toLowerCase();
    const isSpreadsheet = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    if (isSpreadsheet) {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        setPreviewRows([]);
        setPreviewNotice(language === 'el' ? 'Το αρχείο Excel δεν περιέχει φύλλα.' : 'Excel file has no sheets.');
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const tableRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      buildPreviewFromTableRows(tableRows, 'xlsx', 'product');
      return;
    }

    const text = await file.text();
    const sourceTag = lowerName.endsWith('.tsv') ? 'tsv' : (lowerName.endsWith('.txt') ? 'txt' : 'csv');
    const lines = text.split(/\r?\n/).filter((line) => cleanText(line).length > 0);
    if (lines.length < 2) {
      setPreviewRows([]);
      setPreviewNotice(language === 'el' ? 'Το αρχείο δεν περιέχει δεδομένα.' : 'File does not contain data rows.');
      return;
    }

    const delimiter = detectDelimiter(lines[0]);
    const tableRows = lines.map((line) => parseDelimitedLine(line, delimiter));
    buildPreviewFromTableRows(tableRows, sourceTag, 'product');
    return;
  };

  const handleCsvFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setImportSummary(null);
    try {
      await buildCsvPreview(file);
    } catch (error) {
      console.error('Import file parse failed:', error);
      setPreviewRows([]);
      setPreviewNotice(language === 'el' ? 'Αποτυχία ανάγνωσης αρχείου.' : 'Failed to read file.');
    } finally {
      // Allow picking the same file again and still trigger onChange.
      event.target.value = '';
    }
  };

  const openCsvPicker = useCallback(() => {
    csvInputRef.current?.click();
  }, []);

  const downloadImportTemplate = useCallback(async () => {
    const fillHeaders = language === 'el'
      ? ['Κατηγορία', 'Όνομα (EL)', 'Όνομα (EN)', 'Περιγραφή (EL)', 'Περιγραφή (EN)', 'Barcode', 'Μάρκα', 'Περιεκτικότητα', 'Μορφή', 'Τιμή', 'Σημειώσεις']
      : ['Category', 'Name (EL)', 'Name (EN)', 'Description (EL)', 'Description (EN)', 'Barcode', 'Brand', 'Strength', 'Form', 'Price', 'Notes'];
    const fillEmptyRow = ['', '', '', '', '', '', '', '', '', '', ''];
    const sampleRow = ['medication', 'Παρακεταμόλη 500mg', 'Paracetamol 500mg', '', '', '', '', '500mg', 'tablet', '', ''];
    const guideRows = language === 'el'
      ? [
        ['Οδηγίες χρήσης προτύπου'],
        ['1) Συμπληρώστε μόνο το φύλλο "Fill Import".'],
        ['2) Μην αλλάξετε την 1η γραμμή κεφαλίδων.'],
        ['3) Υποχρεωτικό: τουλάχιστον ένα από Όνομα (EL), Όνομα (EN), Barcode.'],
        ['4) Κατηγορία: medication, parapharmacy ή product.'],
        ['5) Τιμή προαιρετική, αριθμός π.χ. 4.50.'],
        ['6) Για ακριβή ταύτιση βοηθούν Barcode / Περιεκτικότητα / Μορφή.'],
        ['Παράδειγμα γραμμής:'],
        sampleRow
      ]
      : [
        ['Template usage guide'],
        ['1) Fill only the "Fill Import" sheet.'],
        ['2) Do not change row 1 headers.'],
        ['3) Required: at least one of Name (EL), Name (EN), Barcode.'],
        ['4) Category must be medication, parapharmacy, or product.'],
        ['5) Price is optional and must be numeric, e.g. 4.50.'],
        ['6) Barcode / Strength / Form help exact matching.'],
        ['Sample row:'],
        sampleRow
      ];

    try {
      const XLSX = await import('xlsx');
      const fillSheet = XLSX.utils.aoa_to_sheet([fillHeaders, fillEmptyRow]);
      fillSheet['!cols'] = fillHeaders.map(() => ({ wch: 26 }));
      fillSheet['!autofilter'] = { ref: 'A1:K1' };

      const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
      guideSheet['!cols'] = [{ wch: 90 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, fillSheet, 'Fill Import');
      XLSX.utils.book_append_sheet(workbook, guideSheet, language === 'el' ? 'Οδηγίες' : 'Instructions');

      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'inventory-import-template.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Template generation failed:', error);
      toast.error(language === 'el' ? 'Αποτυχία δημιουργίας προτύπου Excel.' : 'Failed to create Excel template.');
    }
  }, [language]);

  const buildStructuredPastePreview = () => {
    const lines = pasteText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return false;

    const delimiter = detectDelimiter(lines[0]);
    const tableRows = lines.map((line) => parseDelimitedLine(line, delimiter));
    return buildPreviewFromTableRows(tableRows, 'paste-table', pasteCategory || 'product');
  };

  const buildPastePreview = () => {
    const lines = pasteText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      setPreviewRows([]);
      setPreviewNotice(language === 'el' ? 'Προσθέστε τουλάχιστον μία γραμμή.' : 'Paste at least one line.');
      return;
    }

    if (buildStructuredPastePreview()) {
      setImportSummary(null);
      return;
    }

    const rows = lines.map((line, idx) => {
      const delimiter = line.includes('|') ? '|' : (line.includes('\t') ? '\t' : null);
      const parts = (delimiter ? line.split(delimiter) : [line]).map((part) => part.trim()).filter(Boolean);
      let nameEl = '';
      let nameEn = '';
      if (parts.length >= 2) {
        nameEl = parts[0] || '';
        nameEn = parts[1] || '';
      } else if (containsGreek(parts[0] || '')) {
        nameEl = parts[0] || '';
      } else {
        nameEn = parts[0] || '';
      }
      return toPreviewRow(idx, { category: pasteCategory, name_el: nameEl, name_en: nameEn }, language, `Line ${idx + 1}`);
    });

    setPreviewRows(rows);
    setPreviewSource('paste');
    setPreviewNotice('');
    setImportSummary(null);
  };

  const runImport = async () => {
    if (!pharmacy?.id) {
      toast.error(language === 'el' ? 'Δεν βρέθηκε φαρμακείο.' : 'Pharmacy not found.');
      return;
    }
    const items = validPreviewRows.map((row) => row.item);
    if (items.length === 0) {
      toast.error(language === 'el' ? 'Δεν υπάρχουν έγκυρες γραμμές.' : 'No valid rows.');
      return;
    }

    setImporting(true);
    try {
      const response = await importInventoryItems(pharmacy.id, items);
      setImportSummary(response);
      await fetchInventoryRows();
      const counts = getImportCounts(response);
      if (counts.upsertedInventory > 0 && (counts.skippedInvalid > 0 || counts.ambiguousSkipped > 0)) {
        toast.warning(`Import completed with warnings. Saved: ${counts.upsertedInventory}, invalid: ${counts.skippedInvalid}, ambiguous: ${counts.ambiguousSkipped}.`);
      } else if (counts.upsertedInventory > 0) {
        toast.success(language === 'el' ? 'Η εισαγωγή ολοκληρώθηκε.' : 'Import completed.');
      } else if (counts.ambiguousSkipped > 0) {
        toast.error('No rows were saved. Multiple catalog matches found. Add barcode, strength, or form.');
      } else if (counts.skippedInvalid > 0) {
        toast.error('No rows were saved. Some rows are invalid.');
      } else {
        toast.error('Import finished, but no rows were saved.');
      }
    } catch (error) {
      console.error('Inventory import failed:', error);
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία εισαγωγής.' : 'Import failed.'));
    } finally {
      setImporting(false);
    }
  };

  const saveManualItem = async () => {
    if (!pharmacy?.id) {
      toast.error(language === 'el' ? 'Δεν βρέθηκε φαρμακείο.' : 'Pharmacy not found.');
      return;
    }
    const row = toPreviewRow(0, manualForm, language, 'manual');
    if (row.error) {
      toast.error(row.error);
      return;
    }

    setManualSaving(true);
    try {
      const response = await importInventoryItems(pharmacy.id, [row.item]);
      setManualSummary(response);
      await fetchInventoryRows();
      const counts = getImportCounts(response);
      if (counts.upsertedInventory > 0) {
        toast.success(language === 'el' ? 'Το προϊόν αποθηκεύτηκε.' : 'Product saved.');
        setEditingInventoryId('');
        setManualForm((prev) => ({ ...prev, name_el: '', name_en: '', desc_el: '', desc_en: '', price: '', notes: '' }));
      } else if (counts.ambiguousSkipped > 0) {
        toast.error('Not saved. Multiple catalog matches found. Add barcode, strength, or form.');
      } else if (counts.skippedInvalid > 0) {
        const firstError = Array.isArray(response?.errors) ? response.errors[0]?.message : '';
        toast.error(firstError || 'Not saved. Row is invalid.');
      } else {
        toast.error('Save finished, but no inventory row was created.');
      }
    } catch (error) {
      console.error('Manual inventory save failed:', error);
      toast.error(error?.message || (language === 'el' ? 'Αποτυχία αποθήκευσης.' : 'Save failed.'));
    } finally {
      setManualSaving(false);
    }
  };

  if (profileStatus !== 'ready' || loadingPharmacy) {
    return (
      <div className="min-h-screen bg-pharma-ice-blue p-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="h-10 w-64 rounded-xl bg-white/70 animate-pulse" />
          <div className="h-56 rounded-2xl bg-white/70 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isPharmacist()) return null;
  return (
    <div className="min-h-screen bg-pharma-ice-blue" data-testid="inventory-page">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-pharma-grey-pale">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/pharmacist">
            <Button variant="ghost" size="sm" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-pharma-teal" />
            <h1 className="font-heading font-semibold text-pharma-dark-slate">
              {language === 'el' ? 'Απόθεμα Φαρμακείου' : 'Pharmacy Inventory'}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {!pharmacy ? (
          <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
            <CardContent className="p-6">
              <EmptyState
                icon={Boxes}
                title={language === 'el' ? 'Δεν βρέθηκε φαρμακείο' : 'No pharmacy found'}
                description={language === 'el'
                  ? 'Προσθέστε πρώτα στοιχεία φαρμακείου για να διαχειριστείτε απόθεμα.'
                  : 'Create your pharmacy profile first to manage inventory.'}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-pharma-dark-slate">{pharmacy.name}</p>
                  <p className="text-sm text-pharma-slate-grey">{pharmacy.address}</p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full gap-2"
                      onClick={exportMyCatalogItems}
                      disabled={exportingCatalog}
                      data-testid="export-my-catalog-items-btn"
                    >
                      <Download className="w-4 h-4" />
                      {exportingCatalog
                        ? (language === 'el' ? 'Εξαγωγή...' : 'Exporting...')
                        : (language === 'el' ? 'Εξαγωγή δικών μου καταλόγων' : 'Export my catalog items')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full gap-2"
                      onClick={exportMyPharmacyAssociations}
                      disabled={exportingAssociations}
                      data-testid="export-my-pharmacy-associations-btn"
                    >
                      <Download className="w-4 h-4" />
                      {exportingAssociations
                        ? (language === 'el' ? 'Εξαγωγή...' : 'Exporting...')
                        : (language === 'el' ? 'Εξαγωγή συσχετίσεων φαρμακείου' : 'Export my pharmacy associations')}
                    </Button>
                  </div>
                  <div className="text-xs text-pharma-slate-grey">
                    {language === 'el' ? 'ID Φαρμακείου' : 'Pharmacy ID'}: {pharmacy.id}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-auto gap-2 bg-transparent border-0 shadow-none p-0">
                <TabsTrigger
                  value="import"
                  className="rounded-xl border border-pharma-grey-pale bg-white px-4 py-2 data-[state=active]:border-pharma-teal/55 data-[state=active]:bg-pharma-teal/10"
                >
                  {language === 'el' ? 'Εισαγωγή' : 'Import'}
                </TabsTrigger>
                <TabsTrigger
                  value="manual"
                  className="rounded-xl border border-pharma-grey-pale bg-white px-4 py-2 data-[state=active]:border-pharma-teal/55 data-[state=active]:bg-pharma-teal/10"
                >
                  {language === 'el' ? 'Χειροκίνητη Προσθήκη' : 'Manual Add'}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="import" className="space-y-4">
                <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                      <Upload className="w-5 h-5 text-pharma-teal" />
                      {language === 'el' ? 'Εισαγωγή Αρχείου' : 'File Upload'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <input
                      ref={csvInputRef}
                      id="inventory-csv-input"
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleCsvFileChange}
                      className="sr-only"
                      data-testid="inventory-csv-input"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="outline" className="rounded-full gap-2" onClick={openCsvPicker}>
                        <Upload className="w-4 h-4" />
                        {language === 'el' ? 'Επιλογή αρχείου' : 'Choose file'}
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full gap-2" onClick={downloadImportTemplate} data-testid="download-inventory-template-btn">
                        <Download className="w-4 h-4" />
                        {language === 'el' ? 'Πρότυπο Excel' : 'Excel template'}
                      </Button>
                      <p className="text-sm text-pharma-slate-grey">
                        {csvFileName || (language === 'el' ? 'Δεν επιλέχθηκε αρχείο.' : 'No file selected.')}
                      </p>
                    </div>
                    <p className="text-xs text-pharma-slate-grey">
                      {language === 'el'
                        ? 'Υποστηρίζονται CSV, TSV, TXT, XLSX με κεφαλίδες: category,name_el,name_en,desc_el,desc_en,barcode,brand,strength,form,price,notes'
                        : 'Supported: CSV, TSV, TXT, XLSX with headers: category,name_el,name_en,desc_el,desc_en,barcode,brand,strength,form,price,notes'}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg text-pharma-dark-slate flex items-center gap-2">
                      <ClipboardPaste className="w-5 h-5 text-pharma-teal" />
                      {language === 'el' ? 'Επικόλληση Λίστας' : 'Paste List'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid sm:grid-cols-[220px_1fr] gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Κατηγορία' : 'Category'}</label>
                        <Select value={pasteCategory} onValueChange={setPasteCategory}>
                          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">
                          {language === 'el'
                            ? 'Γραμμή: Ελληνικό όνομα | English name, ή επικόλληση πίνακα Excel με κεφαλίδες'
                            : 'Line: Greek name | English name, or paste Excel table with headers'}
                        </label>
                        <Textarea
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          rows={8}
                          className="rounded-xl"
                          placeholder={language === 'el'
                            ? 'π.χ.\nΠαρακεταμόλη 500mg | Paracetamol 500mg\nIbuprofen 400mg'
                            : 'e.g.\nParaketamoli 500mg | Paracetamol 500mg\nIbuprofen 400mg'}
                          data-testid="inventory-paste-input"
                        />
                      </div>
                    </div>
                    <Button type="button" variant="outline" className="rounded-full gap-2" onClick={buildPastePreview} data-testid="inventory-preview-paste-btn">
                      <FileText className="w-4 h-4" />
                      {language === 'el' ? 'Προεπισκόπηση λίστας' : 'Preview list'}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg text-pharma-dark-slate">
                      {language === 'el' ? 'Προεπισκόπηση & Έλεγχος' : 'Preview & Validation'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {previewNotice && <p className="text-sm text-pharma-coral">{previewNotice}</p>}
                    {previewRows.length > 0 ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="px-2 py-1 rounded-full bg-pharma-sea-green/10 text-pharma-sea-green">{language === 'el' ? 'Έγκυρα' : 'Valid'}: {validPreviewRows.length}</span>
                          <span className="px-2 py-1 rounded-full bg-pharma-coral/10 text-pharma-coral">{language === 'el' ? 'Μη έγκυρα' : 'Invalid'}: {invalidPreviewRows.length}</span>
                          <span className="px-2 py-1 rounded-full bg-pharma-steel-blue/10 text-pharma-steel-blue">{language === 'el' ? 'Πηγή' : 'Source'}: {previewSource || '-'}</span>
                        </div>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {previewRows.slice(0, 40).map((row) => (
                            <div key={`${row.lineLabel}-${row.index}`} className={`rounded-xl border p-3 ${row.error ? 'border-pharma-coral/40 bg-pharma-coral/5' : 'border-pharma-grey-pale bg-pharma-ice-blue/40'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium text-pharma-dark-slate">{row.item.name_el || row.item.name_en || row.item.barcode || '-'}</p>
                                  <p className="text-xs text-pharma-slate-grey">{row.lineLabel} · {CATEGORY_LABELS[row.item.category]?.[language === 'el' ? 'el' : 'en'] || row.item.category}</p>
                                </div>
                                {row.error ? <AlertTriangle className="w-4 h-4 text-pharma-coral mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-pharma-sea-green mt-0.5" />}
                              </div>
                              {row.error && <p className="text-xs text-pharma-coral mt-2">{row.error}</p>}
                            </div>
                          ))}
                        </div>

                        <Button type="button" className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 gap-2" disabled={importing || validPreviewRows.length === 0} onClick={runImport} data-testid="inventory-run-import-btn">
                          <Upload className="w-4 h-4" />
                          {importing ? (language === 'el' ? 'Εισαγωγή...' : 'Importing...') : (language === 'el' ? 'Εκτέλεση εισαγωγής' : 'Run import')}
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-pharma-slate-grey">{language === 'el' ? 'Δεν υπάρχει προεπισκόπηση ακόμη.' : 'No preview yet.'}</p>
                    )}
                  </CardContent>
                </Card>

                {importSummary && (
                  <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                    <CardHeader><CardTitle className="font-heading text-lg text-pharma-dark-slate">{language === 'el' ? 'Σύνοψη Εισαγωγής' : 'Import Summary'}</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-pharma-charcoal">
                      <p>{language === 'el' ? 'Νέα catalog' : 'Created catalog'}: {importSummary?.counts?.created_catalog ?? 0}</p>
                      <p>{language === 'el' ? 'Ενημερώσεις catalog' : 'Updated catalog'}: {importSummary?.counts?.updated_catalog ?? 0}</p>
                      <p>{language === 'el' ? 'Inventory upserts' : 'Inventory upserts'}: {importSummary?.counts?.upserted_inventory ?? 0}</p>
                      <p>{language === 'el' ? 'Παραλείψεις' : 'Skipped invalid'}: {importSummary?.counts?.skipped_invalid ?? 0}</p>
                      <p>{language === 'el' ? 'Ασαφείς γραμμές' : 'Skipped ambiguous'}: {importSummary?.counts?.ambiguous_skipped ?? 0}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4">
                {editingInventoryId && (
                  <Card className="bg-pharma-steel-blue/5 rounded-2xl shadow-card border-pharma-steel-blue/30">
                    <CardContent className="pt-4 text-sm text-pharma-charcoal">
                      {language === 'el'
                        ? 'Λειτουργία διόρθωσης: αποθηκεύστε τη σωστή εγγραφή και μετά διαγράψτε τη λανθασμένη από τη λίστα αποθέματος.'
                        : 'Correction mode: save the corrected item, then delete the wrong one from inventory list.'}
                    </CardContent>
                  </Card>
                )}
                <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                  <CardHeader><CardTitle className="font-heading text-lg text-pharma-dark-slate">{language === 'el' ? 'Χειροκίνητη Προσθήκη' : 'Manual Add'}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Κατηγορία' : 'Category'}</label>
                        <Select value={manualForm.category} onValueChange={(value) => setManualForm((prev) => ({ ...prev, category: value }))}>
                          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>{categoryOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Όνομα (EL)' : 'Name (EL)'}</label>
                        <Input value={manualForm.name_el} onChange={(e) => setManualForm((prev) => ({ ...prev, name_el: e.target.value }))} className="rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Όνομα (EN)' : 'Name (EN)'}</label>
                        <Input value={manualForm.name_en} onChange={(e) => setManualForm((prev) => ({ ...prev, name_en: e.target.value }))} className="rounded-xl" />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Περιγραφή (EL)' : 'Description (EL)'}</label>
                        <Textarea value={manualForm.desc_el} onChange={(e) => setManualForm((prev) => ({ ...prev, desc_el: e.target.value }))} className="rounded-xl" rows={3} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Περιγραφή (EN)' : 'Description (EN)'}</label>
                        <Textarea value={manualForm.desc_en} onChange={(e) => setManualForm((prev) => ({ ...prev, desc_en: e.target.value }))} className="rounded-xl" rows={3} />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Τιμή (προαιρετικό)' : 'Price (optional)'}</label>
                        <Input value={manualForm.price} onChange={(e) => setManualForm((prev) => ({ ...prev, price: e.target.value }))} className="rounded-xl" placeholder={language === 'el' ? 'π.χ. 4.50' : 'e.g. 4.50'} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-pharma-charcoal">{language === 'el' ? 'Σημειώσεις (προαιρετικό)' : 'Notes (optional)'}</label>
                        <Textarea value={manualForm.notes} onChange={(e) => setManualForm((prev) => ({ ...prev, notes: e.target.value }))} className="rounded-xl" rows={3} />
                      </div>
                    </div>
                    <Button type="button" className="rounded-full bg-pharma-teal hover:bg-pharma-teal/90 gap-2" onClick={saveManualItem} disabled={manualSaving} data-testid="manual-save-inventory-btn">
                      <Save className="w-4 h-4" />
                      {manualSaving ? (language === 'el' ? 'Αποθήκευση...' : 'Saving...') : (language === 'el' ? 'Αποθήκευση' : 'Save')}
                    </Button>
                  </CardContent>
                </Card>

                {manualSummary && (
                  <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
                    <CardHeader><CardTitle className="font-heading text-lg text-pharma-dark-slate">{language === 'el' ? 'Αποτέλεσμα Αποθήκευσης' : 'Save Result'}</CardTitle></CardHeader>
                    <CardContent className="text-sm text-pharma-charcoal">
                      <p>{language === 'el' ? 'Inventory upserts' : 'Inventory upserts'}: {manualSummary?.counts?.upserted_inventory ?? 0}</p>
                      <p>{language === 'el' ? 'Παραλείψεις' : 'Skipped invalid'}: {manualSummary?.counts?.skipped_invalid ?? 0}</p>
                      <p>{language === 'el' ? 'Ασαφείς γραμμές' : 'Skipped ambiguous'}: {manualSummary?.counts?.ambiguous_skipped ?? 0}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            <Card className="bg-white rounded-2xl shadow-card border-pharma-grey-pale">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="font-heading text-lg text-pharma-dark-slate">
                    {language === 'el' ? 'Λίστα αποθέματος και έλεγχοι' : 'Inventory list and controls'}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full gap-2"
                    onClick={fetchInventoryRows}
                    disabled={loadingInventory}
                    data-testid="refresh-inventory-list-btn"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingInventory ? 'animate-spin' : ''}`} />
                    {language === 'el' ? 'Ανανέωση' : 'Refresh'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingInventory ? (
                  <p className="text-sm text-pharma-slate-grey">
                    {language === 'el' ? 'Φόρτωση αποθέματος...' : 'Loading inventory...'}
                  </p>
                ) : inventoryRows.length === 0 ? (
                  <p className="text-sm text-pharma-slate-grey">
                    {language === 'el' ? 'Δεν υπάρχουν ακόμα συσχετίσεις αποθέματος.' : 'No inventory associations yet.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {inventoryRows.map((row) => {
                      const product = row?.product || {};
                      const productId = row?.product_id || product?.id || '';
                      const statusValue = ASSOCIATION_STATUSES.includes(row?.association_status)
                        ? row.association_status
                        : 'active';
                      const isMarked = markedProductSet.has(productId);
                      const isSavingStatus = inventoryActionProductId === productId || inventoryActionProductId === row?.id;
                      const isSavingProposal = proposalActionProductId === productId;
                      const isDeletingRow = deletingInventoryId === row?.id;
                      const displayPrimaryName = language === 'el'
                        ? (product?.name_el || product?.name_en || product?.barcode || '-')
                        : (product?.name_en || product?.name_el || product?.barcode || '-');
                      const displaySecondaryName = language === 'el' ? product?.name_en : product?.name_el;
                      const categoryLabel = CATEGORY_LABELS[product?.category]?.[language === 'el' ? 'el' : 'en'] || product?.category || '-';
                      return (
                        <div key={row.id} className="rounded-xl border border-pharma-grey-pale bg-pharma-ice-blue/30 p-3">
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                            <div className="space-y-2">
                              <div>
                                <p className="font-medium text-pharma-dark-slate">{displayPrimaryName}</p>
                                {displaySecondaryName && (
                                  <p className="text-xs text-pharma-slate-grey">{displaySecondaryName}</p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-pharma-steel-blue/10 px-2 py-1 text-pharma-steel-blue">{categoryLabel}</span>
                                {product?.form && (
                                  <span className="rounded-full bg-white px-2 py-1 text-pharma-charcoal">
                                    {language === 'el' ? 'Μορφή' : 'Form'}: {product.form}
                                  </span>
                                )}
                                {product?.strength && (
                                  <span className="rounded-full bg-white px-2 py-1 text-pharma-charcoal">
                                    {language === 'el' ? 'Περιεκτικότητα' : 'Strength'}: {product.strength}
                                  </span>
                                )}
                                {product?.barcode && (
                                  <span className="rounded-full bg-white px-2 py-1 text-pharma-charcoal">
                                    Barcode: {product.barcode}
                                  </span>
                                )}
                                {product?.brand && (
                                  <span className="rounded-full bg-white px-2 py-1 text-pharma-charcoal">
                                    {language === 'el' ? 'Μάρκα' : 'Brand'}: {product.brand}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-pharma-sea-green/10 px-2 py-1 text-pharma-sea-green">
                                  {language === 'el' ? 'Πλήθος προτάσεων διακοπής' : 'Discontinued proposal count'}: {Number(product?.discontinued_mark_count || 0)}
                                </span>
                                {product?.discontinued_proposed && (
                                  <span className="rounded-full bg-pharma-coral/10 px-2 py-1 text-pharma-coral">
                                    {language === 'el' ? 'Πιθανώς διακοπή (σήμα)' : 'Possibly discontinued (signal)'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="w-full lg:w-[320px] space-y-2">
                              <label className="text-xs font-medium text-pharma-charcoal">
                                {language === 'el' ? 'Τοπική κατάσταση συσχέτισης' : 'Local association status'}
                              </label>
                              <Select
                                value={statusValue}
                                onValueChange={(value) => updateAssociationStatus(row, value)}
                              >
                                <SelectTrigger
                                  className="rounded-xl bg-white"
                                  disabled={isSavingStatus}
                                  data-testid={`inventory-association-status-${row.id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {associationStatusOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Button
                                type="button"
                                variant="outline"
                                className={`w-full rounded-xl gap-2 ${isMarked ? 'border-pharma-coral bg-pharma-coral/10 text-pharma-coral hover:bg-pharma-coral/20 hover:text-pharma-coral' : ''}`}
                                onClick={() => toggleGlobalProposalMark(row)}
                                disabled={isSavingProposal}
                                data-testid={`inventory-proposal-toggle-${row.id}`}
                              >
                                {isSavingProposal
                                  ? (language === 'el' ? 'Ενημέρωση...' : 'Updating...')
                                  : isMarked
                                    ? (language === 'el' ? 'Ακύρωση πρότασης διακοπής' : 'Cancel discontinued proposal')
                                    : (language === 'el' ? 'Σήμανση παγκόσμιας διακοπής (πρόταση)' : 'Mark as discontinued globally (proposal)')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full rounded-xl gap-2"
                                onClick={() => loadInventoryRowIntoManualForm(row)}
                                data-testid={`inventory-load-into-manual-${row.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                                {language === 'el' ? 'Διόρθωση / Μετονομασία' : 'Correct / Rename'}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                className="w-full rounded-xl gap-2 border-pharma-coral/40 text-pharma-coral hover:bg-pharma-coral/10"
                                onClick={() => deleteInventoryRow(row)}
                                disabled={isDeletingRow}
                                data-testid={`inventory-delete-row-${row.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                                {isDeletingRow
                                  ? (language === 'el' ? 'Διαγραφή...' : 'Deleting...')
                                  : (language === 'el' ? 'Διαγραφή από απόθεμα' : 'Delete from inventory')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

