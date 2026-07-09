// Утилиты поиска по базе — нечёткая логика портирована из app(6).html

// ===================== Типы =====================

export type Record = {
  id?: string;
  last_name?: string;
  first_name?: string;
  patronymic?: string;
  phone_mobile?: string;
  phone_mobile_digits?: string;
  phone_home?: string;
  birthday?: string;
  address?: string;
  region_name?: string;
  branch_name?: string;
  email?: string;
  cfacbg?: string;
  [key: string]: string | undefined;
};

export type IndexedRecord = Record & {
  _fio_full: string;
  _fio_norm: string;
  _fio_short: string;
  _phone_norm: string;
};

export type MatchStatus =
  | "exact"
  | "typo"
  | "namechange"
  | "phone"
  | "disputed"
  | "notfound"
  | "empty";

export type SearchHit = {
  query: string;
  fio: string;
  phone: string;
  birthday: string;
  address: string;
  region: string;
  branch: string;
  email: string;
  status: string;
  matchStatus: MatchStatus;
  matchedName?: string;
  sim?: number;
  id: string;
};

// ===================== Пороги =====================

export type Strictness = "strict" | "normal" | "lax";

export const THRESHOLDS = {
  strict: {
    word: 0.80,
    phoneFuzzy: 0.85,
    surname: 0.86,
    nameOnly: 0.93,
    nameChangeFnp: 0.97,
  },
  normal: {
    word: 0.75,
    phoneFuzzy: 0.80,
    surname: 0.82,
    nameOnly: 0.90,
    nameChangeFnp: 0.95,
  },
  lax: {
    word: 0.70,
    phoneFuzzy: 0.75,
    surname: 0.78,
    nameOnly: 0.87,
    nameChangeFnp: 0.92,
  },
};

// ===================== Нормализация =====================

export function normalizePhone(s: string | undefined): string {
  const raw = String(s ?? "").trim();
  if (!raw || raw.toLowerCase() === "nan") return "";
  let str = raw;
  if (/^[\d.,]+e\+?\d+$/i.test(str)) {
    const num = Number(str.replace(",", "."));
    if (isFinite(num)) str = num.toFixed(0);
  }
  let d = str.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  else if (d.length === 10) d = "7" + d;
  return d.length === 11 ? d : "";
}

export function normalizePhone10(s: string | undefined): string {
  const d11 = normalizePhone(s);
  return d11.length === 11 ? d11.slice(1) : d11;
}

function normStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeName(v: unknown): string {
  const s = normStr(v);
  if (!s || s.toLowerCase() === "nan") return "";
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeFuzzy(name: string): string {
  if (!name) return "";
  let n = name.replace(/ё/g, "е");
  n = n.replace(/[-\s]+$/, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function canonicalKey(name: string): string {
  if (!name) return "";
  return name.split(" ").sort().join(" ");
}

export function normalizeFio(s: string | undefined): string {
  return normalizeFuzzy(normalizeName(s));
}

export function isPhoneQuery(s: string): boolean {
  return s.replace(/\D/g, "").length >= 10;
}

export function fmtPhone(d: string): string {
  if (!d) return "";
  const digits = d.replace(/\D/g, "");
  if (digits.length === 11) return "+7" + digits.slice(1);
  if (digits.length === 10) return "+7" + digits;
  return d;
}

export function fmtDate(s: string | undefined): string {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return String(s);
}

// ===================== Алгоритм нечёткого сходства (LCS) =====================

function _lcsBlock(
  a: string, alo: number, ahi: number,
  b: string, blo: number, bhi: number
): [number, number, number] {
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

function _matchedCount(
  a: string, alo: number, ahi: number,
  b: string, blo: number, bhi: number
): number {
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

function sortedWords(s: string): string {
  return s.split(" ").sort().join(" ");
}

function fuzzySim(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.max(simRatio(a, b), simRatio(sortedWords(a), sortedWords(b)));
}

function surnameSim(a: string, b: string): number {
  if (!a || !b) return 0;
  return simRatio(a.split(" ")[0] ?? "", b.split(" ")[0] ?? "");
}

function namePatronymicSim(a: string, b: string): number {
  if (!a || !b) return 0;
  const ra = a.split(" ").slice(1).join(" ");
  const rb = b.split(" ").slice(1).join(" ");
  if (!ra || !rb) return 0;
  return simRatio(ra, rb);
}

function wordsAlignedOk(a: string, b: string, wordThresh: number): boolean {
  const wa = a.split(" ").filter(Boolean);
  const wb = b.split(" ").filter(Boolean);
  if (wa.length !== wb.length) return true;
  let ok = true;
  for (let i = 0; i < wa.length; i++) {
    if (simRatio(wa[i], wb[i]) < wordThresh) { ok = false; break; }
  }
  if (ok) return true;
  const sa = [...wa].sort();
  const sb = [...wb].sort();
  for (let i = 0; i < sa.length; i++) {
    if (simRatio(sa[i], sb[i]) < wordThresh) return false;
  }
  return true;
}

type CharMap = { [ch: string]: number };
function charCounts(s: string): CharMap {
  const cnt: CharMap = Object.create(null);
  for (const ch of s) cnt[ch] = (cnt[ch] ?? 0) + 1;
  return cnt;
}

// ===================== Индекс базы =====================

type FuzzyMeta = { name: string; len: number; cnt: CharMap };

interface DbIndex {
  exact: Set<string>;
  fuzzy: Set<string>;
  canon: Set<string>;
  phones: Set<string>;
  phoneToNames: Map<string, string[]>;
  fuzzyMeta: FuzzyMeta[];
  count: number;
}

function makeDbIndex(): DbIndex {
  return {
    exact: new Set(),
    fuzzy: new Set(),
    canon: new Set(),
    phones: new Set(),
    phoneToNames: new Map(),
    fuzzyMeta: [],
    count: 0,
  };
}

function addToDbIndex(idx: DbIndex, rawFio: unknown, rawPhone: unknown): void {
  const nExact = normalizeName(rawFio);
  const nFuzz = normalizeFuzzy(nExact);
  const nCanon = canonicalKey(nFuzz);
  const phone = normalizePhone(rawPhone as string);
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
  if (nExact || phone) idx.count++;
}

type MatchResult = { status: MatchStatus; matchedName?: string; sim?: number };

function matchRecord(
  idx: DbIndex,
  rawFio: unknown,
  rawPhone: unknown,
  strictness: Strictness = "normal"
): MatchResult {
  const nExact = normalizeName(rawFio);
  const nFuzz = normalizeFuzzy(nExact);
  const nCanon = canonicalKey(nFuzz);
  const phone = normalizePhone(rawPhone as string);

  const thresh = THRESHOLDS[strictness];

  if (!nExact && !phone) return { status: "empty" };
  if (nExact && idx.exact.has(nExact)) return { status: "exact" };
  if (nFuzz && idx.fuzzy.has(nFuzz)) return { status: "exact" };
  if (nCanon && idx.canon.has(nCanon)) return { status: "exact" };

  if (phone && idx.phones.has(phone)) {
    const cands = idx.phoneToNames.get(phone) ?? [];
    if (!nFuzz) return { status: "phone" };
    let bestSim = 0;
    let bestCand = cands[0] ?? "";
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
      for (const ch in meta.cnt) {
        const q = qCnt[ch];
        if (q) mm += q < meta.cnt[ch] ? q : meta.cnt[ch];
      }
      if ((2 * mm) / (la + lb) < thresh.nameOnly) continue;
      const overall = fuzzySim(nFuzz, meta.name);
      if (overall >= thresh.nameOnly && surnameSim(nFuzz, meta.name) >= thresh.surname && wordsAlignedOk(nFuzz, meta.name, thresh.word))
        return { status: "typo", matchedName: meta.name, sim: overall };
    }
  }
  return { status: "notfound" };
}

// ===================== Колонки базы =====================

const COL_LAST = ["last_name", "lastname", "last", "фамилия", "фио_фамилия", "surname"];
const COL_FIRST = ["first_name", "firstname", "first", "имя", "name"];
const COL_PATR = ["patronymic", "middle_name", "middlename", "отчество", "patr"];
const COL_FIO = ["fio", "фио", "full_name", "fullname", "имя_полное", "ф.и.о.", "name_full", "ф. и. о."];
const COL_PHONE = [
  "phone_mobile", "phone_mobile_digits", "phone_home",
  "phone", "mobile", "tel", "telephone",
  "телефон", "тел", "номер", "сотовый", "мобильный", "номертелефона", "телефонмобильный",
];
const COL_BIRTH = ["birthday", "birth", "birth_date", "birthdate", "dob", "дата_рождения", "др", "датарождения"];
const COL_ADDR = ["address", "addr", "адрес"];
const COL_REGION = ["region_name", "region", "регион", "область"];
const COL_BRANCH = ["branch_name", "branch", "отделение", "филиал"];
const COL_EMAIL = ["email", "e-mail", "почта", "mail"];
const COL_ID = ["id", "code", "код", "номер_записи"];

function findVal(row: Record, candidates: string[]): string {
  const keys = Object.keys(row);
  const norm = (s: string) => s.toLowerCase().replace(/[\s_.\-]/g, "").replace(/ё/g, "е");
  for (const cand of candidates) {
    const cn = norm(cand);
    for (const k of keys) {
      if (norm(k) === cn) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  for (const cand of candidates) {
    const cn = norm(cand);
    if (cn.length < 3) continue;
    for (const k of keys) {
      if (norm(k).includes(cn)) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  return "";
}

// ===================== Построение индекса из файла =====================

export function buildIndex(rows: Record[]): IndexedRecord[] {
  const indexed = rows.map((r) => {
    let last = findVal(r, COL_LAST);
    let first = findVal(r, COL_FIRST);
    let patr = findVal(r, COL_PATR);
    if (!last && !first) {
      const fio = findVal(r, COL_FIO);
      if (fio) {
        const parts = fio.split(/\s+/).filter(Boolean);
        last = parts[0] ?? "";
        first = parts[1] ?? "";
        patr = parts.slice(2).join(" ");
      }
    }
    const fioFull = `${last} ${first} ${patr}`.replace(/\s+/g, " ").trim();
    const phone = findVal(r, COL_PHONE);
    return {
      ...r,
      id: r.id ?? findVal(r, COL_ID),
      birthday: r.birthday ?? findVal(r, COL_BIRTH),
      address: r.address ?? findVal(r, COL_ADDR),
      region_name: r.region_name ?? findVal(r, COL_REGION),
      branch_name: r.branch_name ?? findVal(r, COL_BRANCH),
      email: r.email ?? findVal(r, COL_EMAIL),
      _fio_full: fioFull,
      _fio_norm: normalizeFio(fioFull),
      _fio_short: normalizeFio(`${last} ${first}`),
      _phone_norm: normalizePhone10(phone),
    };
  });
  if (indexed.length > 0) {
    const withFio = indexed.filter((r) => r._fio_full.length > 0).length;
    const withPhone = indexed.filter((r) => r._phone_norm.length === 10).length;
    console.log(
      `[buildIndex] записей: ${indexed.length}, с ФИО: ${withFio}, с телефоном: ${withPhone}`,
      "\nПервая запись:", indexed[0],
      "\nКолонки:", Object.keys(rows[0] ?? {})
    );
  }
  return indexed;
}

// ===================== Нечёткий поиск =====================

export function buildDbIndexFromRecords(records: IndexedRecord[]): DbIndex {
  const idx = makeDbIndex();
  for (const rec of records) {
    const phone11 = rec._phone_norm.length === 10 ? "7" + rec._phone_norm : "";
    addToDbIndex(idx, rec._fio_full, phone11);
  }
  return idx;
}

// Тип с результатом матчинга (не наследует index signature Record)
export type MatchedRecord = {
  _fio_full: string;
  _fio_norm: string;
  _fio_short: string;
  _phone_norm: string;
  _match: MatchResult;
  [key: string]: string | MatchResult | undefined;
};

export function searchOne(
  db: IndexedRecord[],
  query: string,
  prebuiltIndex?: DbIndex,
  strictness: Strictness = "normal"
): MatchedRecord[] {
  const q = query.trim();
  if (!q || db.length === 0) return [];

  if (isPhoneQuery(q)) {
    const target11 = normalizePhone(q);
    const target10 = target11.length === 11 ? target11.slice(1) : target11;
    return db
      .filter((r) => r._phone_norm === target10)
      .map((r) => ({ ...r, _match: { status: "exact" as MatchStatus } } as MatchedRecord));
  }

  const idx = prebuiltIndex ?? buildDbIndexFromRecords(db);
  const result = matchRecord(idx, q, null, strictness);

  if (result.status === "empty" || result.status === "notfound") return [];

  if (result.status === "exact") {
    const qn = normalizeName(q);
    const qf = normalizeFuzzy(qn);
    const qc = canonicalKey(qf);
    return db
      .filter((r) => {
        const rn = r._fio_norm;
        const rf = normalizeFuzzy(rn);
        return rn === qn || rf === qf || canonicalKey(rf) === qc;
      })
      .map((r) => ({ ...r, _match: result } as MatchedRecord));
  }

  if (result.status === "typo" || result.status === "namechange") {
    const matchedNorm = result.matchedName ?? "";
    return db
      .filter((r) => normalizeFuzzy(r._fio_norm) === matchedNorm)
      .map((r) => ({ ...r, _match: result } as MatchedRecord));
  }

  return [];
}

export function recordToHit(rec: MatchedRecord | (IndexedRecord & { _match?: MatchResult }), query: string): SearchHit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = rec as any;
  const match: MatchResult = r._match ?? { status: "exact" as MatchStatus };
  return {
    query,
    fio: r._fio_full || "",
    phone: fmtPhone(r._phone_norm ?? ""),
    birthday: fmtDate(r.birthday),
    address: r.address ?? "",
    region: r.region_name ?? "",
    branch: r.branch_name ?? "",
    email: r.email ?? "",
    status: r.cfacbg ?? "",
    matchStatus: match.status,
    matchedName: match.matchedName,
    sim: match.sim,
    id: r.id ?? "",
  };
}

// ===================== Умный парсер массового ввода =====================

export function parseBatchInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.includes("\n")) {
    return trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  const results: string[] = [];
  let cleaned = trimmed;
  const phoneRe = /(?:\+?[78][\s\-]?)?[\(\s]?\d{3}[\)\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g;
  const phones: string[] = [];
  cleaned = cleaned.replace(phoneRe, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10) { phones.push(m.trim()); return " ⌀ "; }
    return m;
  });
  results.push(...phones);
  const words = cleaned.split(/[\s,;]+/).filter((w) => w && w !== "⌀");
  const isCap = (w: string) => /^[А-ЯЁA-Z]/.test(w);
  let i = 0;
  while (i < words.length) {
    if (!isCap(words[i])) { i++; continue; }
    let j = i;
    while (j < words.length && isCap(words[j])) j++;
    let k = i;
    while (k < j) {
      const remaining = j - k;
      if (remaining >= 3) { results.push(words.slice(k, k + 3).join(" ")); k += 3; }
      else if (remaining === 2) { results.push(words.slice(k, k + 2).join(" ")); k += 2; }
      else { k++; }
    }
    i = j;
  }
  if (results.length === 0 && trimmed.length > 0) results.push(trimmed);
  return [...new Set(results)];
}
