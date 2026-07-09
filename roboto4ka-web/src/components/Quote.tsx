import { useMemo } from "react";
import { Quote as QuoteIcon } from "lucide-react";

const QUOTES = [
  { text: "Лучший способ предсказать будущее — создать его.", author: "Питер Друкер" },
  { text: "Если всё работает — не трогайте Никиту. И наоборот.", author: "Народная мудрость" },
  { text: "Уровень продуктивности Никиты напрямую зависит от количества открытых вкладок с мемами.", author: "Наблюдения коллег" },
  { text: "Иногда лучший способ решить проблему — подождать, пока Никита случайно всё починит.", author: "Офисная статистика" },
  { text: "Не пугайтесь, если Никита смотрит в одну точку. Возможно, идёт процесс мышления.", author: "Инструкция по эксплуатации" },
  { text: "Перед фразой «я чуть-чуть изменил дизайн» лучше присядьте.", author: "Техника безопасности" },
  { text: "Код — это поэзия. Баги — это рифмы.", author: "Неизвестный разработчик" },
  { text: "Любая достаточно сложная программа содержит медленную реализацию половины Common Lisp.", author: "Закон Гринспена" },
  { text: "Сначала сделай так, чтобы работало. Потом — чтобы работало правильно. Потом — чтобы работало быстро.", author: "Кент Бек" },
  { text: "Если отладка — это процесс удаления ошибок, то программирование — это процесс их добавления.", author: "Дейкстра" },
];

export default function Quote() {
  // Меняем цитату каждый день
  const quote = useMemo(() => {
    const dayIndex = Math.floor(Date.now() / 86_400_000) % QUOTES.length;
    return QUOTES[dayIndex];
  }, []);

  return (
    <div className="relative rounded-3xl glass p-6 overflow-hidden">
      <div className="absolute -top-8 -left-6 h-32 w-32 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="absolute -bottom-10 -right-8 h-40 w-40 rounded-full bg-indigo-500/15 blur-3xl" />

      <div className="relative flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500/30 to-indigo-500/20 border border-violet-400/30 shrink-0">
          <QuoteIcon className="h-5 w-5 text-violet-200" strokeWidth={1.6} />
        </div>
        <div>
          <p className="text-base md:text-lg leading-relaxed" style={{ color: "var(--lt-text, rgba(233,213,255,0.9))" }}>
            «{quote.text}»
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--lt-text-muted, rgba(167,139,250,0.5))" }}>
            Совет дня · {quote.author}
          </p>
        </div>
      </div>
    </div>
  );
}
