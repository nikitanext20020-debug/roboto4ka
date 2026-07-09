// Экспорт xlsx с цветной подсветкой строк (найденные зелёным, ненайденные красным).
// Использует exceljs для стилей ячеек.

import ExcelJS from "exceljs";
import { downloadBlob } from "./image";
import type { SearchHit } from "./search";

const GREEN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD4EDDA" }, // светло-зелёный
};

const RED_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8D7DA" }, // светло-красный
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF343A40" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const COLUMNS = [
  { header: "Запрос", key: "query", width: 25 },
  { header: "ФИО", key: "fio", width: 30 },
  { header: "Телефон", key: "phone", width: 18 },
  { header: "Дата рождения", key: "birthday", width: 15 },
  { header: "Адрес", key: "address", width: 35 },
  { header: "Регион", key: "region", width: 20 },
  { header: "Отделение", key: "branch", width: 20 },
  { header: "Email", key: "email", width: 25 },
  { header: "Статус", key: "status", width: 18 },
  { header: "ID", key: "id", width: 12 },
];

export type ColorMode = "found_green" | "not_found_red" | "both";

export async function exportColoredXlsx(
  hits: SearchHit[],
  notFound: string[],
  mode: ColorMode = "both"
) {
  const wb = new ExcelJS.Workbook();

  // Лист "Найденные"
  if (mode === "found_green" || mode === "both") {
    const ws = wb.addWorksheet("Найденные");
    ws.columns = COLUMNS;
    // Стиль заголовков
    ws.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    for (const h of hits) {
      const row = ws.addRow(h);
      row.eachCell((cell) => {
        cell.fill = GREEN_FILL;
      });
    }
    ws.autoFilter = { from: "A1", to: `J${ws.rowCount}` };
  }

  // Лист "Не найденные"
  if (mode === "not_found_red" || mode === "both") {
    const ws = wb.addWorksheet("Не найденные");
    ws.columns = [{ header: "Запрос", key: "query", width: 40 }];
    ws.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    for (const q of notFound) {
      const row = ws.addRow({ query: q });
      row.eachCell((cell) => {
        cell.fill = RED_FILL;
      });
    }
  }

  // Генерация файла
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename = mode === "found_green"
    ? "найденные_зелёным.xlsx"
    : mode === "not_found_red"
    ? "не_найденные_красным.xlsx"
    : "результат_с_цветами.xlsx";
  downloadBlob(blob, filename);
}

// Экспорт исходной базы с подсветкой строк
export async function exportBaseWithHighlights(
  allRows: Record<string, any>[],
  foundIndices: Set<number>,
  notFoundIndices: Set<number>,
  mode: "found" | "not_found" | "both",
  originalFileName?: string
) {
  console.log("=== DEBUG exportBaseWithHighlights ===");
  console.log("allRows.length:", allRows.length);
  console.log("foundIndices:", Array.from(foundIndices));
  console.log("notFoundIndices.size:", notFoundIndices.size);
  console.log("mode:", mode);
  console.log("Первая строка allRows:", allRows[0]);
  console.log("Ключи первой строки:", Object.keys(allRows[0]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("База");

  if (allRows.length === 0) return;

  // Заголовки из ключей первой строки (исключаем служебные поля с _)
  const keys = Object.keys(allRows[0]).filter((k) => !k.startsWith("_"));
  console.log("Ключи для экспорта (без _):", keys);
  
  ws.columns = keys.map((k) => ({ header: k, key: k, width: 18 }));
  ws.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  // Добавляем строки с цветовой разметкой
  for (let i = 0; i < allRows.length; i++) {
    const rowData: Record<string, any> = {};
    // Копируем только нужные поля (без служебных _)
    for (const k of keys) {
      rowData[k] = allRows[i][k];
    }
    const row = ws.addRow(rowData);
    
    const isFound = foundIndices.has(i);
    const isNotFound = notFoundIndices.has(i);

    // Применяем цвета в зависимости от режима
    if (mode === "found" && isFound) {
      row.eachCell((cell) => { cell.fill = GREEN_FILL; });
    } else if (mode === "not_found" && isNotFound) {
      row.eachCell((cell) => { cell.fill = RED_FILL; });
    } else if (mode === "both") {
      if (isFound) {
        row.eachCell((cell) => { cell.fill = GREEN_FILL; });
      } else if (isNotFound) {
        row.eachCell((cell) => { cell.fill = RED_FILL; });
      }
    }
  }

  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + keys.length)}${ws.rowCount}` };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  
  // Формируем имя файла
  const baseName = originalFileName 
    ? originalFileName.replace(/\.(xlsx|xls|csv)$/i, "")
    : "база";
  
  const filename = mode === "found"
    ? `${baseName}_найденные_зелёным.xlsx`
    : mode === "not_found"
    ? `${baseName}_ненайденные_красным.xlsx`
    : `${baseName}_с_пометками.xlsx`;
  
  console.log("Сохраняем файл:", filename);
  console.log("Всего строк в файле:", ws.rowCount);
    
  downloadBlob(blob, filename);
}
