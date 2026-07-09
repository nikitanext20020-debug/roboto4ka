// Мост к Electron API. Если запущено в браузере — все методы no-op.

declare global {
  interface Window {
    electron?: {
      onOpenFile: (cb: (filePath: string) => void) => void;
      readFile: (filePath: string) => Promise<{ ok: boolean; name?: string; data?: string; error?: string }>;
    };
  }
}

export const isElectron = typeof window !== "undefined" && !!window.electron;

export function onOpenFile(cb: (filePath: string) => void) {
  if (window.electron) window.electron.onOpenFile(cb);
}

export async function readFileFromDisk(filePath: string): Promise<File | null> {
  if (!window.electron) return null;
  const res = await window.electron.readFile(filePath);
  if (!res.ok || !res.data || !res.name) return null;
  // base64 → Blob → File
  const binary = atob(res.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = res.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "mp4" ? "video/mp4"
    : ext === "csv" ? "text/csv"
    : "application/octet-stream";
  return new File([bytes], res.name, { type: mime });
}

// Определить, в какой редактор открывать файл по расширению
export function pageForFile(name: string): "media" | "video" | "search" | "text" | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)) return "media";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  if (["xlsx", "xls", "csv"].includes(ext)) return "search";
  if (["txt", "md"].includes(ext)) return "text";
  return null;
}
