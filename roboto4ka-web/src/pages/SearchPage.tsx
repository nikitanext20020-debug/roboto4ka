import { useRef, useState } from "react";
import { Upload, Search as SearchIcon, FileSpreadsheet, Download, Users } from "lucide-react";
import * as XLSX from "xlsx";
import PageHeader from "../components/PageHeader";
import LoadingOverlay from "../components/LoadingOverlay";
import { loadFile } from "../lib/loadFile";
import {
  buildIndex,
  buildDbIndexFromRecords,
  recordToHit,
  searchOne,
  parseBatchInput,
  type IndexedRecord,
  type SearchHit,
  type MatchStatus,
} from "../lib/search";
import { useAppState } from "../lib/appState";
import { exportColoredXlsx, exportBaseWithHighlights, type ColorMode } from "../lib/exportColored";
import { findDuplicatesByFio, findDuplicatesByPhone, findDuplicatesFuzzy, type Duplicate, type DupeGroup } from "../lib/compare";

export default function SearchPage({ onBack }: { onBack: () => void }) {
  const { search, setSearch } = useAppState();
  const { db, dbName, fio, phone, batch, hits, notFound, strictness } = search;

  const setDb = (v: IndexedRecord[]) => setSearch((p) => ({ ...p, db: v }));
  const setDbName = (v: string) => setSearch((p) => ({ ...p, dbName: v }));
  const setFio = (v: string) => setSearch((p) => ({ ...p, fio: v }));
  const setPhone = (v: string) => setSearch((p) => ({ ...p, phone: v }));
  const setBatch = (v: string) => setSearch((p) => ({ ...p, batch: v }));
  const setHits = (v: SearchHit[]) => setSearch((p) => ({ ...p, hits: v }));
  const setNotFound = (v: string[]) => setSearch((p) => ({ ...p, notFound: v }));
  const setStrictness = (v: Strictness) => setSearch((p) => ({ ...p, strictness: v }));

  const [loading, setLoading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [markInOriginal, setMarkInOriginal] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalRows, setOriginalRows] = useState<any[]>([]);
  // Кэш нечёткого индекса — строится один раз при загрузке файла
  const dbIndexRef = useRef<ReturnType<typeof buildDbIndexFromRecords> | null>(null);

  const onPickFile = () => fileRef.current?.click();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setLoading("Читаю файл...");
    try {
      const rows = await loadFile(f);
      setLoading("Индексация...");
      const indexed = buildIndex(rows);
      // Строим нечёткий индекс один раз
      dbIndexRef.current = buildDbIndexFromRecords(indexed);
      setSearch((p) => ({
        ...p,
        db: indexed,
        dbName: `${f.name} · ${indexed.length} записей`,
      }));
      setOriginalFile(f);
      setOriginalRows(rows);
    } catch (e: any) {
      alert("Не удалось прочитать файл: " + (e?.message ?? e));
    } finally {
      setLoading(null);
    }
  };

  const runSearch = (queries: string[]) => {
    if (db.length === 0) {
      alert("Сначала выбери файл базы (xlsx или csv).");
      return;
    }
    const newHits: SearchHit[] = [];
    const newNF: string[] = [];
    const prebuilt = dbIndexRef.current ?? undefined;
    for (const q of queries) {
      const res = searchOne(db, q, prebuilt, strictness);
      if (res.length === 0) newNF.push(q);
      else for (const r of res) newHits.push(recordToHit(r, q));
    }
    setHits(newHits);
    setNotFound(newNF);
  };

  const onSingle = () => {
    const q = fio.trim() || phone.trim();
    if (!q) {
      alert("Введи ФИО или телефон.");
      return;
    }
    runSearch([q]);
  };

  const onBatch = () => {
    const queries = parseBatchInput(batch);
    if (queries.length === 0) {
      alert("Список пуст.");
      return;
    }
    runSearch(queries);
  };

  const exportXlsx = () => {
    if (hits.length === 0 && notFound.length === 0) return;
    const wb = XLSX.utils.book_new();
    if (hits.length) {
      const ws = XLSX.utils.json_to_sheet(
        hits.map((h) => ({
          Запрос: h.query, ФИО: h.fio, Телефон: h.phone,
          "Дата рождения": h.birthday, Адрес: h.address, Регион: h.region,
          Отделение: h.branch, Email: h.email, Статус: h.status, ID: h.id,
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, "found");
    }
    const wsNF = XLSX.utils.json_to_sheet(notFound.map((q) => ({ Запрос: q })));
    XLSX.utils.book_append_sheet(wb, wsNF, "not_found");
    XLSX.writeFile(wb, "result.xlsx");
  };

  // Экспорт с цветами
  const onExportColored = (mode: ColorMode) => {
    if (markInOriginal) {
      // Экспорт с пометками в исходном документе
      exportOriginalWithMarks(mode);
    } else {
      // Обычный экспорт (создаём новые листы)
      exportColoredXlsx(hits, notFound, mode);
    }
  };

  // Экспорт исходного файла с цветовыми пометками
  const exportOriginalWithMarks = (mode: ColorMode) => {
    if (originalRows.length === 0) {
      alert("База не загружена.");
      return;
    }

    console.log("=== DEBUG exportOriginalWithMarks ===");
    console.log("originalRows.length:", originalRows.length);
    console.log("db.length:", db.length);
    console.log("hits.length:", hits.length);
    console.log("Первая строка originalRows:", originalRows[0]);
    console.log("Первая строка db:", db[0]);

    // Определяем какие строки найдены
    const foundIndices = new Set<number>();
    const notFoundIndices = new Set<number>();

    // Проходим по всей исходной базе и ищем совпадения с найденными результатами
    for (let i = 0; i < db.length; i++) {
      const record = db[i];
      
      // Проверяем, есть ли эта запись в найденных результатах
      let matched = false;
      
      for (const hit of hits) {
        const hitFio = hit.fio.toLowerCase().replace(/\s+/g, " ").trim();
        const hitPhone = hit.phone.replace(/\D/g, "").slice(-10);
        
        const recordFio = record._fio_full.toLowerCase().replace(/\s+/g, " ").trim();
        const recordPhone = record._phone_norm || "";
        
        // Совпадение по ФИО (если ФИО не пустое)
        if (recordFio && hitFio && recordFio === hitFio) {
          matched = true;
          console.log(`Найдено совпадение по ФИО на индексе ${i}:`, recordFio);
          break;
        }
        
        // Совпадение по телефону (если телефон не пустой и длина 10 цифр)
        if (recordPhone && hitPhone && recordPhone.length === 10 && recordPhone === hitPhone) {
          matched = true;
          console.log(`Найдено совпадение по телефону на индексе ${i}:`, recordPhone);
          break;
        }
      }
      
      if (matched) {
        foundIndices.add(i);
      }
    }

    console.log("foundIndices:", Array.from(foundIndices));
    console.log("Всего найдено:", foundIndices.size);

    // Все остальные строки считаем "не найденными" только если режим включает not_found
    if (mode === "not_found_red" || mode === "both") {
      for (let i = 0; i < originalRows.length; i++) {
        if (!foundIndices.has(i)) {
          notFoundIndices.add(i);
        }
      }
    }

    // Определяем режим экспорта
    let exportMode: "found" | "not_found" | "both";
    if (mode === "found_green") {
      exportMode = "found";
    } else if (mode === "not_found_red") {
      exportMode = "not_found";
    } else {
      exportMode = "both";
    }

    console.log("Экспорт режим:", exportMode);
    console.log("Экспортируем originalRows с", originalRows.length, "строк");

    // Используем ИСХОДНЫЕ строки, а не индексированную базу
    exportBaseWithHighlights(
      originalRows,
      foundIndices,
      notFoundIndices,
      exportMode,
      originalFile?.name
    );
  };

  // Дубликаты
  const [dupeGroups, setDupeGroups] = useState<DupeGroup[] | null>(null);
  const [dupLoading, setDupLoading] = useState(false);

  const onFindDuplicates = async () => {
    if (db.length === 0) { alert("Сначала загрузи базу."); return; }
    setDupLoading(true);
    setDupeGroups(null);
    // Нечёткий поиск — может занять время на больших базах, делаем async
    await new Promise<void>((resolve) => setTimeout(() => {
      const groups = findDuplicatesFuzzy(db);
      setDupeGroups(groups);
      resolve();
    }, 0));
    setDupLoading(false);
  };

  const exportDupes = () => {
    if (!dupeGroups || dupeGroups.length === 0) return;
    const rows: Record<string, string>[] = [];
    dupeGroups.forEach((g, gi) => {
      g.entries.forEach((e) => {
        rows.push({
          "Группа": String(gi + 1),
          "Тип": e.type,
          "ФИО": e.record._fio_full,
          "Телефон": e.record._phone_norm ? "+7" + e.record._phone_norm : "",
          "Адрес": e.record.address ?? "",
          "Регион": e.record.region_name ?? "",
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Дубли");
    XLSX.writeFile(wb, "дубликаты.xlsx");
  };

  return (
    <div className="relative space-y-6">
      <LoadingOverlay visible={!!loading} text={loading ?? ""} />

      {/* Mascot - fixed position */}
      <div
        className="pointer-events-none fixed z-[1]"
        style={{
          left: 50,
          top: 30,
          width: 1200,
          opacity: 1,
          transform: "rotate(-8deg)",
        }}
      >
        {/* Glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)",
            filter: "blur(94px)",
            opacity: 0.85,
            transform: "scale(1.2)",
          }}
        />

        <img
          src="./lupa.png"
          alt=""
          draggable={false}
          className="relative w-full select-none drop-shadow-[0_0_25px_rgba(168,85,247,0.45)]"
          style={{
            filter: "saturate(0.92) brightness(0.88)",
          }}
        />
      </div>

      {/* Ambient purple glow */}
      <div className="fixed inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_15%_50%,rgba(139,92,246,0.18),transparent_35%)] z-0" />

      <div className="relative z-10">
      <PageHeader
        title="Поиск по базе"
        subtitle="ФИО или телефон. Excel и CSV. Массовый поиск списком."
        onBack={onBack}
        right={
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div className="text-xs text-violet-200/70 max-w-[260px] truncate">
              {dbName || "База не загружена"}
            </div>
            <button
              onClick={onPickFile}
              className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all"
            >
              <Upload className="h-4 w-4 text-violet-200" />
              Выбрать файл базы
            </button>
          </div>
        }
      />
      </div>

      {/* Single search */}
      <section className="relative z-10 rounded-3xl glass p-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-[0.18em] text-violet-200/60">ФИО</label>
            <input
              type="text"
              value={fio}
              onChange={(e) => setFio(e.target.value)}
              placeholder="Иванов Иван Иванович"
              className="mt-2 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-3 text-sm focus:outline-none focus:border-violet-400/60"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.18em] text-violet-200/60">Телефон</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="79267560872 или 9267560872"
              className="mt-2 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-3 text-sm focus:outline-none focus:border-violet-400/60"
            />
          </div>
        </div>

        {/* Строгость сверки */}
        <div className="mt-4 pt-4 border-t border-violet-400/10 flex items-center justify-between flex-wrap gap-3">
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
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => { setFio(""); setPhone(""); setHits([]); setNotFound([]); }}
            className="rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all"
          >
            Очистить
          </button>
          <button
            onClick={onSingle}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)] hover:opacity-95"
          >
            <SearchIcon className="h-4 w-4" />
            Найти
          </button>
        </div>
      </section>

      {/* Batch */}
      <section className="relative z-10 rounded-3xl glass p-5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Массовый поиск</h3>
          <span className="text-xs text-violet-200/50">по одному ФИО или телефону на строку</span>
        </div>
        <textarea
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder={"Прохоренко Мария Олеговна\nЛунина Ольга Юрьевна\n79267560872\n\nМожно вставить и в строку: Иванов Иван Иванович Петров Пётр Петрович"}
          rows={5}
          className="mt-3 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-3 text-sm focus:outline-none focus:border-violet-400/60 resize-y"
        />
        <div className="mt-3 flex justify-end gap-3">
          <button
            onClick={() => setBatch("")}
            className="rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all"
          >
            Очистить список
          </button>
          <button
            onClick={onBatch}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]"
          >
            Найти список
          </button>
        </div>
      </section>

      {/* Results */}
      <section className="relative z-10 rounded-3xl glass overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-violet-400/10 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-violet-300" />
            <h3 className="text-sm font-semibold">Результаты</h3>
            <span className="text-xs text-violet-200/50">
              найдено: {hits.length} · не найдено: {notFound.length}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Чекбокс для пометки в исходном документе */}
            <label className="inline-flex items-center gap-2 text-xs text-violet-200/80 cursor-pointer hover:text-violet-200 transition-colors">
              <input
                type="checkbox"
                checked={markInOriginal}
                onChange={(e) => setMarkInOriginal(e.target.checked)}
                className="w-4 h-4 rounded border-violet-400/30 bg-[#0a0c20]/70 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer"
              />
              <span>Отмечать прямо в исходном документе</span>
            </label>
            
            {hits.length > 0 && (
              <button
                onClick={() => onExportColored("found_green")}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-all"
              >
                🟢 Найденные зелёным
              </button>
            )}
            {notFound.length > 0 && (
              <button
                onClick={() => onExportColored("not_found_red")}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-all"
              >
                🔴 Ненайденные красным
              </button>
            )}
            {(hits.length > 0 || notFound.length > 0) && (
              <button
                onClick={() => onExportColored("both")}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 transition-all"
              >
                🟢🔴 Оба цвета
              </button>
            )}
            <button
              onClick={exportXlsx}
              disabled={hits.length === 0 && notFound.length === 0}
              className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60 transition-all disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Обычный Excel
            </button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-violet-200/60 bg-[#0a0c20]/60 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3">Запрос</th>
                <th className="text-left px-4 py-3">ФИО</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="text-left px-4 py-3">Телефон</th>
                <th className="text-left px-4 py-3">Дата рождения</th>
                <th className="text-left px-4 py-3">Адрес</th>
                <th className="text-left px-4 py-3">Регион</th>
              </tr>
            </thead>
            <tbody>
              {hits.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-violet-200/40">
                    Ничего не найдено
                  </td>
                </tr>
              )}
              {hits.map((h, i) => (
                <tr key={i} className="border-t border-violet-400/5 hover:bg-violet-500/5">
                  <td className="px-4 py-2.5 text-violet-200/60">{h.query}</td>
                  <td className="px-4 py-2.5">
                    <CopyCell value={h.fio} />
                    {h.matchedName && h.matchedName !== h.fio.toLowerCase() && (
                      <div className="text-[10px] text-violet-300/50 mt-0.5">↳ в базе: {h.matchedName}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <MatchBadge status={h.matchStatus} sim={h.sim} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <CopyCell value={h.phone} />
                  </td>
                  <td className="px-4 py-2.5">{h.birthday}</td>
                  <td className="px-4 py-2.5 text-violet-100/80">{h.address}</td>
                  <td className="px-4 py-2.5 text-violet-100/80">{h.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {notFound.length > 0 && (
        <section className="relative z-10 rounded-3xl glass p-5">
          <h3 className="text-sm font-semibold">Не найдено</h3>
          <div className="mt-2 text-xs text-violet-200/70 whitespace-pre-line">
            {notFound.join("\n")}
          </div>
        </section>
      )}

      {/* Дубликаты */}
      {db.length > 0 && (
        <section className="relative z-10 rounded-3xl glass p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-amber-300" />
              <h3 className="text-sm font-semibold">Нечёткий поиск дубликатов</h3>
              <span className="text-xs text-violet-200/40">ФИО с опечатками, ё/е, разный порядок слов, телефон</span>
            </div>
            <div className="flex items-center gap-2">
              {dupeGroups && dupeGroups.length > 0 && (
                <button
                  onClick={exportDupes}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-all"
                >
                  ⬇ Excel
                </button>
              )}
              <button
                onClick={onFindDuplicates}
                disabled={dupLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-semibold shadow-[0_8px_30px_-10px_rgba(245,158,11,0.5)] disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" />
                {dupLoading ? "Ищу…" : "Найти дубли"}
              </button>
            </div>
          </div>

          {dupeGroups !== null && (
            dupeGroups.length === 0 ? (
              <p className="text-xs text-emerald-300">🎉 Дубликатов не найдено — список чистый.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-4 text-xs mb-3">
                  <span className="text-amber-200 font-semibold">Групп: {dupeGroups.length}</span>
                  <span className="text-violet-200/50">записей в дублях: {dupeGroups.reduce((s, g) => s + g.entries.length, 0)}</span>
                  {dupeGroups.length > 30 && <span className="text-violet-200/40">показаны первые 30, полный список — в Excel</span>}
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                  {dupeGroups.slice(0, 30).map((g, gi) => (
                    <div key={gi} className="rounded-xl bg-[#0a0c20]/40 border border-amber-400/15 overflow-hidden">
                      <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-400/10 flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-amber-300">Группа {gi + 1}</span>
                        <span className="text-[10px] text-violet-200/40">{g.entries.length} записей</span>
                      </div>
                      <div className="divide-y divide-violet-400/5">
                        {g.entries.map((e, j) => (
                          <div key={j} className="px-3 py-2 flex items-start gap-3">
                            <DupeTypeBadge type={e.type} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-violet-100 truncate">{e.record._fio_full || "—"}</p>
                              <p className="text-[10px] text-violet-200/50">
                                {e.record._phone_norm ? "+7" + e.record._phone_norm : ""}
                                {e.record._phone_norm && e.record.address ? " · " : ""}
                                {e.record.address ?? ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
}

function CopyCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <span
      onClick={onClick}
      title="Клик — скопировать"
      className={`cursor-pointer rounded px-1 -mx-1 transition-colors ${
        copied ? "bg-emerald-500/20 text-emerald-200" : "hover:bg-violet-500/15 hover:text-white"
      }`}
    >
      {copied ? "✓ скопировано" : value}
    </span>
  );
}

const MATCH_BADGE: Record<string, { label: string; cls: string }> = {
  exact:      { label: "✓ найден",          cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/20" },
  typo:       { label: "~ опечатка",        cls: "bg-amber-500/15 text-amber-300 border border-amber-400/20" },
  namechange: { label: "↔ смена фамилии?", cls: "bg-sky-500/15 text-sky-300 border border-sky-400/20" },
  phone:      { label: "📞 только тел.",    cls: "bg-violet-500/15 text-violet-300 border border-violet-400/20" },
  disputed:   { label: "⚠ спорный",         cls: "bg-orange-500/15 text-orange-300 border border-orange-400/20" },
  notfound:   { label: "✗ не найден",       cls: "bg-rose-500/15 text-rose-300 border border-rose-400/20" },
};

function MatchBadge({ status, sim }: { status: MatchStatus; sim?: number }) {
  const info = MATCH_BADGE[status];
  if (!info) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${info.cls}`}>
      {info.label}
      {sim !== undefined && sim < 1 && (
        <span className="opacity-60">{Math.round(sim * 100)}%</span>
      )}
    </span>
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
