import { imageSize } from 'image-size';

const formats = new Map([
  ['image/jpeg', ['jpg', 'jpeg']], ['image/webp', ['webp']], ['image/png', ['png']],
  ['image/heic', ['heif', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']],
  ['image/heif', ['heif', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']],
]);

/** @param {{ width: number, height: number }} dimensions */
function withinLimit({ width, height }) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 &&
    width <= 16384 && height <= 16384 && width * height <= 40000000;
}

/** Read container dimensions before decoding or forwarding the picture.
 * @param {Uint8Array} bytes @param {string} mimeType */
export function supportedDimensions(bytes, mimeType) {
  try {
    const dimensions = imageSize(bytes);
    if (!formats.get(mimeType)?.includes(dimensions.type || '') || !withinLimit(dimensions)) return false;
    return (dimensions.images || []).every(withinLimit);
  } catch {
    return false;
  }
}
