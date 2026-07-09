import { useState } from "react";
import { History, Trash2, Clock, Search as SearchIcon } from "lucide-react";
import PageHeader from "../components/PageHeader";

type HistoryItem = {
  id: number;
  action: string;
  page: string;
  date: string;
  time: string;
};

const STORAGE_KEY = "roboto4ka_history";

export function addToHistory(action: string, page: string) {
  const items = loadHistory();
  const now = new Date();
  items.unshift({
    id: Date.now(),
    action,
    page,
    date: now.toLocaleDateString("ru"),
    time: now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
  });
  // Keep last 100
  if (items.length > 100) items.length = 100;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function HistoryPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<HistoryItem[]>(loadHistory);
  const [search, setSearch] = useState("");

  const onClear = () => {
    if (!confirm("Очистить всю историю?")) return;
    clearHistory();
    setItems([]);
  };

  const remove = (id: number) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const filtered = items.filter(
    (i) =>
      i.action.toLowerCase().includes(search.toLowerCase()) ||
      i.page.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="История" subtitle="Журнал ваших действий" onBack={onBack} />

      {/* Toolbar */}
      <section className="rounded-3xl glass p-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onClear}
          className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-red-400/60 hover:text-red-300 transition-all"
        >
          <Trash2 className="h-4 w-4" /> Очистить историю
        </button>
        <div className="ml-auto relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-300/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-[200px] rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-400/60"
          />
        </div>
      </section>

      {/* History list */}
      <section className="rounded-3xl glass overflow-hidden">
        <div className="max-h-[500px] overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-violet-200/40">
              <History className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>История пуста</p>
            </div>
          ) : (
            <div className="divide-y divide-violet-400/5">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-violet-500/5 group"
                >
                  <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-violet-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.action}</p>
                    <p className="text-[11px] text-violet-200/50">{item.page}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-violet-200/60">{item.date}</p>
                    <p className="text-[10px] text-violet-200/40">{item.time}</p>
                  </div>
                  <button
                    onClick={() => remove(item.id)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
