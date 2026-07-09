import {
  FileType,
  ImageIcon,
  Video,
  FileText,
  Search,
  ScanText,
  Sparkles,
  Plus,
} from "lucide-react";

const tools: { icon: any; label: string; color: string; target: string }[] = [
  { icon: FileType, label: "Конвертер\nфайлов", color: "text-blue-300", target: "convert" },
  { icon: ImageIcon, label: "Редактор\nфото", color: "text-violet-300", target: "media" },
  { icon: Search, label: "Поиск\nпо базе", color: "text-fuchsia-300", target: "search" },
  { icon: FileText, label: "Анализ\nтекста", color: "text-violet-300", target: "text" },
  { icon: Video, label: "Сжатие\nвидео", color: "text-violet-300", target: "media" },
  { icon: ScanText, label: "Извлечь\nтекст", color: "text-violet-300", target: "text" },
  { icon: Sparkles, label: "Орфо\nграфия", color: "text-violet-300", target: "text" },
  { icon: Plus, label: "Ещё\nинструменты", color: "text-violet-300", target: "home" },
];

export default function QuickAccess({ onSelect }: { onSelect?: (id: string) => void }) {
  return (
    <div className="relative rounded-3xl glass p-6 overflow-hidden">
      <h3 className="text-xs font-bold tracking-[0.18em] text-violet-100/70 uppercase">
        Быстрый доступ
      </h3>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.label}
              onClick={() => onSelect?.(tool.target)}
              className="tool-tile group flex flex-col items-center justify-center gap-2.5 rounded-2xl py-5 px-2"
            >
              <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-indigo-500/10 border border-violet-400/20 group-hover:border-violet-400/50 transition-colors">
                <Icon className={`h-5 w-5 ${tool.color}`} />
              </div>
              <span className="text-[11px] text-center text-violet-100/80 whitespace-pre-line leading-tight">
                {tool.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
