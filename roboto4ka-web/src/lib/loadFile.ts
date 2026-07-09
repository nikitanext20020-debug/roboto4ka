// Чтение файлов: xlsx, csv. Авто-детект строки заголовков.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { Record } from "./search";

const HEADER_HINTS = [
  "фио", "фамил", "имя", "отчеств", "name", "first", "last", "surname",
  "телеф", "phone", "mobile", "тел", "номер", "сотов",
  "дата", "рожд", "birth", "адрес", "address",
  "регион", "облас", "район", "район",
  "почт", "email", "mail",
  "id", "код",
  "организац", "учрежден", "управлен", "руководител", "привлечен", "сторонник",
  "курирующ", "зам", "название", "отделен", "филиал",
];

// Найти строку, которая выглядит как заголовки (максимум совпадений с подсказками)
function detectHeaderRow(rows: any[][]): number {
  let bestIdx = 0;
  let bestScore = 0;
  
  console.log("[detectHeaderRow] Analyzing first 15 rows...");
  
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] ?? [];
    let score = 0;
    let nonEmptyCount = 0;
    let numberCount = 0;
    let textCount = 0;
    
    for (const cell of row) {
      const val = String(cell ?? "").toLowerCase().trim();
      if (val.length === 0) continue;
      
      nonEmptyCount++;
      
      // Считаем числа и текст
      if (/^\d+$/.test(val)) {
        numberCount++;
      } else {
        textCount++;
      }
      
      // Пропускаем строки с очень длинными значениями (скорее всего данные, а не заголовки)
      if (val.length > 80) {
        score -= 5; // Штраф за длинные значения
        continue;
      }
      
      // Проверяем совпадения с ключевыми словами
      let hasKeyword = false;
      for (const hint of HEADER_HINTS) {
        if (val.includes(hint)) { 
          score += 3; // Большой бонус за ключевые слова
          hasKeyword = true;
          break; 
        }
      }
      
      // Дополнительный балл за короткие текстовые значения (вероятно заголовки)
      if (!hasKeyword && val.length > 2 && val.length < 50 && textCount > 0) {
        score += 0.5;
      }
    }
    
    // Бонус если есть и текст и немного чисел (например "№" и названия колонок)
    if (textCount >= 3 && numberCount <= 3) {
      score += 2;
    }
    
    // Штраф если слишком много чисел (скорее всего данные)
    if (numberCount > textCount && numberCount > 5) {
      score -= 3;
    }
    
    // Требуем минимум 3 непустых ячейки для заголовка
    if (nonEmptyCount >= 3) {
      console.log(`  Row ${i}: nonEmpty=${nonEmptyCount}, text=${textCount}, numbers=${numberCount}, score=${score.toFixed(1)}, sample:`, row.slice(0, 5));
      
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }
  
  console.log("[detectHeaderRow] Best header row:", bestIdx, "with score:", bestScore.toFixed(1));
  return bestIdx;
}

export async function loadFile(file: File): Promise<Record[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    return new Promise<Record[]>((resolve, reject) => {
      Papa.parse<Record>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          console.log("[loadFile] CSV loaded:", res.data.length, "rows. Columns:", Object.keys(res.data[0] ?? {}));
          resolve(res.data);
        },
        error: (err) => reject(err),
      });
    });
  }

  // xlsx / xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];

  // Сначала читаем как массив массивов чтобы найти строку заголовков
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false });
  const headerRowIdx = detectHeaderRow(aoa);
  const headers = (aoa[headerRowIdx] ?? []).map((h) => String(h ?? "").trim());
  console.log("[loadFile] header row:", headerRowIdx, "headers:", headers);

  const rows: Record[] = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    
    // Пропускаем строки которые выглядят как нумерация колонок (1, 2, 3, 4, 5...)
    // Проверяем: если большинство ячеек - это последовательные числа от 1 до N
    const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "");
    const numbers = nonEmpty.filter((c) => /^\d+$/.test(String(c ?? "").trim()));
    
    if (numbers.length >= 5 && numbers.length === nonEmpty.length) {
      // Проверяем что это последовательность 1, 2, 3, 4, 5...
      const nums = numbers.map((n) => parseInt(String(n).trim())).sort((a, b) => a - b);
      const isSequence = nums.every((n, idx) => n === idx + 1);
      
      if (isSequence) {
        console.log(`[loadFile] Skipping row ${i} (looks like column numbering):`, row.slice(0, 10));
        continue;
      }
    }
    
    const obj: Record = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] || `col_${j}`;
      obj[key] = String(row[j] ?? "").trim();
    }
    rows.push(obj);
  }
  console.log("[loadFile] rows:", rows.length, "first:", rows[0]);
  return rows;
}
