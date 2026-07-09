// Проверка орфографии через Яндекс.Спеллер. Бесплатно, без ключа.

export type SpellMistake = {
  code: number;
  pos: number;
  row: number;
  col: number;
  len: number;
  word: string;
  s: string[];
};

const URL = "https://speller.yandex.net/services/spellservice.json/checkText";

export async function checkSpelling(text: string): Promise<SpellMistake[]> {
  const params = new URLSearchParams();
  params.append("text", text);
  params.append("lang", "ru,en");
  params.append("options", "0");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
