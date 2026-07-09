// Хранилище файлов, папок, черновиков, избранного и истории.

const FILES_KEY = "roboto4ka_files";
const HISTORY_KEY = "roboto4ka_history";
const DRAFTS_KEY = "roboto4ka_drafts";
const FAVORITES_KEY = "roboto4ka_favorites";

export type Draft = {
  id: number;
  source: "photo" | "video";
  name: string;
  preview: string;          // dataURL
  data?: string;            // полный dataURL — для открытия
  createdAt: string;
};

export type FileItem = {
  id: number;
  name: string;
  type: "file" | "folder";
  size: string;
  date: string;
  source?: "photo" | "video";
  preview?: string;
  parentId?: number | null; // null = корень
  draftId?: number;         // ссылка на черновик
};

export type HistoryItem = {
  id: number;
  action: string;
  page: string;
  date: string;
  time: string;
};

export type Favorite = {
  id: number;
  source: "photo" | "video";
  name: string;
  preview: string;
  data?: string;
  addedAt: string;
};

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // переполнение — попробуем удалить старые превью
    try {
      const list = (value as any[]).slice(0, 20);
      localStorage.setItem(key, JSON.stringify(list));
    } catch {}
  }
}

// ========= Drafts =========
export function listDrafts(): Draft[] {
  return read<Draft>(DRAFTS_KEY);
}

export function getDraft(id: number): Draft | undefined {
  return read<Draft>(DRAFTS_KEY).find((d) => d.id === id);
}

export function clearDraft(id: number) {
  write(DRAFTS_KEY, read<Draft>(DRAFTS_KEY).filter((d) => d.id !== id));
  write(FILES_KEY, read<FileItem>(FILES_KEY).filter((f) => f.draftId !== id));
}

export function saveDraft(opts: {
  source: "photo" | "video";
  name: string;
  preview: string;
  data?: string;
}): number {
  const now = new Date();
  const drafts = read<Draft>(DRAFTS_KEY);

  const existing = drafts.find(
    (d) => d.source === opts.source && d.name === opts.name
  );

  let id: number;
  if (existing) {
    existing.preview = opts.preview;
    if (opts.data) existing.data = opts.data;
    existing.createdAt = now.toISOString();
    id = existing.id;
  } else {
    id = Date.now();
    drafts.unshift({
      id,
      source: opts.source,
      name: opts.name,
      preview: opts.preview,
      data: opts.data,
      createdAt: now.toISOString(),
    });
  }

  if (drafts.length > 30) drafts.length = 30;
  write(DRAFTS_KEY, drafts);

  // Зеркало в "Файлах" (корневая папка)
  const files = read<FileItem>(FILES_KEY);
  const fileName = `${opts.name} (черновик)`;
  const idx = files.findIndex(
    (f) => f.name === fileName && f.source === opts.source && f.type === "file"
  );
  const fileItem: FileItem = {
    id,
    name: fileName,
    type: "file",
    size: "—",
    date: now.toLocaleDateString("ru"),
    source: opts.source,
    preview: opts.preview,
    parentId: idx >= 0 ? files[idx].parentId ?? null : null,
    draftId: id,
  };
  if (idx >= 0) files[idx] = fileItem;
  else files.unshift(fileItem);
  write(FILES_KEY, files);

  // История (антиспам)
  const history = read<HistoryItem>(HISTORY_KEY);
  const sourceLabel = opts.source === "photo" ? "Редактор фото" : "Редактор видео";
  const last = history.find(
    (h) => h.action.includes(opts.name) && h.page === sourceLabel
  );
  if (!last || Date.now() - (last.id ?? 0) > 30_000) {
    history.unshift({
      id: Date.now(),
      action: `Сохранён черновик «${opts.name}»`,
      page: sourceLabel,
      date: now.toLocaleDateString("ru"),
      time: now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
    });
    if (history.length > 100) history.length = 100;
    write(HISTORY_KEY, history);
  }

  return id;
}

// ========= Files / Folders =========
export function listFiles(parentId: number | null = null): FileItem[] {
  return read<FileItem>(FILES_KEY).filter((f) => (f.parentId ?? null) === parentId);
}

export function getFile(id: number): FileItem | undefined {
  return read<FileItem>(FILES_KEY).find((f) => f.id === id);
}

export function getFolderPath(id: number | null): FileItem[] {
  if (id === null) return [];
  const all = read<FileItem>(FILES_KEY);
  const path: FileItem[] = [];
  let current: FileItem | undefined = all.find((f) => f.id === id);
  while (current) {
    path.unshift(current);
    if (current.parentId == null) break;
    current = all.find((f) => f.id === current!.parentId);
  }
  return path;
}

export function createFolder(name: string, parentId: number | null = null): number {
  const id = Date.now();
  const now = new Date();
  const files = read<FileItem>(FILES_KEY);
  files.unshift({
    id, name, type: "folder",
    size: "—",
    date: now.toLocaleDateString("ru"),
    parentId,
  });
  write(FILES_KEY, files);
  return id;
}

export function renameItem(id: number, newName: string) {
  const files = read<FileItem>(FILES_KEY);
  const it = files.find((f) => f.id === id);
  if (it) { it.name = newName; write(FILES_KEY, files); }
}

export function moveItem(id: number, newParentId: number | null) {
  const files = read<FileItem>(FILES_KEY);
  const it = files.find((f) => f.id === id);
  if (it) { it.parentId = newParentId; write(FILES_KEY, files); }
}

export function deleteItem(id: number) {
  const files = read<FileItem>(FILES_KEY);
  // Удаляем папку рекурсивно
  const toDelete = new Set<number>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of files) {
      if (f.parentId != null && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
        toDelete.add(f.id);
        changed = true;
      }
    }
  }
  const remaining = files.filter((f) => !toDelete.has(f.id));
  write(FILES_KEY, remaining);
  // Чистим связанные черновики
  const drafts = read<Draft>(DRAFTS_KEY).filter((d) => !toDelete.has(d.id));
  write(DRAFTS_KEY, drafts);
}

// ========= Favorites =========
export function listFavorites(): Favorite[] {
  return read<Favorite>(FAVORITES_KEY);
}

export function isFavorite(source: "photo" | "video", name: string): boolean {
  return read<Favorite>(FAVORITES_KEY).some(
    (f) => f.source === source && f.name === name
  );
}

export function toggleFavorite(opts: {
  source: "photo" | "video";
  name: string;
  preview: string;
  data?: string;
}): boolean {
  const list = read<Favorite>(FAVORITES_KEY);
  const idx = list.findIndex((f) => f.source === opts.source && f.name === opts.name);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(FAVORITES_KEY, list);
    return false;
  }
  list.unshift({
    id: Date.now(),
    source: opts.source,
    name: opts.name,
    preview: opts.preview,
    data: opts.data,
    addedAt: new Date().toISOString(),
  });
  if (list.length > 50) list.length = 50;
  write(FAVORITES_KEY, list);
  return true;
}

export function removeFavorite(id: number) {
  write(FAVORITES_KEY, read<Favorite>(FAVORITES_KEY).filter((f) => f.id !== id));
}

// ========= History =========
export function listHistory(): HistoryItem[] {
  return read<HistoryItem>(HISTORY_KEY);
}

export function clearHistory() {
  write(HISTORY_KEY, []);
}

export function logHistory(action: string, page: string) {
  const now = new Date();
  const history = read<HistoryItem>(HISTORY_KEY);
  history.unshift({
    id: Date.now(),
    action,
    page,
    date: now.toLocaleDateString("ru"),
    time: now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
  });
  if (history.length > 100) history.length = 100;
  write(HISTORY_KEY, history);
}
