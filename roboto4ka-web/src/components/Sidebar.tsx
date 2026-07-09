import { Home, Search, FileText, ImageIcon, FileType, Video, Folder, Star, History, Settings, Sun, Moon, GitCompare } from "lucide-react";
import { useTheme } from "../lib/theme";

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const mainNav: NavItem[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "search", label: "Поиск по базе", icon: Search },
  { id: "compare", label: "Сверка таблиц", icon: GitCompare },
  { id: "text", label: "Анализ текста", icon: FileText },
  { id: "media", label: "Редактор фото", icon: ImageIcon },
  { id: "video", label: "Видеоредактор", icon: Video },
  { id: "convert", label: "Конвертер", icon: FileType },
];

const secondaryNav: NavItem[] = [
  { id: "files", label: "Файлы", icon: Folder },
  { id: "fav", label: "Избранное", icon: Star },
  { id: "history", label: "История", icon: History },
  { id: "settings", label: "Настройки", icon: Settings },
];

export default function Sidebar({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const { theme, toggle } = useTheme();
  return (
    <aside className="hidden lg:flex w-[260px] shrink-0 flex-col gap-6 px-6 py-7 border-r border-violet-500/15 bg-[#070820]/60 backdrop-blur-xl relative overflow-visible z-[5]">
      {/* Mascot - positioned absolutely, visible behind nav buttons */}
      <div className="absolute top-12 -right-4 w-[210px] pointer-events-none z-[1]">
        <div className="absolute inset-0 bg-violet-500/20 blur-3xl rounded-full animate-glow-pulse" />
        <img
          src="./3D.png"
          alt="Маскот"
          className="relative w-full h-auto drop-shadow-[0_0_30px_rgba(139,92,246,0.6)] opacity-90"
        />
      </div>

      {/* Logo block */}
      <div className="relative z-10">
        <h1 className="text-[28px] font-black tracking-tight leading-none">
          ROBOTO<span className="text-violet-400">4</span>KA
        </h1>
        <p className="mt-2 text-[10px] tracking-[0.18em] text-violet-200/50 font-semibold">
          CREATE BY NIKITA MISCHENKO
        </p>

        <p className="mt-6 text-xs leading-snug text-violet-100/70">
          Специально для<br />офисных планктонов
        </p>
      </div>

      <nav className="relative z-[2] flex flex-col gap-2 mt-4">
        {mainNav.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all backdrop-blur-sm ${
                isActive
                  ? "bg-white/10 border border-violet-300/30 text-white shadow-[0_0_20px_-5px_rgba(139,92,246,0.4)]"
                  : "bg-white/5 border border-white/10 text-violet-100/80 hover:bg-white/10 hover:border-violet-300/30 hover:text-white"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${
                  isActive
                    ? "text-violet-300"
                    : "text-violet-300/60 group-hover:text-violet-200"
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="h-px bg-gradient-to-r from-transparent via-violet-500/25 to-transparent relative z-[2]" />

      <nav className="relative z-[2] flex flex-col gap-1">
        {secondaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-violet-100/60 hover:bg-violet-500/10 hover:text-white transition-all"
            >
              <Icon className="h-4 w-4 text-violet-300/50 group-hover:text-violet-200" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Переключатель темы */}
      <button
        onClick={toggle}
        className="relative z-[2] mx-6 mb-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-violet-100/60 hover:bg-violet-500/10 hover:text-white transition-all"
      >
        {theme === "dark" ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-violet-300" />}
        <span>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
      </button>

      <div className="relative z-[2] rounded-2xl p-3 glass overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-violet-400 via-indigo-500 to-violet-700 flex items-center justify-center text-sm font-bold ring-2 ring-violet-400/40">
              NM
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#070820] animate-pulse-glow" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Nikita Mischenko</p>
            <p className="text-[11px] text-violet-200/60 truncate">Планктон уровня SSS</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

