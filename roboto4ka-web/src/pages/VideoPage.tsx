import { useEffect, useRef, useState } from "react";
import {
  Upload, Download, Scissors, Wand2, Volume2, VolumeX,
  RotateCw, Gauge, ImagePlus, FileVideo, Play, RefreshCw,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import LoadingOverlay from "../components/LoadingOverlay";
import { downloadBlob } from "../lib/image";
import { saveDraft, logHistory, toggleFavorite, isFavorite } from "../lib/autosave";
import { useAppState } from "../lib/appState";
import {
  uploadVideo, buildVideoUrl, downloadAsBlob, generateCaptions, triggerTranscription,
  type UploadResult, type Transform,
} from "../lib/cloudinary";

const EFFECTS = [
  { id: "none", label: "Без эффекта" },
  { id: "gray", label: "Ч/Б", effect: "grayscale" },
  { id: "sepia", label: "Сепия", effect: "sepia" },
  { id: "blur", label: "Размытие", effect: "blur:600" },
  { id: "reverse", label: "Реверс", effect: "reverse" },
  { id: "boomerang", label: "Бумеранг", effect: "boomerang" },
  { id: "fade", label: "Затухание", effect: "fade:2000" },
  { id: "vignette", label: "Виньетка", effect: "vignette" },
];

// HDR-стили — наборы фильтров для улучшения
const HDR_PRESETS = [
  { id: "off", label: "Выкл" },
  { id: "auto", label: "Авто-улучшение", effects: ["improve:50"] },
  { id: "hdr", label: "HDR", effects: ["improve:80", "saturation:30", "contrast:25"] },
  { id: "vivid", label: "Сочный", effects: ["improve:60", "saturation:60", "contrast:15"] },
  { id: "cinematic", label: "Киношный", effects: ["improve:40", "saturation:-15", "contrast:35", "gamma:value_70"] },
  { id: "warm", label: "Тёплый", effects: ["improve:50", "saturation:20", "tint:30:orange:white"] },
  { id: "cold", label: "Холодный", effects: ["improve:50", "saturation:20", "tint:30:cyan:white"] },
  { id: "bright", label: "Яркий", effects: ["brightness:30", "saturation:25", "improve:40"] },
];

const FORMATS = [
  { id: "mp4", label: "MP4" },
  { id: "webm", label: "WebM" },
  { id: "mov", label: "MOV" },
  { id: "gif", label: "GIF" },
  { id: "mp3", label: "MP3 (звук)" },
] as const;

type Format = typeof FORMATS[number]["id"];

// Захват первого кадра видео в dataURL для превью-черновика
async function captureVideoFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      } catch {
        // ignore
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = 320;
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || 200;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0, w, h);
        const data = canvas.toDataURL("image/jpeg", 0.7);
        URL.revokeObjectURL(url);
        resolve(data);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("video load error"));
    };
  });
}

export default function VideoPage({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Черновые настройки (меняются без перезагрузки превью)
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [quality, setQuality] = useState<"auto" | "auto:low" | "auto:good" | "auto:best">("auto");
  const [effect, setEffect] = useState("none");
  const [hdr, setHdr] = useState("off");
  const [speed, setSpeed] = useState(1);
  const [angle, setAngle] = useState(0);
  const [muted, setMuted] = useState(false);
  const [format, setFormat] = useState<Format>("mp4");

  // Субтитры
  const [subtitles, setSubtitles] = useState<{ srt: string; vtt: string } | null>(null);
  const [subtitlesGenerating, setSubtitlesGenerating] = useState(false);
  const [burnSubtitles, setBurnSubtitles] = useState(false);

  // Применённые настройки (обновляют превью только по кнопке)
  const [applied, setApplied] = useState<Transform | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const duration = upload?.duration ?? 0;

  const onPick = () => inputRef.current?.click();

  // Подхват из "Файлов"/"Избранного"
  const { pendingOpen, setPendingOpen } = useAppState();
  useEffect(() => {
    if (pendingOpen?.source === "video" && pendingOpen.data) {
      // Для видео data это URL Cloudinary, нельзя превратить обратно в File
      // Просто покажем сообщение что для повторного редактирования нужно перезагрузить
      alert("Видео из Файлов/Избранного нужно загрузить заново через «Выбрать видео».");
      setPendingOpen(null);
    }
  }, [pendingOpen, setPendingOpen]);

  // Избранное
  const [favVersion, setFavVersion] = useState(0);
  const isInFavorites = file ? isFavorite("video", file.name) : false;
  const onToggleFav = () => {
    if (!file) return;
    toggleFavorite({
      source: "video",
      name: file.name,
      preview: upload?.url ?? "",
      data: upload?.url, // Cloudinary URL — открыть нельзя, но в избранном будет ссылка
    });
    setFavVersion((v) => v + 1);
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setFile(f);
    setUpload(null);
    setApplied(null);
    setLoading("Загрузка в Cloudinary...");
    setUploadProgress(0);
    try {
      const res = await uploadVideo(f, (p) => setUploadProgress(p));
      setUpload(res);
      const dur = res.duration ?? 0;
      setStart(0);
      setEnd(dur);
      setWidth(res.width);
      setHeight(res.height);
      // Показываем оригинал сразу
      setApplied({});
      setPreviewKey((k) => k + 1);

      // Сохраняем черновик: превью — кадр из видео
      try {
        const preview = await captureVideoFrame(f);
        saveDraft({ source: "video", name: f.name, preview });
      } catch {
        saveDraft({ source: "video", name: f.name, preview: "" });
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      alert("Не удалось загрузить: " + msg);
    } finally {
      setLoading(null);
    }
  };

  const buildTransform = (): Transform => {
    if (!upload) return {};
    const t: Transform = { quality, format };
    if (start > 0) t.startOffset = start;
    if (end > 0 && end < duration) t.endOffset = end;
    if (width && width !== upload.width) { t.width = width; t.crop = "fill"; }
    if (height && height !== upload.height) { t.height = height; t.crop = "fill"; }
    const eff = EFFECTS.find((e) => e.id === effect);
    if (eff?.effect) t.effect = eff.effect as string;
    // HDR / улучшение
    const hdrPreset = HDR_PRESETS.find((p) => p.id === hdr);
    if (hdrPreset?.effects) t.extraEffects = hdrPreset.effects;
    if (speed !== 1) t.speedFactor = speed;
    if (angle !== 0) t.angle = angle;
    if (muted) t.audioCodec = "none";
    // Субтитры — наложение поверх видео
    if (burnSubtitles && subtitles) {
      t.subtitles = `${upload.publicId}.transcript`;
    }
    return t;
  };

  // Применить настройки → обновить превью
  const applyPreview = () => {
    setApplied(buildTransform());
    setPreviewKey((k) => k + 1);
  };

  const reset = () => {
    if (!upload) return;
    setStart(0); setEnd(duration);
    setWidth(upload.width); setHeight(upload.height);
    setQuality("auto"); setEffect("none"); setHdr("off");
    setSpeed(1); setAngle(0); setMuted(false); setFormat("mp4");
    setBurnSubtitles(false);
    setApplied({});
    setPreviewKey((k) => k + 1);
  };

  const onSave = async () => {
    if (!upload) return;
    setLoading("Применяю обработку и скачиваю...");
    try {
      const url = buildVideoUrl(upload.publicId, buildTransform());
      const blob = await downloadAsBlob(url, (p) => setLoading(`Скачивание ${p}%`));
      const ext = format === "mp3" ? "mp3" : format;
      const outName = `${file?.name.replace(/\.[^.]+$/, "") ?? "video"}_edited.${ext}`;
      downloadBlob(blob, outName);
      logHistory(`Сохранено: ${outName}`, "Редактор видео");
    } catch (e: any) {
      alert("Не удалось скачать: " + (e?.message ?? e));
    } finally {
      setLoading(null);
    }
  };

  // ---- Subtitles ----
  const onGenerateSubtitles = async () => {
    if (!upload) return;
    setSubtitlesGenerating(true);
    setLoading("Генерация субтитров... это может занять до минуты");
    try {
      await triggerTranscription(upload.publicId);
      let result: { srtUrl: string; vttUrl: string; transcriptPublicId: string } | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        setLoading(`Генерация субтитров... ${i * 3 + 3}с`);
        try {
          result = await generateCaptions(upload.publicId);
          break;
        } catch (e) { /* ждём */ }
      }
      if (!result) {
        throw new Error(
          "Транскрипт не готов. Возможно, add-on Auto-Transcribe не активен на твоём аккаунте Cloudinary.\n\n" +
          "Активируй: cloudinary.com/console/addons → Auto Transcribe (есть бесплатный тир)."
        );
      }
      setSubtitles({ srt: result.srtUrl, vtt: result.vttUrl });
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setSubtitlesGenerating(false);
      setLoading(null);
    }
  };

  const downloadSrt = async () => {
    if (!subtitles) return;
    try {
      const r = await fetch(subtitles.srt);
      const text = await r.text();
      const blob = new Blob([text], { type: "text/plain" });
      downloadBlob(blob, `${file?.name.replace(/\.[^.]+$/, "") ?? "video"}.srt`);
    } catch (e: any) {
      alert("Ошибка: " + (e?.message ?? e));
    }
  };

  const previewUrl = upload && applied !== null
    ? buildVideoUrl(upload.publicId, applied)
    : "";

  const dragOver = (e: React.DragEvent) => e.preventDefault();
  const drop = (e: React.DragEvent) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); };

  return (
    <div className="space-y-5">
      <LoadingOverlay
        visible={!!loading}
        text={loading + (loading?.startsWith("Загрузка") && uploadProgress ? ` (${uploadProgress}%)` : "")}
      />
      <input ref={inputRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])} />

      <PageHeader
        title="Видеоредактор"
        subtitle="Обрезка, сжатие, эффекты, скорость. Через Cloudinary."
        onBack={onBack}
        right={
          <div className="flex items-center gap-2" data-fav-version={favVersion}>
            {file && (
              <button
                onClick={onToggleFav}
                title={isInFavorites ? "Убрать из избранного" : "В избранное"}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all ${
                  isInFavorites
                    ? "bg-yellow-500/20 border-yellow-400/40 text-yellow-200"
                    : "glass hover:border-yellow-400/60 hover:text-yellow-200"
                }`}
              >
                ⭐ {isInFavorites ? "В избранном" : "В избранное"}
              </button>
            )}
            <button onClick={onPick} className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all">
              <Upload className="h-4 w-4 text-violet-200" /> Выбрать видео
            </button>
          </div>
        }
      />

      {/* Drop zone */}
      {!upload ? (
        <section onClick={onPick} onDragOver={dragOver} onDrop={drop}
          className="rounded-3xl glass p-10 cursor-pointer hover:border-violet-400/40 transition-colors flex flex-col items-center justify-center gap-3 text-violet-200/60">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/30 to-indigo-500/15 border border-violet-400/30 flex items-center justify-center">
            <ImagePlus className="h-7 w-7 text-violet-200" />
          </div>
          <p className="text-sm">Перетащи видео сюда или нажми чтобы выбрать</p>
          <p className="text-xs text-violet-200/40">MP4 · MOV · WebM · AVI · MKV</p>
        </section>
      ) : (
        <section className="rounded-3xl glass p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileVideo className="h-4 w-4 text-violet-300" />
              <span className="text-sm">{file?.name}</span>
              <span className="text-xs text-violet-200/50">
                · {upload.width}×{upload.height} · {duration.toFixed(1)}с · {(upload.bytes / 1024 / 1024).toFixed(1)} МБ
              </span>
            </div>
            <button onClick={reset} className="rounded-lg glass px-3 py-1.5 text-xs hover:border-violet-400/60 transition-all">
              <RefreshCw className="h-3 w-3 inline mr-1" /> Сброс
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden bg-black flex items-center justify-center max-h-[440px]">
            {previewUrl ? (
              <video key={previewKey} src={previewUrl} controls className="max-w-full max-h-[440px]" />
            ) : (
              <div className="text-violet-200/40 text-sm py-20">Настрой параметры и нажми «Применить»</div>
            )}
          </div>
        </section>
      )}

      {upload && (
        <>
          {/* ===== ОБРЕЗКА ===== */}
          <section className="rounded-3xl glass p-5">
            <div className="flex items-center gap-2 mb-4">
              <Scissors className="h-4 w-4 text-violet-300" />
              <h3 className="text-sm font-semibold">Обрезка по времени</h3>
              <span className="ml-auto text-xs text-violet-200/50">
                Результат: <b className="text-violet-100">{Math.max(0, end - start).toFixed(1)}с</b>
              </span>
            </div>

            {/* Таймлайн-слайдер */}
            <div className="relative h-10 rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 overflow-hidden">
              {/* Выделенная область */}
              <div
                className="absolute top-0 bottom-0 bg-violet-500/25 border-x-2 border-violet-400/60"
                style={{
                  left: `${(start / duration) * 100}%`,
                  width: `${((end - start) / duration) * 100}%`,
                }}
              />
              {/* Ползунок начала */}
              <input
                type="range" min={0} max={duration} step={0.1} value={start}
                onChange={(e) => { const v = +e.target.value; if (v < end) setStart(v); }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                style={{ pointerEvents: "auto" }}
              />
              {/* Ползунок конца */}
              <input
                type="range" min={0} max={duration} step={0.1} value={end}
                onChange={(e) => { const v = +e.target.value; if (v > start) setEnd(v); }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              {/* Метки */}
              <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                <span className="text-xs text-violet-200 font-mono bg-violet-600/60 rounded px-1.5 py-0.5">{start.toFixed(1)}с</span>
                <span className="text-xs text-violet-200/50 font-mono">{duration.toFixed(1)}с</span>
                <span className="text-xs text-violet-200 font-mono bg-violet-600/60 rounded px-1.5 py-0.5">{end.toFixed(1)}с</span>
              </div>
            </div>

            {/* Точные поля */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60">Начало (сек)</label>
                <input type="number" min={0} max={end - 0.1} step={0.1} value={start}
                  onChange={(e) => { const v = +e.target.value; if (v < end) setStart(v); }}
                  className="mt-1 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60">Конец (сек)</label>
                <input type="number" min={start + 0.1} max={duration} step={0.1} value={end}
                  onChange={(e) => { const v = +e.target.value; if (v > start) setEnd(v); }}
                  className="mt-1 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
              </div>
            </div>
          </section>

          {/* ===== СЖАТИЕ И РАЗМЕР ===== */}
          <section className="rounded-3xl glass p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wand2 className="h-4 w-4 text-violet-300" />
              <h3 className="text-sm font-semibold">Сжатие и размер</h3>
            </div>

            {/* Качество */}
            <div className="mb-4">
              <label className="text-[11px] uppercase tracking-wider text-violet-200/60">Качество / сжатие</label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {([
                  { v: "auto:best", label: "Максимум", desc: "Без потерь" },
                  { v: "auto", label: "Авто", desc: "Баланс" },
                  { v: "auto:good", label: "Хорошее", desc: "Меньше размер" },
                  { v: "auto:low", label: "Сжатие", desc: "Минимум МБ" },
                ] as const).map((q) => (
                  <button key={q.v} onClick={() => setQuality(q.v)}
                    className={`rounded-xl px-3 py-2.5 text-left border transition-all ${
                      quality === q.v
                        ? "bg-gradient-to-br from-violet-600/30 to-indigo-600/15 border-violet-400/50 text-white"
                        : "border-violet-400/15 text-violet-200/60 hover:border-violet-400/40"
                    }`}>
                    <div className="text-xs font-semibold">{q.label}</div>
                    <div className="text-[10px] text-violet-200/50 mt-0.5">{q.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Размер */}
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60">Ширина (px)</label>
                <input type="number" min={0} value={width} onChange={(e) => setWidth(+e.target.value)}
                  className="mt-1 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60">Высота (px)</label>
                <input type="number" min={0} value={height} onChange={(e) => setHeight(+e.target.value)}
                  className="mt-1 w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
              </div>
            </div>

            {/* Пресеты размера */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "720p", w: 1280, h: 720 },
                { label: "1080p", w: 1920, h: 1080 },
                { label: "480p", w: 854, h: 480 },
                { label: "9:16 Reels", w: 720, h: 1280 },
                { label: "1:1 Квадрат", w: 1080, h: 1080 },
                { label: "640px", w: 640, h: 0 },
              ].map((p) => (
                <button key={p.label} onClick={() => { setWidth(p.w); setHeight(p.h); }}
                  className="rounded-full bg-violet-500/10 border border-violet-400/20 px-3 py-1 text-xs hover:bg-violet-500/20 hover:border-violet-400/50 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* ===== HDR / УЛУЧШЕНИЕ ===== */}
          <section className="rounded-3xl glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="h-4 w-4 text-amber-300" />
              <h3 className="text-sm font-semibold">HDR и улучшение качества</h3>
              <span className="text-[10px] text-violet-200/40 ml-auto">AI обработка через Cloudinary</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {HDR_PRESETS.map((p) => (
                <button key={p.id} onClick={() => setHdr(p.id)}
                  className={`rounded-xl px-3 py-2.5 text-left border transition-all ${
                    hdr === p.id
                      ? "bg-gradient-to-br from-amber-500/30 to-orange-500/15 border-amber-400/50 text-white shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)]"
                      : "border-violet-400/15 text-violet-200/60 hover:border-violet-400/40"
                  }`}>
                  <div className="text-xs font-semibold">{p.label}</div>
                </button>
              ))}
            </div>
          </section>

          {/* ===== ЭФФЕКТЫ ===== */}
          <section className="rounded-3xl glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="h-4 w-4 text-violet-300" />
              <h3 className="text-sm font-semibold">Эффекты</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {EFFECTS.map((e) => (
                <button key={e.id} onClick={() => setEffect(e.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs border transition-all ${
                    effect === e.id
                      ? "bg-gradient-to-r from-violet-600/40 to-indigo-600/30 border-violet-400/50 text-white"
                      : "bg-violet-500/10 border-violet-400/20 text-violet-200/70 hover:border-violet-400/50"
                  }`}>
                  {e.label}
                </button>
              ))}
            </div>
          </section>

          {/* ===== СКОРОСТЬ / ПОВОРОТ / ЗВУК ===== */}
          <section className="rounded-3xl glass p-5">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60 flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5" /> Скорость
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input type="range" min={0.5} max={3} step={0.1} value={speed}
                    onChange={(e) => setSpeed(+e.target.value)} className="flex-1 accent-violet-500" />
                  <span className="text-xs text-violet-100 font-mono w-12 text-right">{speed.toFixed(1)}x</span>
                </div>
                <div className="mt-1 flex gap-1">
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <button key={s} onClick={() => setSpeed(s)}
                      className={`flex-1 rounded text-[10px] py-1 border transition-all ${
                        speed === s ? "bg-violet-600/30 border-violet-400/50 text-white" : "border-violet-400/15 text-violet-200/50"
                      }`}>{s}x</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60 flex items-center gap-1.5">
                  <RotateCw className="h-3.5 w-3.5" /> Поворот
                </label>
                <div className="mt-2 flex gap-1">
                  {[0, 90, 180, 270].map((a) => (
                    <button key={a} onClick={() => setAngle(a)}
                      className={`flex-1 rounded-lg py-2 text-xs border transition-all ${
                        angle === a ? "bg-violet-600/30 border-violet-400/50 text-white" : "border-violet-400/15 text-violet-200/60 hover:border-violet-400/40"
                      }`}>{a}°</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-violet-200/60">Звук</label>
                <button onClick={() => setMuted(!muted)}
                  className={`mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg py-2 text-xs border transition-all ${
                    muted ? "bg-rose-500/15 border-rose-400/40 text-rose-200" : "bg-emerald-500/10 border-emerald-400/30 text-emerald-200"
                  }`}>
                  {muted ? <><VolumeX className="h-3.5 w-3.5" /> Без звука</> : <><Volume2 className="h-3.5 w-3.5" /> Со звуком</>}
                </button>
              </div>
            </div>
          </section>

          {/* ===== СУБТИТРЫ ===== */}
          <section className="rounded-3xl glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileVideo className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold">Автогенерация субтитров</h3>
              <span className="text-[10px] text-violet-200/40 ml-auto">Cloudinary AI</span>
            </div>

            {!subtitles ? (
              <div>
                <p className="text-xs text-violet-200/60 mb-3">
                  AI распознает речь в видео и сгенерирует .srt файл с таймкодами.
                  Поддерживаются русский, английский, и ещё 50+ языков.
                </p>
                <button
                  onClick={onGenerateSubtitles}
                  disabled={subtitlesGenerating}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(8,145,178,0.7)] disabled:opacity-40"
                >
                  <FileVideo className="h-4 w-4" />
                  {subtitlesGenerating ? "Генерируется..." : "Сгенерировать субтитры"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 text-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Субтитры готовы
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={downloadSrt}
                    className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60">
                    <Download className="h-3.5 w-3.5" /> Скачать .srt
                  </button>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={burnSubtitles} onChange={(e) => setBurnSubtitles(e.target.checked)}
                      className="accent-violet-500" />
                    <span className="text-xs text-violet-200/80">Вписать субтитры в видео при сохранении</span>
                  </label>
                  <button onClick={() => { setSubtitles(null); setBurnSubtitles(false); }}
                    className="text-xs text-rose-300/70 hover:text-rose-300">
                    Сбросить
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ===== ФОРМАТ + КНОПКИ ===== */}
          <section className="rounded-3xl glass p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-violet-200/60">Формат:</span>
              {FORMATS.map((f) => (
                <button key={f.id} onClick={() => setFormat(f.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs border transition-all ${
                    format === f.id ? "bg-violet-600/30 border-violet-400/50 text-white" : "border-violet-400/15 text-violet-200/60 hover:border-violet-400/40"
                  }`}>{f.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={applyPreview}
                className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all">
                <Play className="h-3.5 w-3.5 text-violet-300" /> Применить и смотреть
              </button>
              <button onClick={onSave}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]">
                <Download className="h-4 w-4" /> Скачать
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
