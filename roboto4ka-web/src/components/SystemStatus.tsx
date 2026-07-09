export default function SystemStatus() {
  const points = [
    [0, 32], [12, 28], [24, 30], [36, 22], [48, 24],
    [60, 18], [72, 20], [84, 12], [96, 14], [108, 8],
    [120, 10], [132, 4], [144, 6],
  ];
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
    .join(" ");
  const areaPath = `${path} L 144 40 L 0 40 Z`;

  return (
    <div className="relative rounded-3xl glass p-6 overflow-hidden">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 className="text-base font-semibold text-white">Статус системы</h3>
          <div className="mt-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-sm text-violet-100/80">Все системы работают</span>
          </div>
        </div>

        <div className="shrink-0">
          <svg viewBox="0 0 144 40" className="h-14 w-36">
            <defs>
              <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#spark)" />
            <path
              d={path}
              fill="none"
              stroke="#34d399"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
