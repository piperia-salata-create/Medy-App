import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const AVATAR_SMALL_FILE_THRESHOLD_BYTES = 150 * 1024;
export const AVATAR_MAX_DIMENSION = 1024;
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

const AVATAR_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const SIGNED_URL_CACHE = new Map();
const SIGNED_URL_CACHE_STORAGE_KEY = 'medy.avatar.signed-url-cache.v1';
const SIGNED_URL_CACHE_MIN_VALIDITY_MS = 30 * 1000;
let ACTIVE_AUTH_SCOPE = 'anon';
let SIGNED_URL_CACHE_HYDRATED = false;

const normalizeAvatarPath = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeAuthScope = (value) => {
  if (typeof value !== 'string') return 'anon';
  const trimmed = value.trim();
  return trimmed || 'anon';
};

const buildCacheKey = (path, authScope) => `${normalizeAuthScope(authScope)}::${path}`;

const getAuthScopeFromSession = (session) => {
  const userId = session?.user?.id ? String(session.user.id).trim() : '';
  return userId || 'anon';
};

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
};

const persistSignedUrlCache = () => {
  const storage = getStorage();
  if (!storage) return;
  try {
    const now = Date.now();
    const payload = {};
    for (const [cacheKey, entry] of SIGNED_URL_CACHE.entries()) {
      if (!entry?.url || Number(entry?.expiresAt) <= now) continue;
      payload[cacheKey] = {
        url: String(entry.url),
        expiresAt: Number(entry.expiresAt)
      };
    }
    storage.setItem(SIGNED_URL_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage persistence errors
  }
};

const hydrateSignedUrlCache = () => {
  if (SIGNED_URL_CACHE_HYDRATED) return;
  SIGNED_URL_CACHE_HYDRATED = true;
  const storage = getStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(SIGNED_URL_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const now = Date.now();
    let changed = false;
    Object.entries(parsed).forEach(([cacheKey, entry]) => {
      const url = typeof entry?.url === 'string' ? entry.url : '';
      const expiresAt = Number(entry?.expiresAt);
      if (!cacheKey || !url || !Number.isFinite(expiresAt) || expiresAt <= now) {
        changed = true;
        return;
      }
      SIGNED_URL_CACHE.set(cacheKey, { url, expiresAt });
    });
    if (changed) {
      persistSignedUrlCache();
    }
  } catch {
    // ignore storage hydration errors
  }
};

const readCachedSignedUrl = (cacheKey) => {
  const now = Date.now();
  const cached = SIGNED_URL_CACHE.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt > now + SIGNED_URL_CACHE_MIN_VALIDITY_MS) {
    return cached.url;
  }
  SIGNED_URL_CACHE.delete(cacheKey);
  persistSignedUrlCache();
  return null;
};

const writeCachedSignedUrl = (cacheKey, url, expiresAt) => {
  if (!cacheKey || !url || !Number.isFinite(expiresAt)) return;
  SIGNED_URL_CACHE.set(cacheKey, { url, expiresAt });
  persistSignedUrlCache();
};

const removeCachedSignedUrlByPath = (normalizedPath) => {
  let changed = false;
  for (const cacheKey of SIGNED_URL_CACHE.keys()) {
    if (cacheKey.endsWith(`::${normalizedPath}`)) {
      SIGNED_URL_CACHE.delete(cacheKey);
      changed = true;
    }
  }
  if (changed) {
    persistSignedUrlCache();
  }
};

export const buildAvatarAuthScope = (session) => getAuthScopeFromSession(session);

export const buildUserAvatarPath = (userId) => {
  const normalizedId = normalizeAvatarPath(userId);
  if (!normalizedId) return null;
  return `users/${normalizedId}/avatar.webp`;
};

export const buildPharmacyAvatarPath = (pharmacyId) => {
  const normalizedId = normalizeAvatarPath(pharmacyId);
  if (!normalizedId) return null;
  return `pharmacies/${normalizedId}/avatar.webp`;
};

export const validateAvatarFile = (file) => {
  if (!file) return { ok: false, code: 'missing_file' };

  const mimeType = String(file.type || '').toLowerCase();
  if (!AVATAR_ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false, code: 'invalid_type' };
  }

  if (file.size > AVATAR_MAX_FILE_BYTES) {
    return { ok: false, code: 'file_too_large' };
  }

  return { ok: true, code: null };
};

const loadImageFromFile = (file) => new Promise((resolve, reject) => {
  const previewUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(previewUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(previewUrl);
    reject(new Error('Failed to load image file.'));
  };
  image.src = previewUrl;
});

export const processAvatarFile = async (file) => {
  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const maxSourceDimension = Math.max(sourceWidth, sourceHeight);
  const scale = maxSourceDimension > AVATAR_MAX_DIMENSION
    ? AVATAR_MAX_DIMENSION / maxSourceDimension
    : 1;

  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize image canvas.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const quality = file.size <= AVATAR_SMALL_FILE_THRESHOLD_BYTES ? 0.95 : 0.86;
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Failed to convert image.'));
        return;
      }
      resolve(result);
    }, 'image/webp', quality);
  });

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
    mime: 'image/webp',
    size: blob.size
  };
};

export const uploadAvatarBlob = async (path, blob) => {
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) {
    throw new Error('Missing avatar path.');
  }
  return supabase.storage.from(AVATAR_BUCKET).upload(normalizedPath, blob, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: '3600'
  });
};

export const removeAvatarObject = async (path) => {
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) {
    return { data: null, error: null };
  }
  return supabase.storage.from(AVATAR_BUCKET).remove([normalizedPath]);
};

export const appendAvatarCacheBust = (url, versionToken) => {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  const versionValue = Number.isFinite(Number(versionToken)) ? String(versionToken) : String(Date.now());
  return `${url}${separator}v=${encodeURIComponent(versionValue)}`;
};

export const clearAvatarSignedUrlCache = () => {
  hydrateSignedUrlCache();
  SIGNED_URL_CACHE.clear();
  const storage = getStorage();
  try {
    storage?.removeItem(SIGNED_URL_CACHE_STORAGE_KEY);
  } catch {
    // ignore storage clear errors
  }
};

export const syncAvatarSignedUrlCacheScope = (session) => {
  const nextScope = getAuthScopeFromSession(session);
  if (nextScope === ACTIVE_AUTH_SCOPE) return false;
  ACTIVE_AUTH_SCOPE = nextScope;
  clearAvatarSignedUrlCache();
  return true;
};

export const invalidateAvatarSignedUrl = (path) => {
  hydrateSignedUrlCache();
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) return;
  removeCachedSignedUrlByPath(normalizedPath);
};

export const peekSignedAvatarUrl = (
  path,
  {
    authScope
  } = {}
) => {
  hydrateSignedUrlCache();
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) return null;
  const cacheScope = normalizeAuthScope(authScope || ACTIVE_AUTH_SCOPE);
  const cacheKey = buildCacheKey(normalizedPath, cacheScope);
  return readCachedSignedUrl(cacheKey);
};

export const peekPersistedSignedUrl = (authScope, path) => {
  hydrateSignedUrlCache();
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) return null;
  const cacheScope = normalizeAuthScope(authScope || ACTIVE_AUTH_SCOPE);
  const cacheKey = buildCacheKey(normalizedPath, cacheScope);
  return readCachedSignedUrl(cacheKey);
};

export const getSignedAvatarUrl = async (
  path,
  {
    expiresIn = AVATAR_SIGNED_URL_TTL_SECONDS,
    forceRefresh = false,
    authScope
  } = {}
) => {
  hydrateSignedUrlCache();
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) return null;
  const cacheScope = normalizeAuthScope(authScope || ACTIVE_AUTH_SCOPE);
  const cacheKey = buildCacheKey(normalizedPath, cacheScope);

  if (!forceRefresh) {
    const cachedUrl = readCachedSignedUrl(cacheKey);
    if (cachedUrl) {
      return cachedUrl;
    }
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalizedPath, expiresIn);
  if (error) throw error;

  const signedUrl = data?.signedUrl || null;
  if (!signedUrl) return null;

  const now = Date.now();
  const expiresAt = now + Math.max(60 * 1000, (expiresIn - 60) * 1000);
  writeCachedSignedUrl(cacheKey, signedUrl, expiresAt);

  return signedUrl;
};
