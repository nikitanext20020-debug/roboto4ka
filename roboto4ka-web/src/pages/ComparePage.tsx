import { useRef, useState, useCallback } from "react";
import { Upload, Play, Download, X, Users } from "lucide-react";
import * as XLSX from "xlsx";
import PageHeader from "../components/PageHeader";
import LoadingOverlay from "../components/LoadingOverlay";
import { Strictness, THRESHOLDS } from "../lib/search";

// ===================== Утилиты (порт из app(6).html) =====================

function normStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizePhone(v: unknown): string | null {
  let s = normStr(v);
  if (!s || s.toLowerCase() === "nan") return null;
  if (/^[\d.,]+e\+?\d+$/i.test(s)) {
    const num = Number(s.replace(",", "."));
    if (isFinite(num)) s = num.toFixed(0);
  }
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  else if (d.length === 10) d = "7" + d;
  return d.length === 11 ? d : null;
}

function normalizeName(v: unknown): string {
  const s = normStr(v);
  if (!s || s.toLowerCase() === "nan") return "";
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeFuzzy(name: string): string {
  if (!name) return "";
  return name.replace(/ё/g, "е").replace(/[-\s]+$/, "").replace(/\s+/g, " ").trim();
}

function canonicalKey(name: string): string {
  return name ? name.split(" ").sort().join(" ") : "";
}

// LCS алгоритм
function _lcsBlock(a: string, alo: number, ahi: number, b: string, blo: number, bhi: number): [number, number, number] {
  let besti = alo, bestj = blo, bestsize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>();
    const ch = a[i];
    for (let j = blo; j < bhi; j++) {
      if (b[j] === ch) {
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
    }
    j2len = newj2len;
  }
  return [besti, bestj, bestsize];
}

function _matchedCount(a: string, alo: number, ahi: number, b: string, blo: number, bhi: number): number {
  if (alo >= ahi || blo >= bhi) return 0;
  const [i, j, k] = _lcsBlock(a, alo, ahi, b, blo, bhi);
  if (k === 0) return 0;
  return k + _matchedCount(a, alo, i, b, blo, j) + _matchedCount(a, i + k, ahi, b, j + k, bhi);
}

function simRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const total = a.length + b.length;
  return (2 * _matchedCount(a, 0, a.length, b, 0, b.length)) / total;
}

function fuzzySim(a: string, b: string): number {
  if (!a || !b) return 0;
  const sw = (s: string) => s.split(" ").sort().join(" ");
  return Math.max(simRatio(a, b), simRatio(sw(a), sw(b)));
}

function surnameSim(a: string, b: string): number {
  return simRatio(a.split(" ")[0] ?? "", b.split(" ")[0] ?? "");
}

function namePatronymicSim(a: string, b: string): number {
  const ra = a.split(" ").slice(1).join(" ");
  const rb = b.split(" ").slice(1).join(" ");
  if (!ra || !rb) return 0;
  return simRatio(ra, rb);
}

function wordsAlignedOk(a: string, b: string, wordThresh: number): boolean {
  const wa = a.split(" ").filter(Boolean);
  const wb = b.split(" ").filter(Boolean);
  if (wa.length !== wb.length) return true;
  for (let i = 0; i < wa.length; i++) {
    if (simRatio(wa[i], wb[i]) < wordThresh) {
      const sa = [...wa].sort(), sb = [...wb].sort();
      for (let j = 0; j < sa.length; j++) if (simRatio(sa[j], sb[j]) < wordThresh) return false;
      return true;
    }
  }
  return true;
}

type CharMap = { [ch: string]: number };
function charCounts(s: string): CharMap {
  const cnt: CharMap = Object.create(null);
  for (const ch of s) cnt[ch] = (cnt[ch] ?? 0) + 1;
  return cnt;
}

// ===================== Индекс для сверки =====================

type FuzzyMeta = { name: string; len: number; cnt: CharMap };

interface MatchIndex {
  exact: Set<string>;
  fuzzy: Set<string>;
  canon: Set<string>;
  phones: Set<string>;
  phoneToNames: Map<string, string[]>;
  fuzzyMeta: FuzzyMeta[];
}

function makeMatchIndex(): MatchIndex {
  return {
    exact: new Set(), fuzzy: new Set(), canon: new Set(),
    phones: new Set(), phoneToNames: new Map(), fuzzyMeta: [],
  };
}

function addToMatchIndex(idx: MatchIndex, rawFio: unknown, rawPhone: unknown): void {
  const nExact = normalizeName(rawFio);
  const nFuzz = normalizeFuzzy(nExact);
  const nCanon = canonicalKey(nFuzz);
  const phone = normalizePhone(rawPhone);
  if (nExact) idx.exact.add(nExact);
  if (nFuzz && !idx.fuzzy.has(nFuzz)) {
    idx.fuzzy.add(nFuzz);
    idx.fuzzyMeta.push({ name: nFuzz, len: nFuzz.length, cnt: charCounts(nFuzz) });
  }
  if (nCanon) idx.canon.add(nCanon);
  if (phone) {
    idx.phones.add(phone);
    if (nFuzz) {
      if (!idx.phoneToNames.has(phone)) idx.phoneToNames.set(phone, []);
      idx.phoneToNames.get(phone)!.push(nFuzz);
    }
  }
}

type MatchStatus = "exact" | "typo" | "namechange" | "phone" | "disputed" | "notfound" | "empty";
interface MatchResult { status: MatchStatus; matchedName?: string; sim?: number; }

function matchRecord(
  idx: MatchIndex,
  rawFio: unknown,
  rawPhone: unknown,
  strictness: Strictness = "normal"
): MatchResult {
  const nExact = normalizeName(rawFio);
  const nFuzz = normalizeFuzzy(nExact);
  const nCanon = canonicalKey(nFuzz);
  const phone = normalizePhone(rawPhone);

  const thresh = THRESHOLDS[strictness];

  if (!nExact && !phone) return { status: "empty" };
  if (nExact && idx.exact.has(nExact)) return { status: "exact" };
  if (nFuzz && idx.fuzzy.has(nFuzz)) return { status: "exact" };
  if (nCanon && idx.canon.has(nCanon)) return { status: "exact" };

  if (phone && idx.phones.has(phone)) {
    const cands = idx.phoneToNames.get(phone) ?? [];
    if (!nFuzz) return { status: "phone" };
    let bestSim = 0, bestCand = cands[0] ?? "";
    for (const cand of cands) {
      const overall = fuzzySim(nFuzz, cand);
      if (overall > bestSim) { bestSim = overall; bestCand = cand; }
      if (overall >= thresh.phoneFuzzy && surnameSim(nFuzz, cand) >= thresh.surname)
        return { status: "typo", matchedName: cand, sim: overall };
      if (namePatronymicSim(nFuzz, cand) >= thresh.nameChangeFnp)
        return { status: "namechange", matchedName: cand, sim: overall };
    }
    return { status: "disputed", matchedName: bestCand, sim: bestSim };
  }

  if (nFuzz) {
    const la = nFuzz.length;
    const qCnt = charCounts(nFuzz);
    for (const meta of idx.fuzzyMeta) {
      const lb = meta.len;
      if ((2 * Math.min(la, lb)) / (la + lb) < thresh.nameOnly) continue;
      let mm = 0;
      for (const ch in meta.cnt) { const q = qCnt[ch]; if (q) mm += Math.min(q, meta.cnt[ch]); }
      if ((2 * mm) / (la + lb) < thresh.nameOnly) continue;
      const overall = fuzzySim(nFuzz, meta.name);
      if (overall >= thresh.nameOnly && surnameSim(nFuzz, meta.name) >= thresh.surname && wordsAlignedOk(nFuzz, meta.name, thresh.word))
        return { status: "typo", matchedName: meta.name, sim: overall };
    }
  }
  return { status: "notfound" };
}

// ===================== Excel утилиты =====================

function sheetRows(wb: XLSX.WorkBook, sheetName: string): string[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "", blankrows: true });
  const colPad = new Array(range.s.c).fill("");
  const rows: string[][] = [];
  for (let i = 0; i < range.s.r; i++) rows.push([]);
  for (const r of raw) rows.push([...colPad, ...(r as string[])]);
  return rows;
}

function colLetter(i: number): string {
  let s = "", n = i;
  for (;;) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; if (n < 0) break; }
  return s;
}

function guessColumns(rows: string[][]): { headerRow: number; fio: number; fam: number; im: number; ot: number; phone: number } {
  const g = { headerRow: -1, fio: -1, fam: -1, im: -1, ot: -1, phone: -1 };
  let bestHits = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || [];
    const cur = { fio: -1, fam: -1, im: -1, ot: -1, phone: -1 };
    let hits = 0;
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || "").toLowerCase().trim();
      if (!v) continue;
      if (cur.fio < 0 && (v.includes("фио") || v.includes("ф.и.о") || (v.includes("фамилия") && v.includes("имя")))) { cur.fio = c; hits++; continue; }
      if (cur.fam < 0 && v.startsWith("фамил")) { cur.fam = c; hits++; continue; }
      if (cur.im < 0 && (v === "имя" || v.startsWith("имя"))) { cur.im = c; hits++; continue; }
      if (cur.ot < 0 && v.startsWith("отчеств")) { cur.ot = c; hits++; continue; }
      if (cur.phone < 0 && (v.includes("телефон") || v.includes("тел.") || v === "тел" || v.includes("номер тел"))) { cur.phone = c; hits++; continue; }
    }
    if (hits > bestHits) { bestHits = hits; g.headerRow = r; Object.assign(g, cur); }
  }
  return g;
}

function colWidths(aoa: unknown[][]): { wch: number }[] {
  const nCols = Math.max(...aoa.map(r => (r as unknown[]).length), 1);
  const cols: { wch: number }[] = [];
  const lim = Math.min(aoa.length, 300);
  for (let c = 0; c < nCols; c++) {
    let w = 8;
    for (let r = 0; r < lim; r++) w = Math.max(w, String(((aoa[r] as unknown[]) || [])[c] ?? "").length);
    cols.push({ wch: Math.min(w + 2, 45) });
  }
  return cols;
}

// ===================== Типы =====================

type FioMode = "single" | "three";

interface FileCfg {
  start: number; fioMode: FioMode;
  fio: number; fam: number; im: number; ot: number; phone: number;
}

interface FileState {
  name: string; buf: ArrayBuffer; wb: XLSX.WorkBook;
  sheet: string; rows: string[][]; cfg: FileCfg;
}

type RunMode = "color" | "export" | "dupes";
type ExpWhat = "both" | "found" | "notfound";

const STATUS_LABEL: Record<string, string> = {
  exact: "найден", typo: "найден (опечатка)", namechange: "найден (смена фамилии?)",
  phone: "телефон совпал", disputed: "спорный: телефон совпал, ФИО другое",
  notfound: "не найден", empty: "",
};
const MATCHED = new Set(["exact", "typo", "namechange", "phone"]);

// ===================== Основной компонент =====================

export default function ComparePage({ onBack }: { onBack: () => void }) {
  const [f1, setF1] = useState<FileState | null>(null);
  const [f2, setF2] = useState<FileState | null>(null);
  const [matchColor, setMatchColor] = useState("92D050");
  const [runMode, setRunMode] = useState<RunMode>("color");
  const [expWhat, setExpWhat] = useState<ExpWhat>("both");
  const [optRed, setOptRed] = useState(true);
  const [optLabel, setOptLabel] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");
  const [stats, setStats] = useState<{ label: string; value: number; color: string }[]>([]);
  const [disputed, setDisputed] = useState<{ row: number; fio: string; phone: string; dbName: string; sim: number }[]>([]);
  const [dupeGroups, setDupeGroups] = useState<{ excelRow: number; fio: string; ph: string; type: string }[][]>([]);
  const [strictness, setStrictness] = useState<Strictness>("normal");
  const [dupDelLog, setDupDelLog] = useState(true);
  const [dupDelPhone, setDupDelPhone] = useState(false);
  const [done, setDone] = useState(false);

  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);

  const tick = () => new Promise<void>(r => setTimeout(r, 0));

  async function handleFile(which: 1 | 2, file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.SheetNames[0];
      const rows = sheetRows(wb, sheet);
      const g = guessColumns(rows);
      const cfg: FileCfg = {
        start: g.headerRow >= 0 ? g.headerRow + 2 : 2,
        fioMode: (g.fio < 0 && g.fam >= 0 && g.im >= 0) ? "three" : "single",
        fio: g.fio, fam: g.fam, im: g.im, ot: g.ot, phone: g.phone,
      };
      const fs: FileState = { name: file.name, buf, wb, sheet, rows, cfg };
      if (which === 1) setF1(fs); else setF2(fs);
    } catch (e: any) { alert("Не удалось прочитать файл: " + (e?.message ?? e)); }
  }

  function getFio(row: string[], cfg: FileCfg): string {
    if (cfg.fioMode === "single") return cfg.fio >= 0 ? (row[cfg.fio] ?? "") : "";
    return [cfg.fam, cfg.im, cfg.ot].filter(c => c >= 0)
      .map(c => String(row[c] || "").trim())
      .filter(p => p && p.toLowerCase() !== "nan").join(" ");
  }

  function validateCfg(fs: FileState, label: string): string | null {
    if (fs.cfg.fioMode === "single" && fs.cfg.fio < 0) return `${label}: выберите столбец с ФИО.`;
    if (fs.cfg.fioMode === "three" && (fs.cfg.fam < 0 || fs.cfg.im < 0)) return `${label}: выберите Фамилию и Имя.`;
    return null;
  }

  async function buildColored(f: FileState, results: { excelRow: number; res: MatchResult }[]): Promise<Blob> {
    const rows = f.rows;
    const maxCols = Math.min(Math.max(...rows.map(r => r.length), 1), 60);
    const aoa: unknown[][] = rows.map(row => {
      const vals: unknown[] = Array.from({ length: maxCols }, (_, c) => (row || [])[c] ?? "");
      if (optLabel) vals.push("");
      return vals;
    });
    if (optLabel) {
      const hi = Math.max(f.cfg.start - 2, 0);
      (aoa[hi] as unknown[])[maxCols] = "Результат сверки";
      for (const { excelRow, res } of results)
        if (aoa[excelRow - 1]) (aoa[excelRow - 1] as unknown[])[maxCols] = STATUS_LABEL[res.status];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const mkFill = (rgb: string) => ({ fill: { patternType: "solid", fgColor: { rgb } } });
    const lastC = optLabel ? maxCols : maxCols - 1;
    for (const { excelRow, res } of results) {
      let s: unknown = null;
      if (MATCHED.has(res.status)) s = mkFill(matchColor);
      else if (res.status === "disputed") s = mkFill("FFD966");
      else if (res.status === "notfound" && optRed) s = mkFill("FF0000");
      if (!s) continue;
      for (let c = 0; c <= lastC; c++) {
        const addr = XLSX.utils.encode_cell({ r: excelRow - 1, c });
        if (!(ws as any)[addr]) (ws as any)[addr] = { t: "s", v: "" };
        (ws as any)[addr].s = s;
      }
    }
    (ws as any)["!cols"] = colWidths(aoa);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, "Результат");
    return new Blob([XLSX.write(wb2, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function buildExport(f: FileState, results: { excelRow: number; res: MatchResult }[], what: ExpWhat): Promise<Blob> {
    const hi = f.cfg.start - 2;
    const srcH = hi >= 0 ? (f.rows[hi] || []) : [];
    const maxCols = Math.min(Math.max(...f.rows.map(r => r.length), 1), 60);
    const headers = [...Array.from({ length: maxCols }, (_, c) => String(srcH[c] || "").trim() || colLetter(c)), "Результат сверки"];
    const wb2 = XLSX.utils.book_new();
    const addSheet = (title: string, list: { excelRow: number; res: MatchResult }[]) => {
      const aoa: unknown[][] = [headers, ...list.map(({ excelRow, res }) => {
        const src = f.rows[excelRow - 1] || [];
        return [...Array.from({ length: maxCols }, (_, c) => src[c] ?? ""), STATUS_LABEL[res.status]];
      })];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if ((ws as any)[addr]) (ws as any)[addr].s = { font: { bold: true } };
      }
      (ws as any)["!cols"] = colWidths(aoa);
      XLSX.utils.book_append_sheet(wb2, ws, title);
    };
    const found = results.filter(r => MATCHED.has(r.res.status));
    const notfound = results.filter(r => r.res.status === "notfound");
    const disp = results.filter(r => r.res.status === "disputed");
    if (what === "found" || what === "both") addSheet("Найдены", found);
    if (what === "notfound" || what === "both") addSheet("Не найдены", notfound);
    if (disp.length) addSheet("Спорные", disp);
    if (!wb2.SheetNames.length) addSheet("Пусто", []);
    return new Blob([XLSX.write(wb2, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const runCompare = async () => {
    if (!f1) return;
    setError(""); setDone(false); setResultBlob(null); setStats([]); setDisputed([]); setDupeGroups([]);
    setLoading(true); setProgress(0);
    try {
      if (runMode === "dupes") {
        const rows = f1.rows;
        const idx = makeMatchIndex();
        const byFuzz = new Map<string, number>();
        const byCanon = new Map<string, number>();
        const byPhone = new Map<string, number>();
        const groups: { excelRow: number; fio: string; ph: string; type: string }[][] = [];
        const total = Math.max(rows.length - (f1.cfg.start - 1), 1);

        for (let i = f1.cfg.start - 1; i < rows.length; i++) {
          const row = rows[i] || [];
          const fio = getFio(row, f1.cfg);
          const rawPhone = f1.cfg.phone >= 0 ? row[f1.cfg.phone] : "";
          const nFuzz = normalizeFuzzy(normalizeName(fio));
          const nCanon = canonicalKey(nFuzz);
          const ph = normalizePhone(rawPhone);

          if (!nFuzz && !ph) continue;
          let gid = -1, type = "";

          if (nFuzz && byFuzz.has(nFuzz)) { gid = byFuzz.get(nFuzz)!; type = "одинаковое ФИО"; }
          else if (nCanon && byCanon.has(nCanon)) { gid = byCanon.get(nCanon)!; type = "ФИО, другой порядок слов"; }
          else if (ph && byPhone.has(ph)) { gid = byPhone.get(ph)!; type = "совпал телефон"; }
          else if (nFuzz) {
            const res = matchRecord(idx, fio, null, strictness);
            if (res.status === "typo" && res.matchedName && byFuzz.has(res.matchedName)) {
              gid = byFuzz.get(res.matchedName)!; type = "ФИО с опечаткой";
            }
          }

          if (gid < 0) { gid = groups.length; groups.push([]); type = ""; }
          groups[gid].push({ excelRow: i + 1, fio, ph: ph ?? "", type: type || "первое упоминание" });
          if (nFuzz && !byFuzz.has(nFuzz)) byFuzz.set(nFuzz, gid);
          if (nCanon && !byCanon.has(nCanon)) byCanon.set(nCanon, gid);
          if (ph && !byPhone.has(ph)) byPhone.set(ph, gid);
          addToMatchIndex(idx, fio, null);

          if (i % 500 === 0) { setProgress(Math.round(90 * (i - f1.cfg.start + 1) / total)); setProgressText(`Ищу дубли… ${i - f1.cfg.start + 1} из ${total}`); await tick(); }
        }

        const dupGroups = groups.filter(g => g.length > 1);
        setStats([
          { label: "всего строк", value: total, color: "default" },
          { label: "групп дублей", value: dupGroups.length, color: "orange" },
          { label: "строк в дублях", value: dupGroups.reduce((s, g) => s + g.length, 0), color: "red" },
        ]);
        setDupeGroups(dupGroups);

        const headers = ["Группа", "Строка в файле", "ФИО", "Телефон", "Совпадение"];
        const aoa: unknown[][] = [headers];
        let g = 1;
        for (const grp of dupGroups) { for (const m of grp) aoa.push([g, m.excelRow, m.fio || "", m.ph || "", m.type]); g++; }
        const ws2 = XLSX.utils.aoa_to_sheet(aoa);
        (ws2 as any)["!cols"] = colWidths(aoa);
        const wb2 = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb2, ws2, "Дубли");
        setResultBlob(new Blob([XLSX.write(wb2, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        setResultName(f1.name.replace(/\.[^.]+$/, "") + "_ДУБЛИ.xlsx");
        setProgress(100); setProgressText("Готово"); setDone(true);
        return;
      }

      // Режимы color / export — нужен файл 2
      if (!f2) return;
      const err = validateCfg(f1, "Файл 1") || validateCfg(f2, "Файл 2");
      if (err) { setError(err); return; }

      // Строим индекс базы (файл 2)
      const idx = makeMatchIndex();
      for (let i = f2.cfg.start - 1; i < f2.rows.length; i++) {
        const row = f2.rows[i] || [];
        addToMatchIndex(idx, getFio(row, f2.cfg), f2.cfg.phone >= 0 ? row[f2.cfg.phone] : null);
        if (i % 2000 === 0) { setProgress(Math.round(30 * i / f2.rows.length)); setProgressText(`Читаю базу… ${i} строк`); await tick(); }
      }
      setProgress(30); setProgressText("База загружена"); await tick();

      // Сверка файла 1
      const results: { excelRow: number; res: MatchResult; fio: string; phone: string }[] = [];
      const counts: Record<string, number> = {};
      const disputedList: { row: number; fio: string; phone: string; dbName: string; sim: number }[] = [];
      const total2 = Math.max(f1.rows.length - (f1.cfg.start - 1), 1);

      for (let i = f1.cfg.start - 1; i < f1.rows.length; i++) {
        const row = f1.rows[i] || [];
        const fio = getFio(row, f1.cfg);
        const phone = f1.cfg.phone >= 0 ? row[f1.cfg.phone] : "";
        const res = matchRecord(idx, fio, phone, strictness);
        if (res.status !== "empty") {
          results.push({ excelRow: i + 1, res, fio, phone });
          counts[res.status] = (counts[res.status] || 0) + 1;
          if (res.status === "disputed") disputedList.push({ row: i + 1, fio, phone, dbName: res.matchedName ?? "", sim: res.sim ?? 0 });
        }
        if (i % 500 === 0) { setProgress(30 + Math.round(60 * (i - f1.cfg.start + 1) / total2)); setProgressText(`Сверяю… ${i - f1.cfg.start + 1} из ${total2}`); await tick(); }
      }

      setProgress(90); setProgressText("Формирую файл…"); await tick();

      const base = f1.name.replace(/\.[^.]+$/, "");
      let blob: Blob;
      if (runMode === "color") { blob = await buildColored(f1, results); setResultName(base + "_РЕЗУЛЬТАТ.xlsx"); }
      else { blob = await buildExport(f1, results, expWhat); setResultName(base + "_СВЕРКА.xlsx"); }
      setResultBlob(blob);

      const foundTotal = (counts.exact || 0) + (counts.typo || 0) + (counts.namechange || 0) + (counts.phone || 0);
      const grandTotal = foundTotal + (counts.disputed || 0) + (counts.notfound || 0);
      setStats([
        { label: "всего строк", value: grandTotal, color: "default" },
        { label: "найдены", value: foundTotal, color: "green" },
        { label: "с опечаткой / смена фам.", value: (counts.typo || 0) + (counts.namechange || 0), color: "green" },
        { label: "спорные", value: counts.disputed || 0, color: "orange" },
        { label: "не найдены", value: counts.notfound || 0, color: "red" },
      ]);
      setDisputed(disputedList);
      setProgress(100); setProgressText("Готово"); setDone(true);
    } catch (e: any) {
      setError("Ошибка: " + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!resultBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(resultBlob);
    a.download = resultName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const downloadCleanFile = () => {
    if (!f1 || dupeGroups.length === 0) return;

    // 1. Вычисляем строки к удалению (1-based индексы строк Excel)
    const del = new Map<number, { g: number; type: string }>();
    let gId = 1;
    for (const grp of dupeGroups) {
      for (let i = 1; i < grp.length; i++) {
        const m = grp[i];
        if (!dupDelPhone && m.type === "совпал телефон") continue;
        del.set(m.excelRow, { g: gId, type: m.type });
      }
      gId++;
    }

    if (del.size === 0) {
      alert("Нечего удалять: все найденные группы — совпадения только по телефону. Поставьте вторую галочку, если их тоже нужно удалить.");
      return;
    }

    // 2. Формируем строки для листа "Без дублей"
    const keptAoa: unknown[][] = [];
    for (let r = 0; r < f1.rows.length; r++) {
      if (!del.has(r + 1)) {
        keptAoa.push(f1.rows[r] || []);
      }
    }

    const wb = XLSX.utils.book_new();
    const wsKept = XLSX.utils.aoa_to_sheet(keptAoa);
    wsKept["!cols"] = colWidths(keptAoa);
    XLSX.utils.book_append_sheet(wb, wsKept, "Без дублей");

    // 3. Формируем лист "Удалённые" если нужно
    if (dupDelLog) {
      const headerIdx = f1.cfg.start >= 2 ? f1.cfg.start - 2 : 0;
      const srcHeader = f1.rows[headerIdx] || [];
      const maxCols = Math.max(...f1.rows.map(r => r.length), 1);
      const headers = ["Строка в файле", "Группа", "Совпадение"];
      for (let c = 0; c < maxCols; c++) {
        headers.push(String(srcHeader[c] || "").trim() || colLetter(c));
      }

      const remAoa: unknown[][] = [headers];
      for (let r = 0; r < f1.rows.length; r++) {
        const info = del.get(r + 1);
        if (info) {
          const rowData = f1.rows[r] || [];
          remAoa.push([r + 1, info.g, info.type, ...rowData]);
        }
      }

      if (remAoa.length > 1) {
        const wsDel = XLSX.utils.aoa_to_sheet(remAoa);
        for (let c = 0; c < headers.length; c++) {
          const addr = XLSX.utils.encode_cell({ r: 0, c });
          if ((wsDel as any)[addr]) (wsDel as any)[addr].s = { font: { bold: true } };
        }
        wsDel["!cols"] = colWidths(remAoa);
        XLSX.utils.book_append_sheet(wb, wsDel, "Удалённые");
      }
    }

    const base = f1.name.replace(/\.[^.]+$/, "");
    XLSX.writeFile(wb, `${base}_БЕЗ_ДУБЛЕЙ.xlsx`);
  };

  const canRun = !!f1 && (runMode === "dupes" || !!f2);

  return (
    <div className="relative space-y-6">
      <LoadingOverlay visible={loading} text={progressText || "Обработка…"} />

      <div className="relative z-10">
        <PageHeader
          title="Сверка таблиц"
          subtitle="Сравните два Excel/CSV файла по ФИО и телефону. Учитываются опечатки, ё/е, разный порядок слов, форматы телефона."
          onBack={onBack}
        />
      </div>

      {/* Файл 1 */}
      <FileDropZone
        label="📋 Файл, который проверяем"
        hint="Список людей, которых нужно найти в базе."
        fileState={f1}
        onFile={(file) => handleFile(1, file)}
        onReset={() => setF1(null)}
        onCfgChange={(cfg) => setF1(prev => prev ? { ...prev, cfg } : prev)}
        onSheetChange={(sheet) => {
          if (!f1) return;
          const rows = sheetRows(f1.wb, sheet);
          const g = guessColumns(rows);
          setF1({ ...f1, sheet, rows, cfg: { start: g.headerRow >= 0 ? g.headerRow + 2 : 2, fioMode: g.fio < 0 && g.fam >= 0 && g.im >= 0 ? "three" : "single", fio: g.fio, fam: g.fam, im: g.im, ot: g.ot, phone: g.phone } });
        }}
        inputRef={input1Ref}
      />

      {/* Файл 2 — скрыт в режиме дублей */}
      {runMode !== "dupes" && (
        <FileDropZone
          label="🗄 База для сравнения"
          hint="Файл, в котором ищем совпадения (например, база проголосовавших)."
          fileState={f2}
          onFile={(file) => handleFile(2, file)}
          onReset={() => setF2(null)}
          onCfgChange={(cfg) => setF2(prev => prev ? { ...prev, cfg } : prev)}
          onSheetChange={(sheet) => {
            if (!f2) return;
            const rows = sheetRows(f2.wb, sheet);
            const g = guessColumns(rows);
            setF2({ ...f2, sheet, rows, cfg: { start: g.headerRow >= 0 ? g.headerRow + 2 : 2, fioMode: g.fio < 0 && g.fam >= 0 && g.im >= 0 ? "three" : "single", fio: g.fio, fam: g.fam, im: g.im, ot: g.ot, phone: g.phone } });
          }}
          inputRef={input2Ref}
        />
      )}

      {/* Режим результата */}
      <section className="relative z-10 rounded-3xl glass p-5">
        <h3 className="text-sm font-semibold mb-3">Что сделать с результатом</h3>
        <div className="space-y-2">
          {(["color", "export", "dupes"] as RunMode[]).map(mode => (
            <label key={mode} onClick={() => setRunMode(mode)}
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all ${runMode === mode ? "border-violet-400/50 bg-violet-500/10" : "border-violet-400/10 hover:border-violet-400/25"}`}>
              <input type="radio" name="runMode" value={mode} checked={runMode === mode} onChange={() => setRunMode(mode)} className="mt-0.5 accent-violet-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {mode === "color" && "🎨 Покрасить строки в файле 1"}
                  {mode === "export" && "📄 Выгрузить отдельным файлом Excel"}
                  {mode === "dupes" && "🔍 Найти дубли внутри файла 1"}
                </p>
                {mode === "color" && runMode === "color" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-violet-200/60">Цвет найденных:</span>
                      {[["92D050", "#92D050", "Зелёный"], ["FFFF00", "#FFFF00", "Жёлтый"], ["9BC2E6", "#9BC2E6", "Голубой"], ["D9D9D9", "#D9D9D9", "Серый"]].map(([hex, color, title]) => (
                        <button key={hex} title={title} onClick={(e) => { e.stopPropagation(); setMatchColor(hex); }}
                          className={`w-6 h-6 rounded-md border-2 transition-all ${matchColor === hex ? "border-white scale-110 shadow-lg" : "border-transparent opacity-70 hover:opacity-100"}`}
                          style={{ background: color }} />
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={optRed} onChange={e => setOptRed(e.target.checked)} className="accent-violet-500" />
                      Ненайденных красить красным
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={optLabel} onChange={e => setOptLabel(e.target.checked)} className="accent-violet-500" />
                      Добавить столбец «Результат сверки»
                    </label>
                    <p className="text-[11px] text-violet-200/40">Результат сохраняется в новый чистый .xlsx.</p>
                  </div>
                )}
                {mode === "export" && runMode === "export" && (
                  <div className="mt-3 space-y-1" onClick={e => e.stopPropagation()}>
                    {([["both", "Найденных и ненайденных (два листа)"], ["found", "Только найденных"], ["notfound", "Только ненайденных"]] as [ExpWhat, string][]).map(([v, lbl]) => (
                      <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="radio" name="expWhat" value={v} checked={expWhat === v} onChange={() => setExpWhat(v)} className="accent-violet-500" />
                        {lbl}
                      </label>
                    ))}
                  </div>
                )}
                {mode === "dupes" && (
                  <p className="text-xs text-violet-200/50 mt-1">Файл 2 не нужен. Найдёт повторы с опечатками, ё/е, другим порядком слов и по телефону.</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Кнопка запуска */}
      <section className="relative z-10 rounded-3xl glass p-5 space-y-4">
        {/* Строгость сверки */}
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-violet-400/10 pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-violet-200/60">Строгость сверки</span>
            <span className="text-[10px] text-violet-200/40">
              {strictness === "strict" && "Строгая — меньше ложных совпадений"}
              {strictness === "normal" && "Обычная — проверенные и надежные пороги"}
              {strictness === "lax" && "Мягкая — ловит больше потенциальных опечаток"}
            </span>
          </div>
          <div className="flex bg-[#0a0c20]/50 rounded-xl border border-violet-400/10 p-1">
            {([["strict", "Строгая", "меньше ложных совпадений"], ["normal", "Обычная", "проверенные пороги"], ["lax", "Мягкая", "ловит больше опечаток"]] as const).map(([v, label, desc]) => (
              <button
                key={v}
                title={desc}
                onClick={() => setStrictness(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  strictness === v
                    ? "bg-violet-600/30 text-violet-200 border border-violet-500/35"
                    : "text-violet-200/40 hover:text-violet-200/80 border border-transparent"
                }`}
              >
                {label === "Обычная" ? "Обычная" : label}
              </button>
            ))}
          </div>
        </div>

        {runMode === "dupes" && (
          <div className="flex items-center gap-6 flex-wrap text-xs text-violet-200/80 pt-2 pb-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dupDelLog}
                onChange={(e) => setDupDelLog(e.target.checked)}
                className="accent-violet-500 rounded"
              />
              удалённых вывести на лист «Удалённые»
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dupDelPhone}
                onChange={(e) => setDupDelPhone(e.target.checked)}
                className="accent-violet-500 rounded"
              />
              удалять и совпадения только по телефону
            </label>
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={runCompare} disabled={!canRun || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)] hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Play className="h-4 w-4" />
            {runMode === "dupes" ? "▶ Найти дубли" : "▶ Запустить сверку"}
          </button>
          <span className="text-xs text-violet-200/40">
            {!f1 ? "Сначала выберите файл 1." : !canRun ? "Выберите файл 2." : "Готово к запуску."}
          </span>
        </div>

        {(loading || progress > 0) && progress < 100 && (
          <div className="mt-4 space-y-1">
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-150 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-violet-200/50">{progressText}</p>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-400/20 px-4 py-3 text-sm text-rose-300">{error}</div>
        )}
      </section>

      {/* Результаты */}
      {done && (
        <section className="relative z-10 rounded-3xl glass p-5 space-y-4">
          <h3 className="text-sm font-semibold text-emerald-300">✅ Готово</h3>
          <div className="flex flex-wrap gap-3">
            {stats.map((s, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 min-w-[110px] ${
                s.color === "green" ? "bg-emerald-500/10 border-emerald-400/20" :
                s.color === "orange" ? "bg-amber-500/10 border-amber-400/20" :
                s.color === "red" ? "bg-rose-500/10 border-rose-400/20" : "bg-white/5 border-white/10"}`}>
                <div className={`text-2xl font-bold ${
                  s.color === "green" ? "text-emerald-300" :
                  s.color === "orange" ? "text-amber-300" :
                  s.color === "red" ? "text-rose-300" : "text-white"}`}>{s.value}</div>
                <div className="text-[11px] text-violet-200/60 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {disputed.length > 0 && (
            <div>
              <p className="text-xs text-amber-200 mb-2">
                ⚠ Спорные — телефон совпал, ФИО сильно отличается. Проверьте вручную{disputed.length > 50 ? " (первые 50)" : ""}:
              </p>
              <div className="overflow-x-auto rounded-xl border border-violet-400/10 max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-[#0a0c20]/60 sticky top-0">
                    <tr>
                      {["Строка", "ФИО в файле 1", "Телефон", "ФИО в базе", "Сходство"].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-violet-200/50 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {disputed.slice(0, 50).map((d, i) => (
                      <tr key={i} className="border-t border-violet-400/5 hover:bg-violet-500/5">
                        <td className="px-3 py-2 text-violet-200/60">{d.row}</td>
                        <td className="px-3 py-2">{d.fio}</td>
                        <td className="px-3 py-2 font-mono">{d.phone}</td>
                        <td className="px-3 py-2 text-violet-200/70">{d.dbName}</td>
                        <td className="px-3 py-2">{Math.round((d.sim || 0) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {runMode === "dupes" && dupeGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-amber-200">
                👥 Найденные группы дубликатов{dupeGroups.length > 30 ? " (показаны первые 30 групп)" : ""}:
              </p>
              <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {dupeGroups.slice(0, 30).map((g, gi) => (
                  <div key={gi} className="rounded-xl bg-[#0a0c20]/40 border border-amber-400/15 overflow-hidden text-xs">
                    <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-400/10 flex items-center justify-between">
                      <span className="font-semibold text-amber-300">Группа {gi + 1}</span>
                      <span className="text-[10px] text-violet-200/40">{g.length} записей</span>
                    </div>
                    <div className="divide-y divide-violet-400/5">
                      {g.map((e, j) => (
                        <div key={j} className="px-3 py-2 flex items-start gap-3 justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-violet-200/40 text-[10px]">стр. {e.excelRow}</span>
                              <p className="font-medium text-violet-100 truncate">{e.fio || "—"}</p>
                            </div>
                            <p className="text-[10px] text-violet-200/50 font-mono mt-0.5">{e.ph || "—"}</p>
                          </div>
                          <DupeTypeBadge type={e.type} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {runMode === "dupes" && dupeGroups.length === 0 && (
            <p className="text-xs text-emerald-300">🎉 Дубликатов не найдено — список чистый.</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {runMode === "dupes" ? (
              <>
                <button
                  onClick={downloadCleanFile}
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-gray-900 hover:bg-gray-100 px-5 py-2.5 text-sm font-semibold shadow-lg transition-all"
                >
                  🧹 Скачать файл без дублей
                </button>
                <button
                  onClick={download}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 px-5 py-2.5 text-sm font-medium transition-all"
                >
                  <Download className="h-4 w-4" />
                  Скачать отчёт по дублям
                </button>
              </>
            ) : (
              <button
                onClick={download}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(16,185,129,0.5)] hover:opacity-95"
              >
                <Download className="h-4 w-4" />
                ⬇ Скачать результат
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ===================== FileDropZone =====================

function FileDropZone({ label, hint, fileState, onFile, onReset, onCfgChange, onSheetChange, inputRef }: {
  label: string; hint: string; fileState: FileState | null;
  onFile: (f: File) => void; onReset: () => void;
  onCfgChange: (cfg: FileCfg) => void; onSheetChange: (sheet: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [drag, setDrag] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const maxCols = fileState ? Math.min(Math.max(...fileState.rows.slice(0, 20).map(r => r.length), 1), 30) : 0;
  const sample = (c: number) => {
    if (!fileState) return "";
    for (let r = 0; r < Math.min(fileState.rows.length, 15); r++) {
      const v = String((fileState.rows[r] || [])[c] || "").trim();
      if (v) return v.length > 20 ? v.slice(0, 20) + "…" : v;
    }
    return "";
  };

  const ColSelect = ({ value, onChange, lbl }: { value: number; onChange: (v: number) => void; lbl: string }) => (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <span className="text-[11px] text-violet-200/50">{lbl}</span>
      <select value={value} onChange={e => onChange(+e.target.value)}
        className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1.5 text-xs text-violet-100 focus:outline-none focus:border-violet-400/60">
        <option value={-1}>— не выбран —</option>
        {Array.from({ length: maxCols }, (_, c) => {
          const s = sample(c);
          return <option key={c} value={c}>{colLetter(c)}{s ? ` — «${s}»` : ""}</option>;
        })}
      </select>
    </div>
  );

  return (
    <section className="relative z-10 rounded-3xl glass p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="text-xs text-violet-200/50 mt-0.5">{hint}</p>
        </div>
        {fileState && (
          <button onClick={onReset} className="rounded-lg p-1.5 hover:bg-rose-500/20 transition-colors" title="Удалить файл">
            <X className="h-4 w-4 text-rose-300" />
          </button>
        )}
      </div>

      {!fileState ? (
        <>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden"
            onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
          <div onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 cursor-pointer transition-all select-none ${drag ? "border-violet-400/60 bg-violet-500/10 text-violet-200" : "border-violet-400/15 hover:border-violet-400/40 text-violet-200/50"}`}>
            <Upload className="h-6 w-6" />
            <span className="text-sm">Нажмите или перетащите файл (.xlsx, .xls, .csv)</span>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {/* Заголовок */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-violet-100 truncate max-w-xs">📄 {fileState.name}</span>
            {fileState.wb.SheetNames.length > 1 && (
              <select value={fileState.sheet} onChange={e => onSheetChange(e.target.value)}
                className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1 text-xs text-violet-100 focus:outline-none">
                {fileState.wb.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </div>

          {/* Превью */}
          <div className="overflow-x-auto rounded-xl border border-violet-400/10 max-h-44">
            <table className="text-[11px] border-collapse whitespace-nowrap min-w-full">
              <thead>
                <tr>
                  <th className="border border-violet-400/10 bg-violet-500/10 px-2 py-1 text-violet-200/50"></th>
                  {Array.from({ length: maxCols }, (_, c) => {
                    const fioCols = fileState.cfg.fioMode === "single" ? [fileState.cfg.fio] : [fileState.cfg.fam, fileState.cfg.im, fileState.cfg.ot];
                    const isFio = fioCols.includes(c), isPhone = c === fileState.cfg.phone;
                    return (
                      <th key={c} className={`border border-violet-400/10 px-2 py-1 font-medium ${isFio ? "bg-blue-500/20 text-blue-200" : isPhone ? "bg-emerald-500/20 text-emerald-200" : "bg-violet-500/10 text-violet-200/60"}`}>
                        {colLetter(c)}{isFio ? " · ФИО" : isPhone ? " · тел." : ""}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {fileState.rows.slice(0, 8).map((row, r) => (
                  <tr key={r}>
                    <td className="border border-violet-400/10 bg-violet-500/5 px-2 py-1 text-violet-200/40 text-center">{r + 1}</td>
                    {Array.from({ length: maxCols }, (_, c) => {
                      let v = String(row[c] ?? ""); if (v.length > 26) v = v.slice(0, 26) + "…";
                      return <td key={c} className="border border-violet-400/5 px-2 py-1 text-violet-100/80">{v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Настройки */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-violet-200/50">Данные начинаются со строки</span>
              <input type="number" min={1} value={fileState.cfg.start}
                onChange={e => onCfgChange({ ...fileState.cfg, start: Math.max(1, +e.target.value || 1) })}
                className="w-20 rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1.5 text-xs text-violet-100 focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-violet-200/50">ФИО записано</span>
              <div className="flex gap-3">
                {(["single", "three"] as FioMode[]).map(m => (
                  <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" value={m} checked={fileState.cfg.fioMode === m}
                      onChange={() => onCfgChange({ ...fileState.cfg, fioMode: m })} className="accent-violet-500" />
                    {m === "single" ? "в одном столбце" : "в трёх (Ф/И/О)"}
                  </label>
                ))}
              </div>
            </div>
            {fileState.cfg.fioMode === "single"
              ? <ColSelect lbl="Столбец ФИО" value={fileState.cfg.fio} onChange={v => onCfgChange({ ...fileState.cfg, fio: v })} />
              : <>
                  <ColSelect lbl="Фамилия" value={fileState.cfg.fam} onChange={v => onCfgChange({ ...fileState.cfg, fam: v })} />
                  <ColSelect lbl="Имя" value={fileState.cfg.im} onChange={v => onCfgChange({ ...fileState.cfg, im: v })} />
                  <ColSelect lbl="Отчество" value={fileState.cfg.ot} onChange={v => onCfgChange({ ...fileState.cfg, ot: v })} />
                </>
            }
            <ColSelect lbl="Телефон (необязательно)" value={fileState.cfg.phone} onChange={v => onCfgChange({ ...fileState.cfg, phone: v })} />
          </div>
        </div>
      )}
    </section>
  );
}

const DUPE_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  "первое упоминание":       { label: "1⃣ первое",        cls: "bg-violet-500/15 text-violet-300 border border-violet-400/20" },
  "одинаковое ФИО":          { label: "= ФИО",            cls: "bg-rose-500/15 text-rose-300 border border-rose-400/20" },
  "ФИО, другой порядок слов":{ label: "↕ порядок слов",   cls: "bg-orange-500/15 text-orange-300 border border-orange-400/20" },
  "совпал телефон":          { label: "📞 телефон",        cls: "bg-sky-500/15 text-sky-300 border border-sky-400/20" },
  "ФИО с опечаткой":         { label: "~ опечатка",        cls: "bg-amber-500/15 text-amber-300 border border-amber-400/20" },
};

function DupeTypeBadge({ type }: { type: string }) {
  const info = DUPE_TYPE_BADGE[type] ?? { label: type, cls: "bg-violet-500/10 text-violet-300" };
  return (
    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${info.cls}`}>
      {info.label}
    </span>
  );
}

