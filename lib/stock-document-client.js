export const imageOnlyStockDocumentTypes = new Set([
  'transporter_bill',
  'gatepass',
  'delivery_receipt',
  'customer_acknowledgement',
]);

export function isImageOnlyStockDocument(documentType) {
  return imageOnlyStockDocumentTypes.has(documentType);
}

export function getStockDocumentFileAccept(documentType) {
  return isImageOnlyStockDocument(documentType)
    ? 'image/*'
    : '.pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv,.doc,.docx';
}

export async function compressStockImageFile(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const compressedBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));

  if (!compressedBlob) {
    return file;
  }

  const compressedFileName = `${file.name.replace(/\.[^.]+$/, '')}.webp`;
  return new File([compressedBlob], compressedFileName, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

export async function prepareStockDocumentFile(file, documentType) {
  if (isImageOnlyStockDocument(documentType)) {
    return compressStockImageFile(file);
  }

  return file;
}