import { useEffect, useState } from "react";
import { FileText, ImageIcon, Video, FileType, FileArchive, Database, FileX } from "lucide-react";
import { listDrafts, type Draft } from "../lib/autosave";

type IconStyle = { icon: any; color: string; bg: string };

const styleByExt = (name: string): IconStyle => {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext))
    return { icon: ImageIcon, color: "text-fuchsia-300", bg: "from-fuchsia-500/20 to-violet-500/10" };
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext))
    return { icon: Video, color: "text-rose-300", bg: "from-rose-500/20 to-pink-500/10" };
  if (ext === "pdf")
    return { icon: FileType, color: "text-red-300", bg: "from-red-500/20 to-orange-500/10" };
  if (["zip", "rar", "7z", "tar"].includes(ext))
    return { icon: FileArchive, color: "text-emerald-300", bg: "from-emerald-500/20 to-teal-500/10" };
  if (["xlsx", "xls", "csv"].includes(ext))
    return { icon: Database, color: "text-emerald-300", bg: "from-emerald-500/20 to-cyan-500/10" };
  return { icon: FileText, color: "text-blue-300", bg: "from-blue-500/20 to-indigo-500/10" };
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "вчера";
  if (d < 7) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export default function RecentFiles() {
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    const refresh = () => setDrafts(listDrafts().slice(0, 6));
    refresh();
    // Обновляем при возврате на вкладку и каждые 30 сек
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="relative rounded-3xl glass p-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-[0.18em] text-violet-100/70 uppercase">
          Недавние файлы
        </h3>
        {drafts.length > 0 && (
          <span className="text-[11px] text-violet-300/70">{drafts.length}</span>
        )}
      </div>

      {drafts.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-violet-200/40">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 border border-violet-400/20 flex items-center justify-center mb-3">
            <FileX className="h-5 w-5" />
          </div>
          <p className="text-xs text-center">Здесь появятся файлы,<br />которые ты сохранишь в редакторах</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {drafts.map((d) => {
            const t = styleByExt(d.name);
            const Icon = t.icon;
            return (
              <li
                key={d.id}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-violet-500/5 transition-colors cursor-pointer"
              >
                {d.preview ? (
                  <img src={d.preview} alt="" className="h-9 w-9 rounded-lg object-cover border border-white/10 shrink-0" />
                ) : (
                  <div
                    className={`h-9 w-9 rounded-lg bg-gradient-to-br ${t.bg} border border-white/5 flex items-center justify-center shrink-0`}
                  >
                    <Icon className={`h-4 w-4 ${t.color}`} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{d.name}</p>
                  <p className="text-[11px] text-violet-200/45">
                    {d.source === "photo" ? "Редактор фото" : "Редактор видео"} · {timeAgo(d.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
