// Поиск дубликатов — нечёткая логика портирована из app(6).html (runDupes)

import type { IndexedRecord } from "./search";
import { normalizeFio, buildDbIndexFromRecords, searchOne } from "./search";

// ===================== Типы =====================

export type DupeType =
  | "первое упоминание"
  | "одинаковое ФИО"
  | "ФИО, другой порядок слов"
  | "совпал телефон"
  | "ФИО с опечаткой";

export type DupeEntry = {
  record: IndexedRecord;
  rowIndex: number;      // 0-based индекс в массиве db
  type: DupeType;
};

export type DupeGroup = {
  entries: DupeEntry[];
};

// Для совместимости с текущим SearchPage
export type Duplicate = {
  key: string;
  records: IndexedRecord[];
};

// ===================== Нечёткий поиск дублей (аналог runDupes из app(6).html) =====================

function canonicalKeyLocal(fuzz: string): string {
  return fuzz.split(" ").sort().join(" ");
}

/**
 * Нечёткий поиск дублей внутри одного массива записей.
 * Логика: точные ФИО → разный порядок слов → телефон → опечатки (через matchRecord из search.ts).
 */
export function findDuplicatesFuzzy(db: IndexedRecord[]): DupeGroup[] {
  const byFuzz = new Map<string, number>();   // normFuzz -> groupId
  const byCanon = new Map<string, number>();  // canonKey -> groupId
  const byPhone = new Map<string, number>();  // phone10  -> groupId

  const groups: DupeEntry[][] = [];
  const partialDb: IndexedRecord[] = [];     // накапливаем для инкрементального индекса

  for (let i = 0; i < db.length; i++) {
    const rec = db[i];
    const nFuzz = normalizeFio(rec._fio_full);
    const nCanon = nFuzz ? canonicalKeyLocal(nFuzz) : "";
    const ph = rec._phone_norm.length === 10 ? rec._phone_norm : "";

    if (!nFuzz && !ph) continue;

    let gid = -1;
    let type: DupeType = "первое упоминание";

    if (nFuzz && byFuzz.has(nFuzz)) {
      gid = byFuzz.get(nFuzz)!;
      type = "одинаковое ФИО";
    } else if (nCanon && byCanon.has(nCanon)) {
      gid = byCanon.get(nCanon)!;
      type = "ФИО, другой порядок слов";
    } else if (ph && byPhone.has(ph)) {
      gid = byPhone.get(ph)!;
      type = "совпал телефон";
    } else if (nFuzz && partialDb.length > 0) {
      // Нечёткий матч через searchOne — ищем опечатки в уже обработанных
      const partialIdx = buildDbIndexFromRecords(partialDb);
      const found = searchOne(partialDb, rec._fio_full, partialIdx);
      const typoHit = found.find(
        (f) => f._match && (f._match.status === "typo" || f._match.status === "exact")
      );
      if (typoHit) {
        const matchedNorm = normalizeFio(typoHit._fio_full);
        if (matchedNorm && byFuzz.has(matchedNorm)) {
          gid = byFuzz.get(matchedNorm)!;
          type = "ФИО с опечаткой";
        }
      }
    }

    if (gid < 0) {
      gid = groups.length;
      groups.push([]);
      type = "первое упоминание";
    }

    groups[gid].push({ record: rec, rowIndex: i, type });

    if (nFuzz && !byFuzz.has(nFuzz)) byFuzz.set(nFuzz, gid);
    if (nCanon && !byCanon.has(nCanon)) byCanon.set(nCanon, gid);
    if (ph && !byPhone.has(ph)) byPhone.set(ph, gid);

    partialDb.push(rec);
  }

  return groups
    .filter((g) => g.length > 1)
    .map((entries) => ({ entries }));
}

// ===================== Простые функции (для обратной совместимости) =====================

export function findDuplicatesByFio(db: IndexedRecord[]): Duplicate[] {
  const map = new Map<string, IndexedRecord[]>();
  for (const r of db) {
    const key = normalizeFio(r._fio_full);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries())
    .filter(([, recs]) => recs.length > 1)
    .map(([key, records]) => ({ key, records }))
    .sort((a, b) => b.records.length - a.records.length);
}

export function findDuplicatesByPhone(db: IndexedRecord[]): Duplicate[] {
  const map = new Map<string, IndexedRecord[]>();
  for (const r of db) {
    const key = r._phone_norm;
    if (!key || key.length < 10) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries())
    .filter(([, recs]) => recs.length > 1)
    .map(([key, records]) => ({ key, records }))
    .sort((a, b) => b.records.length - a.records.length);
}

// ===================== Сравнение двух баз =====================

export type CompareResult = {
  onlyInA: IndexedRecord[];
  onlyInB: IndexedRecord[];
  inBoth: IndexedRecord[];
  totalA: number;
  totalB: number;
};

export function compareBases(
  dbA: IndexedRecord[],
  dbB: IndexedRecord[],
  byField: "fio" | "phone" = "fio"
): CompareResult {
  const getKey = byField === "fio"
    ? (r: IndexedRecord) => normalizeFio(r._fio_full)
    : (r: IndexedRecord) => r._phone_norm;

  const setB = new Set(dbB.map(getKey).filter(Boolean));
  const setA = new Set(dbA.map(getKey).filter(Boolean));

  const onlyInA = dbA.filter((r) => { const k = getKey(r); return k && !setB.has(k); });
  const onlyInB = dbB.filter((r) => { const k = getKey(r); return k && !setA.has(k); });
  const inBoth  = dbA.filter((r) => { const k = getKey(r); return k && setB.has(k); });

  return { onlyInA, onlyInB, inBoth, totalA: dbA.length, totalB: dbB.length };
}
