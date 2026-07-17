const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 0.8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel yüklenemedi.'));
    };
    img.src = url;
  });
}

// Center-crops to a 1:1 square, resizes to AVATAR_SIZE, and encodes as webp —
// keeps avatar uploads consistently small (~15-30KB) regardless of source size.
export async function processAvatarImage(file: File): Promise<Blob> {
  const image = await loadImage(file);

  const cropSize = Math.min(image.width, image.height);
  const sx = (image.width - cropSize) / 2;
  const sy = (image.height - cropSize) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas bağlamı oluşturulamadı.');
  ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Görsel işlenemedi.'))),
      'image/webp',
      AVATAR_QUALITY,
    );
  });
}
