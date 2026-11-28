import { supportedDimensions } from './imageDimensions.js';

const maxInputBytes = 12 * 1024 * 1024;
const maxEncodedChars = 1800000;

export async function prepareComposerPhoto(file) {
  if (!file.size || file.size > maxInputBytes) throw new Error('Choose a photo up to 12 MB.');
  if (!supportedDimensions(new Uint8Array(await file.arrayBuffer()), file.type)) {
    throw new Error('Choose a readable JPEG, PNG, WebP or HEIF photo up to 40 megapixels.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL('image/jpeg', 0.86);
    const base64 = preview.split(',')[1];
    if (!preview.startsWith('data:image/jpeg;') || !base64 || base64.length > maxEncodedChars) throw new Error();
    return { base64, mimeType: 'image/jpeg', preview };
  } catch {
    throw new Error('This photo could not be prepared. Try a smaller JPEG or PNG.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
