// Обработка изображений локально через canvas: ресайз и сжатие в JPEG/WebP.

export type ImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0..1
  format?: "image/jpeg" | "image/webp" | "image/png";
};

export async function processImage(
  file: File,
  opts: ImageOptions = {}
): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  const maxW = opts.maxWidth ?? 1920;
  const maxH = opts.maxHeight ?? 1920;
  const quality = opts.quality ?? 0.82;
  const format = opts.format ?? "image/jpeg";

  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);

  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), format, quality)
  );
  return { blob, url: URL.createObjectURL(blob), width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load error"));
    img.src = src;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
