// Клиент TextGears API — орфография + пунктуация + грамматика + стиль.

import { DEFAULT_TEXTGEARS_KEY } from "./secrets";

const KEY_STORAGE = "roboto4ka.textgears_key";

export type ErrorType = "spelling" | "grammar" | "punctuation" | "style" | string;

export type TextGearsError = {
  id: string;
  offset: number;
  length: number;
  description: { en?: string; ru?: string };
  bad: string;
  better: string[];
  type: ErrorType;
};

export function getKey(): string {
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored && stored.trim()) return stored;
  if (DEFAULT_TEXTGEARS_KEY && DEFAULT_TEXTGEARS_KEY.startsWith("ВСТАВЬ") === false) {
    localStorage.setItem(KEY_STORAGE, DEFAULT_TEXTGEARS_KEY);
    return DEFAULT_TEXTGEARS_KEY;
  }
  return "";
}

export function setKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key);
}

export async function checkText(text: string): Promise<TextGearsError[]> {
  const key = getKey();
  if (!key) throw new Error("Не задан API-ключ TextGears");

  // POST для длинных текстов
  const fd = new FormData();
  fd.append("text", text);
  fd.append("language", "ru-RU");
  fd.append("key", key);

  const r = await fetch(`https://api.textgears.com/grammar`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  const json = await r.json();
  if (json.status === false) {
    throw new Error(`TextGears: ${json.error_description ?? json.message ?? "ошибка API"}`);
  }
  const errors = json.response?.errors ?? [];
  console.log("[TextGears] получено ошибок:", errors.length, errors);
  return errors;
}

export const TYPE_LABELS: Record<string, string> = {
  spelling: "Орфография",
  grammar: "Грамматика",
  punctuation: "Пунктуация",
  style: "Стиль",
};

export const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  spelling:    { bg: "bg-rose-500/15",    text: "text-rose-200",    border: "border-rose-400/30" },
  grammar:     { bg: "bg-amber-500/15",   text: "text-amber-200",   border: "border-amber-400/30" },
  punctuation: { bg: "bg-cyan-500/15",    text: "text-cyan-200",    border: "border-cyan-400/30" },
  style:       { bg: "bg-violet-500/15",  text: "text-violet-200",  border: "border-violet-400/30" },
};
