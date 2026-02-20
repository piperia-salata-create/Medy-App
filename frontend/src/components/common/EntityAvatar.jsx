import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSignedAvatarUrl } from '../../lib/avatarStorage';

const appendVersionToken = (url, versionToken) => {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(versionToken))}`;
};

export default function EntityAvatar({
  avatarPath,
  alt = 'avatar',
  className = '',
  imageClassName = '',
  fallback = null,
  signedUrlTtlSeconds,
  versionToken = null,
  previewSrc = '',
  dataTestId = undefined
}) {
  const [signedUrl, setSignedUrl] = useState('');
  const [retried, setRetried] = useState(false);
  const path = typeof avatarPath === 'string' ? avatarPath.trim() : '';

  const loadSignedUrl = useCallback(async (forceRefresh = false) => {
    if (!path) {
      setSignedUrl('');
      return;
    }

    try {
      const url = await getSignedAvatarUrl(path, {
        expiresIn: signedUrlTtlSeconds,
        forceRefresh
      });
      setSignedUrl(url || '');
    } catch {
      setSignedUrl('');
    }
  }, [path, signedUrlTtlSeconds]);

  useEffect(() => {
    setRetried(false);
    if (!path) {
      setSignedUrl('');
      return;
    }
    loadSignedUrl(false);
  }, [path, versionToken, loadSignedUrl]);

  const displayUrl = useMemo(() => {
    if (previewSrc) return previewSrc;
    if (!signedUrl) return '';
    if (versionToken == null) return signedUrl;
    return appendVersionToken(signedUrl, versionToken);
  }, [previewSrc, signedUrl, versionToken]);

  const handleImageError = useCallback(() => {
    if (previewSrc) return;
    if (retried) {
      setSignedUrl('');
      return;
    }
    setRetried(true);
    void loadSignedUrl(true);
  }, [previewSrc, retried, loadSignedUrl]);

  return (
    <div className={className} data-testid={dataTestId}>
      {displayUrl ? (
        <img
          src={displayUrl}
          alt={alt}
          className={imageClassName}
          onError={handleImageError}
        />
      ) : fallback}
    </div>
  );
}
