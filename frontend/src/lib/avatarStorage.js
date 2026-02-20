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

const normalizeAvatarPath = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

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

export const invalidateAvatarSignedUrl = (path) => {
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) return;
  SIGNED_URL_CACHE.delete(normalizedPath);
};

export const getSignedAvatarUrl = async (
  path,
  { expiresIn = AVATAR_SIGNED_URL_TTL_SECONDS, forceRefresh = false } = {}
) => {
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) return null;

  const now = Date.now();
  const cached = SIGNED_URL_CACHE.get(normalizedPath);
  if (!forceRefresh && cached && cached.expiresAt > now + 30 * 1000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalizedPath, expiresIn);
  if (error) throw error;

  const signedUrl = data?.signedUrl || null;
  if (!signedUrl) return null;

  SIGNED_URL_CACHE.set(normalizedPath, {
    url: signedUrl,
    expiresAt: now + Math.max(60 * 1000, (expiresIn - 60) * 1000)
  });

  return signedUrl;
};
