// Клиент Cloudinary — unsigned upload + URL transformations для видео.

import {
  DEFAULT_CLOUDINARY_CLOUD,
  DEFAULT_CLOUDINARY_PRESET,
} from "./secrets";

const CLOUD_KEY = "roboto4ka.cloudinary_cloud";
const PRESET_KEY = "roboto4ka.cloudinary_preset";

export function getCloud(): string {
  return localStorage.getItem(CLOUD_KEY) || DEFAULT_CLOUDINARY_CLOUD;
}
export function getPreset(): string {
  return localStorage.getItem(PRESET_KEY) || DEFAULT_CLOUDINARY_PRESET;
}
export function setCloud(v: string) { localStorage.setItem(CLOUD_KEY, v); }
export function setPreset(v: string) { localStorage.setItem(PRESET_KEY, v); }

export type UploadResult = {
  publicId: string;
  url: string;            // оригинал
  format: string;
  width: number;
  height: number;
  duration?: number;      // для видео
  bytes: number;
};

// Unsigned upload — не требует api_secret в браузере.
// Требует созданный upload preset со Signing Mode: Unsigned.
export async function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const cloud = getCloud();
  const preset = getPreset();

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloud}/video/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText);
          resolve({
            publicId: r.public_id,
            url: r.secure_url,
            format: r.format,
            width: r.width,
            height: r.height,
            duration: r.duration,
            bytes: r.bytes,
          });
        } catch (e: any) {
          reject(new Error("Ошибка парсинга ответа: " + e.message));
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const r = JSON.parse(xhr.responseText);
          msg = r.error?.message ?? msg;
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Ошибка сети при загрузке"));

    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", preset);
    xhr.send(fd);
  });
}

export type Transform = {
  // Размер
  width?: number;
  height?: number;
  crop?: "fill" | "fit" | "scale" | "crop" | "limit";
  // Время
  startOffset?: number;
  endOffset?: number;
  // Качество
  quality?: "auto" | "auto:low" | "auto:eco" | "auto:good" | "auto:best" | number;
  // Эффекты
  effect?: string; // 'grayscale', 'sepia', 'reverse', 'blur:300' etc.
  // Доп эффекты — массив
  extraEffects?: string[];
  // Скорость
  speedFactor?: number; // 0.5 = пол-скорости, 2 = 2x
  // Целевой формат
  format?: "mp4" | "webm" | "mov" | "gif" | "mp3";
  // Отключить звук
  audioCodec?: "none";
  // Поворот
  angle?: number;
  // Субтитры — overlay поверх видео
  subtitles?: string; // public_id .srt/.vtt файла
};

export function buildVideoUrl(publicId: string, t: Transform = {}): string {
  const cloud = getCloud();
  const parts: string[] = [];

  if (t.width) parts.push(`w_${t.width}`);
  if (t.height) parts.push(`h_${t.height}`);
  if (t.crop) parts.push(`c_${t.crop}`);
  if (t.quality !== undefined) parts.push(`q_${t.quality}`);
  if (t.startOffset !== undefined) parts.push(`so_${t.startOffset}`);
  if (t.endOffset !== undefined) parts.push(`eo_${t.endOffset}`);
  if (t.effect) parts.push(`e_${t.effect}`);
  if (t.extraEffects && t.extraEffects.length) {
    for (const e of t.extraEffects) parts.push(`e_${e}`);
  }
  if (t.speedFactor !== undefined) {
    const pct = Math.round(t.speedFactor * 100);
    parts.push(`e_accelerate:${pct - 100}`);
  }
  if (t.audioCodec === "none") parts.push("ac_none");
  if (t.angle !== undefined && t.angle !== 0) parts.push(`a_${t.angle}`);
  if (t.subtitles) parts.push(`l_subtitles:${t.subtitles},fl_layer_apply`);

  const transform = parts.length ? `${parts.join(",")}/` : "";
  const ext = t.format ?? "mp4";
  return `https://res.cloudinary.com/${cloud}/video/upload/${transform}${publicId}.${ext}`;
}

// Скачать blob по URL (с прогрессом)
export async function downloadAsBlob(
  url: string,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob";
    xhr.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Ошибка сети"));
    xhr.send();
  });
}


// ===== AI Auto-Captioning =====
// Использует Cloudinary Auto Transcript add-on. На некоторых аккаунтах требует активации.
// Возвращает URL транскрипта (.srt) и public_id для overlay.
export async function generateCaptions(
  publicId: string,
  language: string = "ru-RU"
): Promise<{ srtUrl: string; vttUrl: string; transcriptPublicId: string }> {
  const cloud = getCloud();
  // Cloudinary авто-генерирует транскрипт через .srt extension с трансформацией google_transcribe
  // URL вида: https://res.cloudinary.com/{cloud}/raw/upload/{public_id}.transcript
  const transcriptPublicId = `${publicId}.transcript`;

  // Триггер: запрашиваем .srt — Cloudinary создаст файл если включено
  const srtUrl = `https://res.cloudinary.com/${cloud}/raw/upload/${publicId}.transcript.srt`;
  const vttUrl = `https://res.cloudinary.com/${cloud}/raw/upload/${publicId}.transcript.vtt`;

  // Проверяем, что файл готов
  const r = await fetch(srtUrl);
  if (!r.ok) {
    throw new Error(
      `Транскрипт не готов или add-on Auto-Transcribe не активен.\n` +
      `Активируй: cloudinary.com/console/addons (бесплатный тир есть).\n` +
      `HTTP ${r.status}`
    );
  }
  return { srtUrl, vttUrl, transcriptPublicId };
}

// Принудительно запустить транскрибацию через Cloudinary Update API (требует серверной подписи)
// Для unsigned варианта используем .transcript URL — он триггерит обработку.
export async function triggerTranscription(publicId: string): Promise<void> {
  const cloud = getCloud();
  // Просто запросим .transcript — Cloudinary запустит обработку async.
  await fetch(`https://res.cloudinary.com/${cloud}/raw/upload/${publicId}.transcript`);
}


// ===== Photo upload =====
export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const cloud = getCloud();
  const preset = getPreset();
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloud}/image/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText);
          resolve({
            publicId: r.public_id, url: r.secure_url, format: r.format,
            width: r.width, height: r.height, bytes: r.bytes,
          });
        } catch (e: any) { reject(new Error("Ошибка ответа: " + e.message)); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { const r = JSON.parse(xhr.responseText); msg = r.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Ошибка сети"));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", preset);
    xhr.send(fd);
  });
}

// ===== AI Transformations для изображений =====
export type AiOp =
  | { type: "bg_remove" }
  | { type: "upscale" }
  | { type: "enhance" }
  | { type: "restore" }
  | { type: "drop_shadow" }
  | { type: "extract"; prompt: string }
  | { type: "gen_fill"; aspectRatio?: string; prompt?: string }
  | { type: "gen_replace"; from: string; to: string }
  | { type: "gen_bg_replace"; prompt: string }
  | { type: "gen_recolor"; prompt: string; toColor: string };

export function buildAiUrl(publicId: string, op: AiOp, format: string = "jpg"): string {
  const cloud = getCloud();
  let trans = "";
  switch (op.type) {
    case "bg_remove":
      trans = "e_background_removal";
      break;
    case "upscale":
      trans = "e_upscale";
      break;
    case "enhance":
      trans = "e_enhance";
      break;
    case "restore":
      trans = "e_gen_restore";
      break;
    case "drop_shadow":
      trans = "e_dropshadow:azimuth_215;elevation_45;spread_25";
      break;
    case "extract":
      trans = `e_extract:prompt_${encodeURIComponent(op.prompt)}`;
      break;
    case "gen_fill": {
      const ar = op.aspectRatio ? `,ar_${op.aspectRatio}` : "";
      const p = op.prompt ? `;prompt_(${encodeURIComponent(op.prompt)})` : "";
      trans = `b_gen_fill${p}${ar},c_pad`;
      break;
    }
    case "gen_replace":
      trans = `e_gen_replace:from_${encodeURIComponent(op.from)};to_${encodeURIComponent(op.to)}`;
      break;
    case "gen_bg_replace":
      trans = `e_gen_background_replace:prompt_${encodeURIComponent(op.prompt)}`;
      break;
    case "gen_recolor":
      trans = `e_gen_recolor:prompt_(${encodeURIComponent(op.prompt)});to-color_${op.toColor.replace("#", "")}`;
      break;
  }
  return `https://res.cloudinary.com/${cloud}/image/upload/${trans}/${publicId}.${format}`;
}

// Опрос URL до готовности (Cloudinary возвращает 423/202 пока обрабатывает)
export async function waitForReady(url: string, maxTries: number = 30): Promise<Blob> {
  for (let i = 0; i < maxTries; i++) {
    const r = await fetch(url);
    if (r.ok) return r.blob();
    if (r.status !== 423 && r.status !== 202) {
      throw new Error(`HTTP ${r.status}`);
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("Таймаут обработки. Попробуй ещё раз.");
}