import { parseGIF, decompressFrame } from 'gifuct-js';

// Decode once before play. Rendering must never decompress GIFs or read pixels.
// All units using an asset share these immutable, display-sized canvases.
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
let cachedBytes = 0;
export async function createAnimation(bytes, { maxDimension = 512 } = {}) {
  const gif = parseGIF(bytes);
  const source = gif.frames.filter(frame => frame.image);
  const { width, height } = gif.lsd;
  if (!width || !height || width * height > 16 * 1024 * 1024) {
    throw new Error('GIF dimensions exceed the supported 16 megapixels.');
  }
  if (!source.length) throw new Error('GIF contains no image frames.');
  const available = Math.min(32 * 1024 * 1024, MAX_CACHE_BYTES - cachedBytes);
  if (available < source.length * 4) throw new Error('The map contains too much GIF artwork to prepare for smooth playback.');
  const scale = Math.min(1, maxDimension / Math.max(width, height), Math.sqrt(available / (width * height * source.length * 4)));
  const frameWidth = Math.max(1, Math.floor(width * scale));
  const frameHeight = Math.max(1, Math.floor(height * scale));
  const cacheBytes = frameWidth * frameHeight * source.length * 4;
  cachedBytes += cacheBytes;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const patch = document.createElement('canvas');
  const patchCtx = patch.getContext('2d');
  let total = 0;
  const starts = source.map(frame => {
    const start = total;
    total += Math.max(20, (frame.gce?.delay || 10) * 10);
    return start;
  });
  let previous = null, restore = null;
  function background(dims, transparent) {
    ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
    const color = gif.gct?.[gif.lsd.backgroundColorIndex];
    if (!transparent && color) {
      ctx.fillStyle = `rgb(${color.join(',')})`;
      ctx.fillRect(dims.left, dims.top, dims.width, dims.height);
    }
  }
  const frames = [];
  try {
    background({ left: 0, top: 0, width, height }, source[0].gce?.extras.transparentColorGiven);
    for (const item of source) {
      if (previous?.disposalType === 2) background(previous.dims, previous.transparentIndex !== undefined);
      if (previous?.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
      const d = item.image.descriptor;
      if (!d.width || !d.height || d.left + d.width > width || d.top + d.height > height) {
        throw new Error('GIF frame lies outside its image dimensions.');
      }
      const frame = decompressFrame(item, gif.gct, true);
      restore = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
      patch.width = d.width;
      patch.height = d.height;
      patchCtx.putImageData(new ImageData(frame.patch, d.width, d.height), 0, 0);
      ctx.drawImage(patch, d.left, d.top);
      const snapshot = document.createElement('canvas');
      snapshot.width = frameWidth;
      snapshot.height = frameHeight;
      snapshot.getContext('2d').drawImage(canvas, 0, 0, frameWidth, frameHeight);
      frames.push(snapshot);
      previous = { dims: d, disposalType: frame.disposalType, transparentIndex: frame.transparentIndex };
      // Keep the loading screen responsive while preparing large animations.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    cachedBytes -= cacheBytes;
    frames.forEach(frame => { frame.width = frame.height = 0; });
    throw error;
  } finally {
    canvas.width = canvas.height = patch.width = patch.height = 0;
    restore = null;
  }
  const started = performance.now();
  return {
    frameCount: source.length,
    frameWidth,
    frameHeight,
    cacheBytes,
    total,
    frameAt(now) {
      const time = ((now - started) % total + total) % total;
      let low = 0, high = starts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (starts[mid] <= time) low = mid;
        else high = mid - 1;
      }
      return frames[low];
    },
  };
}
