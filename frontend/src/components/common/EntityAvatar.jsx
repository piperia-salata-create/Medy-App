import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthSession } from '../../contexts/AuthContext';
import {
  buildAvatarAuthScope,
  getSignedAvatarUrl,
  invalidateAvatarSignedUrl,
  peekPersistedSignedUrl
} from '../../lib/avatarStorage';

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
  const { session, hasSession: authHasSession } = useAuthSession();
  const path = typeof avatarPath === 'string' ? avatarPath.trim() : '';
  const sessionUserId = session?.user?.id ? String(session.user.id) : '';
  const sessionAccessToken = session?.access_token ? String(session.access_token) : '';
  const authScope = useMemo(
    () => buildAvatarAuthScope({
      user: sessionUserId ? { id: sessionUserId } : null,
      access_token: sessionAccessToken || null
    }),
    [sessionAccessToken, sessionUserId]
  );
  const hasSessionToken = Boolean(sessionAccessToken);
  const hasAuthSession = Boolean(authHasSession || hasSessionToken);
  const [signedUrl, setSignedUrl] = useState(() => {
    if (!path || !hasAuthSession) return '';
    return peekPersistedSignedUrl(authScope, path) || '';
  });
  const [retried, setRetried] = useState(false);
  const [hasResolutionFailed, setHasResolutionFailed] = useState(false);
  const retryTimerRef = useRef(null);
  const hasScheduledRetryRef = useRef(false);
  const lastPathRef = useRef('');

  const loadSignedUrl = useCallback(async ({ forceRefresh = false, clearOnFailure = false } = {}) => {
    if (!path) {
      setSignedUrl('');
      setHasResolutionFailed(false);
      return;
    }
    if (!hasSessionToken) {
      if (!hasAuthSession) {
        setSignedUrl('');
      }
      setHasResolutionFailed(false);
      return;
    }

    try {
      const url = await getSignedAvatarUrl(path, {
        expiresIn: signedUrlTtlSeconds,
        forceRefresh,
        authScope
      });
      hasScheduledRetryRef.current = false;
      if (url) {
        setSignedUrl((prev) => (prev === url ? prev : url));
        setHasResolutionFailed(false);
      } else if (clearOnFailure) {
        setSignedUrl('');
        setHasResolutionFailed(true);
      }
    } catch {
      if (!hasScheduledRetryRef.current) {
        hasScheduledRetryRef.current = true;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void loadSignedUrl({ forceRefresh: true, clearOnFailure });
        }, 350);
        return;
      }

      if (clearOnFailure) {
        setSignedUrl('');
        setHasResolutionFailed(true);
      }
    }
  }, [authScope, hasAuthSession, hasSessionToken, path, signedUrlTtlSeconds]);

  useEffect(() => () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const previousPath = lastPathRef.current;
    const pathChanged = previousPath !== path;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (pathChanged) {
      if (previousPath) invalidateAvatarSignedUrl(previousPath);
      if (path) invalidateAvatarSignedUrl(path);
      hasScheduledRetryRef.current = false;
    }
    lastPathRef.current = path;
    setRetried(false);
    setHasResolutionFailed(false);
    if (!path) {
      setSignedUrl('');
      return;
    }
    if (!hasAuthSession) {
      setSignedUrl('');
      return;
    }
    const cachedUrl = peekPersistedSignedUrl(authScope, path) || '';
    if (pathChanged) {
      setSignedUrl(cachedUrl);
    } else if (cachedUrl) {
      setSignedUrl((prev) => (prev || cachedUrl));
    }
    if (!hasSessionToken) {
      return;
    }
    if (versionToken != null) {
      invalidateAvatarSignedUrl(path);
    }
    const clearOnFailure = pathChanged ? !cachedUrl : !signedUrl;
    void loadSignedUrl({
      forceRefresh: pathChanged || versionToken != null,
      clearOnFailure
    });
  }, [authScope, hasAuthSession, hasSessionToken, loadSignedUrl, path, signedUrl, versionToken]);

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
      setHasResolutionFailed(true);
      return;
    }
    setRetried(true);
    setHasResolutionFailed(false);
    void loadSignedUrl({ forceRefresh: true, clearOnFailure: true });
  }, [loadSignedUrl, previewSrc, retried]);

  const shouldHideFallbackDuringResolve = Boolean(
    !previewSrc
      && path
      && hasAuthSession
      && !displayUrl
      && !hasResolutionFailed
  );

  return (
    <div className={className} data-testid={dataTestId}>
      {displayUrl ? (
        <img
          src={displayUrl}
          alt={alt}
          className={imageClassName}
          onError={handleImageError}
        />
      ) : (shouldHideFallbackDuringResolve ? null : fallback)}
    </div>
  );
}
