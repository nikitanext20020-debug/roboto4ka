// Клиент ConvertHub API v2.
// Async workflow:
//   1. POST /v2/convert  (file, target_format) → job_id
//   2. GET /v2/jobs/{id} → status / progress / download_url
//   3. GET /v2/jobs/{id}/download → файл

import { DEFAULT_CONVERTHUB_TOKEN } from "./secrets";

const BASE = "https://api.converthub.com/v2";
const TOKEN_KEY = "roboto4ka.converthub_token";

export function getToken(): string {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored && stored.trim()) return stored;
  if (DEFAULT_CONVERTHUB_TOKEN && !DEFAULT_CONVERTHUB_TOKEN.startsWith("ВСТАВЬ")) {
    localStorage.setItem(TOKEN_KEY, DEFAULT_CONVERTHUB_TOKEN);
    return DEFAULT_CONVERTHUB_TOKEN;
  }
  return "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function resetTokenToDefault() {
  if (DEFAULT_CONVERTHUB_TOKEN) {
    localStorage.setItem(TOKEN_KEY, DEFAULT_CONVERTHUB_TOKEN);
  }
}

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "error";

export type ConvertProgress = {
  stage: "upload" | "processing" | "download";
  progress?: number;
};

export async function convertFile(
  file: File,
  targetFormat: string,
  onProgress?: (p: ConvertProgress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const token = getToken();
  if (!token) throw new Error("Токен ConvertHub не задан. Открой Настройки и введи API-ключ.");

  // 1. Submit
  onProgress?.({ stage: "upload" });
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target_format", targetFormat);

  const submit = await fetch(`${BASE}/convert`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
    signal,
  });

  if (!submit.ok) {
    const text = await submit.text().catch(() => "");
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 200) || submit.statusText}`);
  }

  const submitData = await submit.json().catch(() => null);
  const data = submitData?.data ?? submitData;
  const jobId: string | undefined = data?.job_id ?? data?.id ?? data?.uuid;
  if (!jobId) throw new Error("Не получен job_id в ответе сервера");

  // 2. Poll
  onProgress?.({ stage: "processing", progress: 0 });
  let downloadUrl = "";
  for (let i = 0; i < 120; i++) {
    if (signal?.aborted) throw new DOMException("Отменено", "AbortError");
    await sleep(2000);
    const r = await fetch(`${BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const d = j?.data ?? j;
    const status: JobStatus = d?.status;
    const progress: number | undefined = d?.progress;
    onProgress?.({ stage: "processing", progress });

    if (status === "completed") {
      downloadUrl = d?.download_url || `${BASE}/jobs/${jobId}/download`;
      break;
    }
    if (status === "failed" || status === "error") {
      throw new Error(`Ошибка задачи: ${JSON.stringify(d?.error ?? d).slice(0, 200)}`);
    }
  }
  if (!downloadUrl) throw new Error("Истекло время ожидания конвертации (4 мин)");

  // 3. Download
  onProgress?.({ stage: "download" });
  const dl = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!dl.ok) throw new Error(`Ошибка скачивания: HTTP ${dl.status}`);
  return dl.blob();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Целевые форматы по расширению источника
export const TARGETS_BY_EXT: Record<string, string[]> = {
  pdf:  ["docx", "doc", "txt", "rtf", "html", "jpg", "png", "epub"],
  docx: ["pdf", "doc", "txt", "rtf", "html", "odt", "epub"],
  doc:  ["pdf", "docx", "txt", "rtf", "html"],
  txt:  ["pdf", "docx", "doc", "html", "rtf"],
  rtf:  ["pdf", "docx", "doc", "txt", "html"],
  odt:  ["pdf", "docx", "doc", "txt", "html"],
  html: ["pdf", "docx", "doc", "txt", "png", "jpg"],
  htm:  ["pdf", "docx", "doc", "txt", "png", "jpg"],
  epub: ["pdf", "docx", "txt", "mobi", "azw3"],
  mobi: ["pdf", "epub", "txt"],
  fb2:  ["pdf", "epub", "docx", "txt"],
  xlsx: ["pdf", "xls", "csv", "ods", "html"],
  xls:  ["pdf", "xlsx", "csv", "ods", "html"],
  csv:  ["xlsx", "xls", "pdf", "html"],
  ods:  ["xlsx", "xls", "csv", "pdf"],
  pptx: ["pdf", "ppt", "png", "jpg"],
  ppt:  ["pdf", "pptx", "png", "jpg"],
  jpg:  ["png", "webp", "pdf", "bmp", "gif", "tiff", "ico", "heic", "avif"],
  jpeg: ["png", "webp", "pdf", "bmp", "gif", "tiff", "ico", "heic", "avif"],
  png:  ["jpg", "webp", "pdf", "bmp", "gif", "tiff", "ico", "heic", "avif"],
  webp: ["jpg", "png", "pdf", "bmp", "gif"],
  gif:  ["png", "jpg", "webp", "pdf", "mp4"],
  bmp:  ["jpg", "png", "webp", "pdf"],
  tiff: ["jpg", "png", "pdf"],
  tif:  ["jpg", "png", "pdf"],
  svg:  ["png", "jpg", "pdf"],
  ico:  ["png", "jpg"],
  heic: ["jpg", "png", "pdf"],
  avif: ["jpg", "png", "webp"],
  mp3:  ["wav", "ogg", "flac", "m4a", "aac", "wma"],
  wav:  ["mp3", "ogg", "flac", "m4a", "aac"],
  flac: ["mp3", "wav", "ogg", "m4a"],
  ogg:  ["mp3", "wav", "flac", "m4a"],
  m4a:  ["mp3", "wav", "flac", "ogg"],
  aac:  ["mp3", "wav", "ogg"],
  wma:  ["mp3", "wav", "ogg"],
  mp4:  ["mov", "webm", "avi", "mkv", "gif", "mp3", "wav"],
  mov:  ["mp4", "webm", "avi", "mkv", "gif", "mp3"],
  webm: ["mp4", "mov", "avi", "mkv", "gif"],
  avi:  ["mp4", "mov", "webm", "mkv"],
  mkv:  ["mp4", "mov", "webm", "avi"],
  zip:  ["rar", "7z", "tar"],
  rar:  ["zip", "7z"],
  "7z": ["zip", "rar"],
  tar:  ["zip", "7z"],
};

export function getTargets(ext: string): string[] {
  return TARGETS_BY_EXT[ext.toLowerCase()] ?? ["pdf", "txt", "png", "jpg"];
}
