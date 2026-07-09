import { Loader2 } from "lucide-react";

export default function LoadingOverlay({
  visible,
  text = "Загрузка...",
}: {
  visible: boolean;
  text?: string;
}) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#040618]/70 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl px-8 py-7 flex flex-col items-center gap-4 min-w-[280px]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-violet-500/30 blur-xl" />
          <Loader2 className="relative h-9 w-9 text-violet-300 animate-spin" />
        </div>
        <p className="text-sm text-white/90 font-medium">{text}</p>
      </div>
    </div>
  );
}
