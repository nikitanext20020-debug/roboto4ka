import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  index: string;
  title: string;
  description: string;
  icon: ReactNode;
  variant: "blue" | "indigo" | "violet";
  onClick?: () => void;
};

const variantBg: Record<Props["variant"], string> = {
  blue: "from-[#0f1f4d]/80 to-[#0a1230]/60",
  indigo: "from-[#1a1b55]/80 to-[#0e1135]/60",
  violet: "from-[#2c1357]/80 to-[#1a0d3a]/60",
};

const variantGlow: Record<Props["variant"], string> = {
  blue: "card-glow-blue",
  indigo: "card-glow-indigo",
  violet: "card-glow-violet",
};

const variantIconBg: Record<Props["variant"], string> = {
  blue: "from-blue-500/30 to-indigo-600/20 border-blue-400/30 shadow-[0_0_30px_-8px_rgba(59,130,246,0.6)]",
  indigo: "from-indigo-500/30 to-violet-600/20 border-indigo-400/30 shadow-[0_0_30px_-8px_rgba(99,102,241,0.6)]",
  violet: "from-violet-500/30 to-fuchsia-600/20 border-violet-400/40 shadow-[0_0_30px_-8px_rgba(168,85,247,0.7)]",
};

export default function FeatureCard({
  index,
  title,
  description,
  icon,
  variant,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br ${variantBg[variant]} p-6 transition-all hover:border-violet-400/50 hover:-translate-y-1 cursor-pointer ${variantGlow[variant]}`}
    >
      {variant === "violet" && (
        <div className="absolute -bottom-10 -right-6 h-32 w-32 rounded-full bg-gradient-to-tr from-violet-500/40 to-fuchsia-400/20 blur-2xl animate-float-slower" />
      )}
      {variant === "blue" && (
        <div className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" />
      )}

      <div className="relative flex items-start justify-between">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl border bg-gradient-to-br ${variantIconBg[variant]}`}
        >
          {icon}
        </div>
        <span className="text-4xl font-black text-white/10 tracking-tighter">
          {index}
        </span>
      </div>

      <div className="relative mt-12">
        <h3 className="text-lg font-bold tracking-wide uppercase">{title}</h3>
        <p className="mt-2 text-sm text-violet-100/65 leading-relaxed max-w-[260px]">
          {description}
        </p>
      </div>

      <button className="relative mt-6 inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm font-medium text-white hover:border-violet-400/60 transition-all group-hover:gap-3">
        Перейти
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
