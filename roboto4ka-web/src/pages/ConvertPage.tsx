import { useEffect, useRef, useState } from "react";
import {
  Upload, Download, FileType, X, Loader2, FileCheck,
  AlertCircle, Settings as SettingsIcon, Key, Save,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { downloadBlob } from "../lib/image";
import { convertFile, getToken, setToken, getTargets, type ConvertProgress } from "../lib/converthub";
import { useAppState } from "../lib/appState";

type FileItem = {
  id: number;
  file: File;
  ext: string;
  target: string;
  status: "pending" | "uploading" | "processing" | "downloading" | "done" | "error";
  progress?: number;
  outputBlob?: Blob;
  outputName?: string;
  error?: string;
  abort?: AbortController;
};

let nextId = 1;

export default function ConvertPage({ onBack }: { onBack: () => void }) {
  const { convert, setConvert } = useAppState();

  // Локальный state с File-объектами (их нельзя в context)
  // При первом маунте восстанавливаем из context метаданные с пустым File
  const [files, setFiles] = useState<FileItem[]>(() =>
    convert.files.map((f) => ({
      id: f.id,
      file: new File([], f.fileName),
      ext: f.ext,
      target: f.target,
      status: f.status === "uploading" || f.status === "processing" || f.status === "downloading"
        ? "pending" : f.status,
      outputName: f.outputName,
      error: f.error,
    } as FileItem))
  );

  const [showSettings, setShowSettings] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Синхронизируем context при изменении files
  useEffect(() => {
    setConvert({
      files: files.map((f) => ({
        id: f.id,
        fileName: f.file.name,
        fileSize: f.file.size,
        ext: f.ext,
        target: f.target,
        status: f.status,
        outputName: f.outputName,
        outputSize: f.outputBlob?.size,
        error: f.error,
      })),
    });
  }, [files, setConvert]);

  useEffect(() => {
    const t = getToken();
    setHasToken(!!t);
    setTokenInput(t);
  }, []);

  const onPick = () => inputRef.current?.click();

  const onFiles = (list: FileList | null | undefined) => {
    if (!list) return;
    const arr = Array.from(list).map((f) => {
      const ext = (f.name.split(".").pop() ?? "").toLowerCase();
      const targets = getTargets(ext);
      return {
        id: nextId++,
        file: f,
        ext,
        target: targets[0] ?? "pdf",
        status: "pending" as const,
      };
    });
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (id: number) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      f?.abort?.abort();
      return prev.filter((x) => x.id !== id);
    });
  };

  const clearAll = () => {
    files.forEach((f) => f.abort?.abort());
    setFiles([]);
  };

  const updateTarget = (id: number, target: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, target } : f)));
  };

  const convertOne = async (item: FileItem) => {
    const abort = new AbortController();
    setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", abort, progress: 0 } : f)));

    const onProgress = (p: ConvertProgress) => {
      const stageMap: Record<string, FileItem["status"]> = {
        upload: "uploading",
        processing: "processing",
        download: "downloading",
      };
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? { ...f, status: stageMap[p.stage] ?? f.status, progress: p.progress }
            : f
        )
      );
    };

    try {
      const blob = await convertFile(item.file, item.target, onProgress, abort.signal);
      const base = item.file.name.replace(/\.[^.]+$/, "");
      const outputName = `${base}.${item.target}`;
      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: "done", outputBlob: blob, outputName, abort: undefined } : f
        )
      );
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "error", error: msg, abort: undefined } : f))
      );
    }
  };

  const convertAll = async () => {
    if (!hasToken) {
      setShowSettings(true);
      return;
    }
    const pending = files.filter((f) => f.status === "pending" || f.status === "error");
    for (const item of pending) {
      await convertOne(item);
    }
  };

  const downloadOne = (item: FileItem) => {
    if (item.outputBlob && item.outputName) downloadBlob(item.outputBlob, item.outputName);
  };

  const downloadAll = () => {
    for (const item of files) {
      if (item.outputBlob && item.outputName) downloadBlob(item.outputBlob, item.outputName);
    }
  };

  const saveToken = () => {
    setToken(tokenInput.trim());
    setHasToken(!!tokenInput.trim());
    setShowSettings(false);
  };

  const dragOver = (e: React.DragEvent) => e.preventDefault();
  const drop = (e: React.DragEvent) => { e.preventDefault(); onFiles(e.dataTransfer.files); };

  const totalDone = files.filter((f) => f.status === "done").length;
  const hasPending = files.some((f) => f.status === "pending" || f.status === "error");
  const inProgress = files.some((f) => ["uploading", "processing", "downloading"].includes(f.status));

  return (
    <div className="space-y-5">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      <PageHeader
        title="Конвертер"
        subtitle="PDF, DOCX, JPG, MP3, MP4, ZIP, RAR и десятки форматов через ConvertHub API."
        onBack={onBack}
        right={
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <button onClick={clearAll} className="rounded-xl glass px-3 py-2 text-xs hover:border-violet-400/60 transition-all">
                Очистить
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-2 rounded-xl glass px-3 py-2 text-xs hover:border-violet-400/60 transition-all">
              <SettingsIcon className="h-3.5 w-3.5" /> Настройки
            </button>
          </div>
        }
      />

      {!hasToken && (
        <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-300 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="text-amber-100 font-medium">Не задан API-ключ ConvertHub</p>
            <p className="text-amber-200/70 text-xs">Открой Настройки и вставь Bearer-токен. Бесплатно — 50 конвертаций в день на converthub.com.</p>
          </div>
          <button onClick={() => setShowSettings(true)} className="rounded-lg bg-amber-500/20 border border-amber-400/40 px-3 py-1.5 text-xs hover:bg-amber-500/30 transition-colors">
            <Key className="h-3 w-3 inline mr-1" /> Ввести
          </button>
        </section>
      )}

      {/* Drop zone */}
      <section
        onClick={onPick}
        onDragOver={dragOver}
        onDrop={drop}
        className="rounded-3xl glass p-10 cursor-pointer hover:border-violet-400/40 transition-colors flex flex-col items-center justify-center gap-3 text-violet-200/60"
      >
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/30 to-indigo-500/15 border border-violet-400/30 flex items-center justify-center">
          <Upload className="h-7 w-7 text-violet-200" />
        </div>
        <p className="text-sm">Перетащи файлы сюда или нажми чтобы выбрать</p>
        <p className="text-xs text-violet-200/40">PDF · DOCX · XLSX · JPG · PNG · MP3 · MP4 · ZIP · RAR · и многое другое</p>
      </section>

      {/* Action bar */}
      {files.length > 0 && (
        <section className="rounded-3xl glass p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-violet-200/70">
            Файлов: <b className="text-white">{files.length}</b>
            {totalDone > 0 && <> · Готово: <b className="text-emerald-300">{totalDone}</b></>}
          </div>
          <div className="flex items-center gap-3">
            {totalDone > 0 && (
              <button onClick={downloadAll} className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60 transition-all">
                <Download className="h-3.5 w-3.5" /> Скачать все ({totalDone})
              </button>
            )}
            <button
              onClick={convertAll}
              disabled={!hasPending || inProgress}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)] disabled:opacity-40"
            >
              {inProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileType className="h-4 w-4" />}
              Конвертировать
            </button>
          </div>
        </section>
      )}

      {/* File list */}
      {files.length > 0 && (
        <section className="rounded-3xl glass overflow-hidden">
          <ul className="divide-y divide-violet-400/10">
            {files.map((item) => {
              const targets = getTargets(item.ext);
              return (
                <li key={item.id} className="flex items-center gap-3 p-4 hover:bg-violet-500/5 transition-colors">
                  <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-400/15 flex items-center justify-center shrink-0 uppercase text-[11px] font-bold text-violet-200">
                    {item.status === "uploading" || item.status === "processing" || item.status === "downloading" ? (
                      <Loader2 className="h-4 w-4 text-violet-300 animate-spin" />
                    ) : item.status === "done" ? (
                      <FileCheck className="h-4 w-4 text-emerald-300" />
                    ) : item.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-rose-300" />
                    ) : (
                      <span>{item.ext.slice(0, 4)}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-violet-200/50">
                        {(item.file.size / 1024).toFixed(0)} КБ
                      </p>
                      {item.status === "uploading" && <span className="text-[11px] text-violet-300">· загрузка...</span>}
                      {item.status === "processing" && (
                        <span className="text-[11px] text-violet-300">
                          · конвертация{item.progress != null ? ` ${item.progress}%` : "..."}
                        </span>
                      )}
                      {item.status === "downloading" && <span className="text-[11px] text-violet-300">· скачивание...</span>}
                      {item.status === "done" && item.outputBlob && (
                        <span className="text-[11px] text-emerald-300">
                          → {item.outputName} · {(item.outputBlob.size / 1024).toFixed(0)} КБ
                        </span>
                      )}
                      {item.status === "error" && (
                        <span className="text-[11px] text-rose-300 truncate">· {item.error}</span>
                      )}
                    </div>
                  </div>

                  {/* Target format selector */}
                  {(item.status === "pending" || item.status === "error") && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-violet-200/50">→</span>
                      <select
                        value={item.target}
                        onChange={(e) => updateTarget(item.id, e.target.value)}
                        className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1 text-xs text-violet-100 focus:outline-none focus:border-violet-400/60 uppercase"
                      >
                        {targets.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {item.status === "done" && (
                    <button onClick={() => downloadOne(item)} className="rounded-lg glass px-3 py-1.5 text-xs hover:border-violet-400/60 transition-all">
                      <Download className="h-3 w-3 inline mr-1" /> Скачать
                    </button>
                  )}

                  <button
                    onClick={() => removeFile(item.id)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-violet-300/60 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040618]/70 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="glass-strong rounded-2xl p-6 max-w-md w-[92%] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-500/15 border border-violet-400/30 flex items-center justify-center">
                <Key className="h-4 w-4 text-violet-200" />
              </div>
              <div>
                <h3 className="text-base font-semibold">API-ключ ConvertHub</h3>
                <p className="text-xs text-violet-200/60">Хранится локально в браузере, никуда не отправляется</p>
              </div>
            </div>

            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="391|abc..."
              className="w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-3 text-sm focus:outline-none focus:border-violet-400/60 font-mono"
            />

            <p className="mt-3 text-xs text-violet-200/50">
              Получить ключ:{" "}
              <a href="https://converthub.com/api/signup" target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200 underline">
                converthub.com/api/signup
              </a>
              {" "}— 50 бесплатных конвертаций/день.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowSettings(false)} className="rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60 transition-all">
                Отмена
              </button>
              <button onClick={saveToken} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]">
                <Save className="h-3.5 w-3.5" /> Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
