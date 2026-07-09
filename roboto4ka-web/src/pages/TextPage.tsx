import { useMemo, useState } from "react";
import { Sparkles, Eraser, Copy, CheckCircle2, AlertTriangle, Wand2, Zap } from "lucide-react";
import PageHeader from "../components/PageHeader";
import LoadingOverlay from "../components/LoadingOverlay";
import { checkSpelling } from "../lib/spell";
import { checkText, TYPE_LABELS, TYPE_COLORS, type TextGearsError } from "../lib/textgears";
import { useAppState } from "../lib/appState";

// Унифицированная ошибка
type Mistake = {
  pos: number;
  len: number;
  word: string;
  suggestions: string[];
  type: "spelling" | "grammar" | "punctuation" | "style";
};

export default function TextPage({ onBack }: { onBack: () => void }) {
  const { text: textState, setText: setTextState } = useAppState();
  const text = textState.text;
  const mistakes = (textState.mistakes as Mistake[] | null) ?? null;
  const setText = (v: string) => setTextState((p) => ({ ...p, text: v }));
  const setTextAndClearMistakes = (v: string) => setTextState((p) => ({ ...p, text: v, mistakes: null }));
  const setMistakes = (v: Mistake[] | null) => setTextState((p) => ({ ...p, mistakes: v }));
  const [loading, setLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    const chars = text.length;
    const words = (text.match(/\b\w+\b/gu) || []).length;
    const lines = text === "" ? 0 : text.split(/\n/).length;
    return { chars, words, lines };
  }, [text]);

  const trimSpaces = () => setText(text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim());
  const trimFull = () => setText(
    text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").replace(/ *\n */g, "\n").trim()
  );
  const removeAllSpaces = () => setText(text.replace(/\s+/g, ""));

  // Быстрая проверка — Я.Спеллер (только орфография, мгновенно)
  const onCheckFast = async () => {
    if (!text.trim()) return alert("Сначала вставь текст.");
    setLoading("Быстрая проверка орфографии...");
    try {
      const res = await checkSpelling(text);
      const m: Mistake[] = res.map((x) => ({
        pos: x.pos, len: x.len, word: x.word,
        suggestions: x.s ?? [], type: "spelling",
      }));
      setMistakes(m);
    } catch (e: any) {
      alert("Ошибка: " + (e?.message ?? e));
    } finally {
      setLoading(null);
    }
  };

  // Полная проверка — TextGears (орфография + пунктуация + грамматика)
  const onCheckFull = async () => {
    if (!text.trim()) return alert("Сначала вставь текст.");
    setLoading("Полная проверка: орфография, пунктуация, грамматика...");
    try {
      const res: TextGearsError[] = await checkText(text);
      const m: Mistake[] = res.map((x) => ({
        pos: x.offset, len: x.length, word: x.bad,
        suggestions: x.better ?? [],
        type: (["spelling", "grammar", "punctuation", "style"].includes(x.type)
          ? x.type
          : "grammar") as Mistake["type"],
      }));
      setMistakes(m);
    } catch (e: any) {
      alert("Ошибка сервиса: " + (e?.message ?? e));
    } finally {
      setLoading(null);
    }
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const applyOne = (mistake: Mistake, replacement: string) => {
    if (!mistakes) return;
    const before = text.slice(0, mistake.pos);
    const after = text.slice(mistake.pos + mistake.len);
    setText(before + replacement + after);
    const shift = replacement.length - mistake.len;
    setMistakes(
      mistakes
        .filter((m) => m !== mistake)
        .map((m) => (m.pos > mistake.pos ? { ...m, pos: m.pos + shift } : m))
    );
  };

  const fixAll = () => {
    if (!mistakes || mistakes.length === 0) return;
    const sorted = [...mistakes].sort((a, b) => b.pos - a.pos);
    let result = text;
    let fixedCount = 0;
    for (const m of sorted) {
      if (!m.suggestions || m.suggestions.length === 0) continue;
      result = result.slice(0, m.pos) + m.suggestions[0] + result.slice(m.pos + m.len);
      fixedCount++;
    }
    setText(result);
    setMistakes(null);
    setLoading(`Исправлено: ${fixedCount}`);
    setTimeout(() => setLoading(null), 1200);
  };

  // Подсветка
  const highlighted = useMemo(() => {
    if (!mistakes || mistakes.length === 0) return null;
    const sorted = [...mistakes].sort((a, b) => a.pos - b.pos);
    const parts: { text: string; bad?: Mistake }[] = [];
    let cursor = 0;
    for (const m of sorted) {
      if (m.pos > cursor) parts.push({ text: text.slice(cursor, m.pos) });
      parts.push({ text: text.slice(m.pos, m.pos + m.len), bad: m });
      cursor = m.pos + m.len;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor) });
    return parts;
  }, [mistakes, text]);

  // Группировка по типам для статистики
  const stats2 = useMemo(() => {
    if (!mistakes) return null;
    const byType: Record<string, number> = {};
    for (const m of mistakes) byType[m.type] = (byType[m.type] ?? 0) + 1;
    return byType;
  }, [mistakes]);

  return (
    <div className="space-y-6">

      {/* PC Mascot - behind cards */}
      <div
        className="pointer-events-none fixed z-[1]"
        style={{
          left: 1430,
          top: 40,
          width: 1040,
          opacity: 0.90,
          transform: "rotate(-4deg)",
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)",
            filter: "blur(110px)",
            opacity: 1,
            transform: "scale(1.2)",
          }}
        />
        <img
          src="./PC.png"
          alt=""
          draggable={false}
          className="relative w-full select-none drop-shadow-[0_0_25px_rgba(168,85,247,0.45)]"
          style={{ filter: "saturate(0.92) brightness(0.88)" }}
        />
      </div>

      <LoadingOverlay visible={!!loading} text={loading ?? ""} />

      <div className="relative z-[10]">
      <PageHeader
        title="Анализ текста"
        subtitle="Орфография, пунктуация, грамматика, чистка пробелов"
        onBack={onBack}
      />
      </div>

      {/* Toolbar */}
      <section className="relative z-[10] rounded-3xl glass p-4 flex flex-wrap gap-2">
        <Chip onClick={trimSpaces}>Удалить лишние пробелы</Chip>
        <Chip onClick={trimFull}>Лишние пробелы и пустые строки</Chip>
        <Chip onClick={removeAllSpaces}><Eraser className="h-3.5 w-3.5" /> Удалить все пробелы</Chip>
      </section>

      {/* Editor */}
      <section className="relative z-[10] rounded-3xl glass p-5">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setMistakes(null); }}
          placeholder="Вставь сюда текст..."
          rows={12}
          className="w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-3 text-sm focus:outline-none focus:border-violet-400/60 resize-y leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-violet-200/60">
            Символов: <b className="text-violet-100">{stats.chars}</b> · Слов:{" "}
            <b className="text-violet-100">{stats.words}</b> · Строк:{" "}
            <b className="text-violet-100">{stats.lines}</b>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60 transition-all"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Скопировано" : "Скопировать"}
            </button>
            <button
              onClick={onCheckFast}
              className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60 transition-all"
              title="Только орфография, мгновенно (Яндекс.Спеллер)"
            >
              <Zap className="h-3.5 w-3.5 text-violet-300" />
              Быстрая
            </button>
            <button
              onClick={onCheckFull}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]"
              title="Орфография + пунктуация + грамматика (TextGears)"
            >
              <Sparkles className="h-4 w-4" />
              Полная проверка
            </button>
          </div>
        </div>
      </section>

      {/* Result */}
      {mistakes && (
        <section className="relative z-[10] rounded-3xl glass p-5">
          {mistakes.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Ошибок не найдено.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-rose-300">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Найдено: {mistakes.length}
                    </span>
                  </div>
                  {stats2 && Object.entries(stats2).map(([type, count]) => {
                    const colors = TYPE_COLORS[type] ?? TYPE_COLORS.grammar;
                    return (
                      <span
                        key={type}
                        className={`inline-flex items-center gap-1.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border px-2.5 py-0.5 text-xs`}
                      >
                        {TYPE_LABELS[type] ?? type}: {count}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={fixAll}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(16,185,129,0.7)]"
                >
                  <Wand2 className="h-4 w-4" />
                  Исправить всё
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-[#0a0c20]/70 border border-violet-400/10 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {highlighted?.map((p, i) => {
                  if (!p.bad) return <span key={i}>{p.text}</span>;
                  const colors = TYPE_COLORS[p.bad.type] ?? TYPE_COLORS.grammar;
                  return (
                    <span
                      key={i}
                      title={`${TYPE_LABELS[p.bad.type] ?? p.bad.type}${p.bad.suggestions.length ? " → " + p.bad.suggestions.slice(0, 5).join(", ") : ""}`}
                      className={`${colors.bg} ${colors.text} underline decoration-wavy underline-offset-4 px-0.5 rounded`}
                    >
                      {p.text}
                    </span>
                  );
                })}
              </div>

              <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-sm">
                {mistakes.slice(0, 50).map((m, i) => {
                  const colors = TYPE_COLORS[m.type] ?? TYPE_COLORS.grammar;
                  return (
                    <li key={i} className="rounded-xl bg-[#0a0c20]/40 border border-violet-400/10 px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block rounded-md ${colors.bg} ${colors.text} ${colors.border} border px-1.5 py-0 text-[10px] uppercase tracking-wider`}>
                          {TYPE_LABELS[m.type] ?? m.type}
                        </span>
                        <span className="text-rose-300 font-mono">{m.word}</span>
                        <span className="text-violet-200/40">→</span>
                        {m.suggestions && m.suggestions.length > 0 ? (
                          m.suggestions.slice(0, 4).map((s, j) => (
                            <button
                              key={j}
                              onClick={() => applyOne(m, s)}
                              className="rounded-lg bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-0.5 text-xs text-emerald-200 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-colors"
                              title="Кликни — исправить"
                            >
                              {s}
                            </button>
                          ))
                        ) : (
                          <span className="text-violet-200/50 text-xs">нет вариантов</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Chip({
  children, onClick,
}: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 border border-violet-400/20 px-3.5 py-1.5 text-xs hover:bg-violet-500/20 hover:border-violet-400/50 transition-colors"
    >
      {children}
    </button>
  );
}
