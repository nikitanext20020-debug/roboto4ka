// src/lib/runflow.ts

import { DEFAULT_RUNFLOW_KEY } from "./secrets";
import { uploadImage } from "./cloudinary";

const MODEL = "google/nano-banana-2/edit";
const BASE = "https://api.runflow.io/v1";

const KEY_STORAGE = "roboto4ka.runflow_key";

export type RunflowResult = {
  url: string;
  width?: number;
  height?: number;
};

export function getRunflowKey(): string {
  const stored = localStorage.getItem(KEY_STORAGE);

  if (stored?.trim()) {
    return stored.trim();
  }

  if (
    DEFAULT_RUNFLOW_KEY &&
    !DEFAULT_RUNFLOW_KEY.startsWith("ВСТАВЬ")
  ) {
    localStorage.setItem(KEY_STORAGE, DEFAULT_RUNFLOW_KEY);
    return DEFAULT_RUNFLOW_KEY;
  }

  return "";
}

export function setRunflowKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractImageUrl(data: any): RunflowResult | null {
  console.log("RUNFLOW DATA:", data);

  if (!data) return null;

  // output.outputs[]
  if (data.output?.outputs?.length) {
    const o = data.output.outputs[0];

    if (o?.url) {
      return {
        url: o.url,
        width: o.width,
        height: o.height,
      };
    }
  }

  // outputs[]
  if (data.outputs?.length) {
    const o = data.outputs[0];

    if (o?.url) {
      return {
        url: o.url,
        width: o.width,
        height: o.height,
      };
    }
  }

  // output[]
  if (Array.isArray(data.output) && data.output[0]?.url) {
    const o = data.output[0];

    return {
      url: o.url,
      width: o.width,
      height: o.height,
    };
  }

  // output.url
  if (data.output?.url) {
    return {
      url: data.output.url,
      width: data.output.width,
      height: data.output.height,
    };
  }

  // direct url
  if (data.url) {
    return {
      url: data.url,
    };
  }

  return null;
}

export async function editImageWithAI(
  file: File,
  prompt: string,
  onProgress?: (msg: string) => void
): Promise<RunflowResult> {
  const key = getRunflowKey();

  if (!key) {
    throw new Error("Не задан RunFlow API key");
  }

  onProgress?.("Загрузка фото...");

  const uploaded = await uploadImage(file);

  onProgress?.("Отправка в Nano Banana...");

  // ---------------------------------------------------
  // CREATE RUN
  // ---------------------------------------------------
  const response = await fetch(
    `${BASE}/models/${MODEL}/runs`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        input: {
          prompt,

          image_urls: [uploaded.url],

          num_images: 1,

          output_format: "webp",

          resolution: "2K",

          safety_tolerance: "6",
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `RunFlow HTTP ${response.status}\n${text}`
    );
  }

  const data = await response.json();

  console.log("CREATE:", data);

  // ---------------------------------------------------
  // IMMEDIATE RESULT
  // ---------------------------------------------------
  const immediate = extractImageUrl(data);

  if (immediate) {
    return immediate;
  }

  // ---------------------------------------------------
  // RUN ID
  // ---------------------------------------------------
  const runId =
    data.id ||
    data.run_id ||
    data.data?.id;

  if (!runId) {
    throw new Error(
      "RunFlow не вернул run_id"
    );
  }

  onProgress?.("Nano Banana генерирует...");

  // ---------------------------------------------------
  // POLLING
  // ---------------------------------------------------
  for (let i = 0; i < 120; i++) {
    await sleep(3000);

    onProgress?.(
      `Генерация ${i * 3}с`
    );

    const poll = await fetch(
      `${BASE}/runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      }
    );

    if (!poll.ok) {
      console.warn("POLL HTTP:", poll.status);
      continue;
    }

    const pollData = await poll.json();

    console.log("POLL:", pollData);

    const result = extractImageUrl(pollData);

    if (result) {
      return result;
    }

    const status =
      pollData.status ||
      pollData.status_code;

    if (
      status === "failed" ||
      status === "cancelled" ||
      status === "error"
    ) {
      throw new Error(
        pollData.error?.message ||
        pollData.failure_message ||
        "Nano Banana ошибка"
      );
    }
  }

  throw new Error(
    "Nano Banana генерировал слишком долго"
  );
}