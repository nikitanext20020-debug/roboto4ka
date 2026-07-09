import { Search, Bell } from "lucide-react";

export default function Topbar() {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-4">
        <img
          src="./avatar.jpg.png"
          alt="Аватар"
          className="h-14 w-14 rounded-full object-cover ring-2 ring-violet-500/40 shadow-lg shadow-violet-500/20"
        />
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Добро пожаловать,{" "}
            <span className="text-gradient-violet">юзер</span>!{" "}
            <span className="animate-wave inline-block">👋</span>
          </h2>
          <p className="mt-1.5 text-sm text-violet-100/60">
            Выберите инструмент и творите магию
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-300/60" />
          <input
            type="text"
            placeholder="Быстрый поиск..."
            className="w-[280px] md:w-[340px] rounded-xl glass pl-10 pr-16 py-2.5 text-sm placeholder:text-violet-200/40 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] px-2 py-1 rounded-md bg-violet-500/15 text-violet-200/70 border border-violet-400/20 font-mono">
            Ctrl + K
          </kbd>
        </div>

        <button className="relative h-11 w-11 rounded-xl glass flex items-center justify-center hover:border-violet-400/50 transition-colors">
          <Bell className="h-4 w-4 text-violet-200" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-violet-400 animate-pulse-glow" />
        </button>
      </div>
    </div>
  );
}
