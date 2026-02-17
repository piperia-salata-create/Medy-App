const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
      return;
    }
    reject(new Error('Unable to compress image'));
  }, type, quality);
});

const loadImage = (file) => new Promise((resolve, reject) => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Unsupported image format'));
  };

  image.src = objectUrl;
});

const resizeDimensions = (width, height, maxEdge) => {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }
  const ratio = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
};

export async function compressChatImage(file, options = {}) {
  const {
    maxEdge = 1280,
    targetBytes = 250 * 1024,
    maxBytes = 600 * 1024,
    initialQuality = 0.78,
    minQuality = 0.5
  } = options;

  const sourceImage = await loadImage(file);
  let { width, height } = resizeDimensions(sourceImage.naturalWidth, sourceImage.naturalHeight, maxEdge);
  let quality = initialQuality;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is unavailable');
  }

  let blob = null;
  let attempts = 0;
  while (attempts < 10) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(sourceImage, 0, 0, width, height);

    blob = await toBlob(canvas, 'image/jpeg', quality);
    if (blob.size <= targetBytes) {
      break;
    }

    if (blob.size > maxBytes && quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.08);
      attempts += 1;
      continue;
    }

    if (blob.size > maxBytes) {
      width = Math.max(320, Math.round(width * 0.86));
      height = Math.max(320, Math.round(height * 0.86));
      quality = Math.max(minQuality, initialQuality - 0.06);
      attempts += 1;
      continue;
    }

    break;
  }

  if (!blob) {
    throw new Error('Image compression failed');
  }

  return {
    blob,
    mime: 'image/jpeg',
    width,
    height,
    size: blob.size
  };
}
