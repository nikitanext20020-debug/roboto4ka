import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="h-10 w-10 rounded-xl glass flex items-center justify-center hover:border-violet-400/60 transition-colors"
            aria-label="Назад"
          >
            <ChevronLeft className="h-4 w-4 text-violet-200" />
          </button>
        )}
        <div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            <span className="text-gradient-violet">{title}</span>
          </h2>
          {subtitle && (
            <p className="mt-1.5 text-sm text-violet-100/60">{subtitle}</p>
          )}
        </div>
      </div>

      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
