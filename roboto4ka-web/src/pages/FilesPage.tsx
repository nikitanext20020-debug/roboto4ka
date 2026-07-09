import { useEffect, useState } from "react";
import {
  Folder, FolderPlus, ChevronRight, FileText, ImageIcon, Video, FileType,
  FileArchive, Database, Trash2, Pencil, Star, Move, ArrowLeft, FolderOpen,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  listFiles, createFolder, deleteItem, renameItem, moveItem, getDraft,
  toggleFavorite, isFavorite, getFolderPath, type FileItem,
} from "../lib/autosave";
import { useAppState } from "../lib/appState";

export default function FilesPage({
  onBack,
  onOpenInEditor,
}: {
  onBack: () => void;
  onOpenInEditor: (page: "media" | "video") => void;
}) {
  const { setPendingOpen } = useAppState();
  const [parentId, setParentId] = useState<number | null>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [version, setVersion] = useState(0);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveItemId, setMoveItemId] = useState<number | null>(null);

  useEffect(() => { setItems(listFiles(parentId)); }, [parentId, version]);

  const refresh = () => setVersion((v) => v + 1);
  const path = getFolderPath(parentId);
  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type === "file");

  const onOpen = (it: FileItem) => {
    if (it.type === "folder") {
      setParentId(it.id);
      return;
    }
    if (!it.draftId || !it.source) return;
    const draft = getDraft(it.draftId);
    if (!draft || !draft.data) {
      alert("Файл больше нельзя открыть — данные не сохранились (только превью).");
      return;
    }
    setPendingOpen({ source: it.source, name: draft.name, data: draft.data });
    onOpenInEditor(it.source === "photo" ? "media" : "video");
  };

  const onCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim(), parentId);
    setNewFolderName("");
    setShowNewFolder(false);
    refresh();
  };

  const onDelete = (it: FileItem) => {
    if (!confirm(`Удалить «${it.name}»${it.type === "folder" ? " и всё содержимое" : ""}?`)) return;
    deleteItem(it.id);
    refresh();
  };

  const onRename = (it: FileItem) => {
    setRenameId(it.id);
    setRenameValue(it.name);
  };

  const submitRename = () => {
    if (renameId && renameValue.trim()) {
      renameItem(renameId, renameValue.trim());
    }
    setRenameId(null);
    setRenameValue("");
    refresh();
  };

  const onToggleFav = (it: FileItem) => {
    if (!it.draftId || !it.source) return;
    const draft = getDraft(it.draftId);
    toggleFavorite({
      source: it.source,
      name: it.name.replace(/ \(черновик\)$/, ""),
      preview: it.preview ?? "",
      data: draft?.data,
    });
    refresh();
  };

  const onMoveTo = (folderId: number | null) => {
    if (moveItemId === null) return;
    moveItem(moveItemId, folderId);
    setMoveItemId(null);
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Файлы"
        subtitle="Черновики, папки, открытие в редакторе"
        onBack={onBack}
        right={
          <button
            onClick={() => setShowNewFolder(true)}
            className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all"
          >
            <FolderPlus className="h-4 w-4 text-violet-200" /> Новая папка
          </button>
        }
      />

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button
          onClick={() => setParentId(null)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-violet-500/10 transition-colors ${
            parentId === null ? "text-white" : "text-violet-200/70"
          }`}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Корень
        </button>
        {path.map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-violet-300/40" />
            <button
              onClick={() => setParentId(p.id)}
              className={`rounded-lg px-3 py-1.5 hover:bg-violet-500/10 transition-colors ${
                p.id === parentId ? "text-white" : "text-violet-200/70"
              }`}
            >
              {p.name}
            </button>
          </span>
        ))}
      </div>

      {/* New folder modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNewFolder(false)}>
          <div className="glass-strong rounded-2xl p-5 w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Создать папку</h3>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreateFolder()}
              placeholder="Название папки"
              className="w-full rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowNewFolder(false)} className="rounded-lg glass px-4 py-2 text-sm">Отмена</button>
              <button onClick={onCreateFolder} className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold">Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Move modal */}
      {moveItemId !== null && (
        <MoveModal
          itemId={moveItemId}
          currentParent={parentId}
          onClose={() => setMoveItemId(null)}
          onMove={onMoveTo}
        />
      )}

      {/* Folders */}
      {folders.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-violet-200/50 mb-3">Папки</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map((f) => (
              <FolderCard
                key={f.id}
                item={f}
                onOpen={() => onOpen(f)}
                onRename={() => onRename(f)}
                onDelete={() => onDelete(f)}
                onMove={() => setMoveItemId(f.id)}
                renameMode={renameId === f.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameSubmit={submitRename}
              />
            ))}
          </div>
        </section>
      )}

      {/* Files */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-violet-200/50 mb-3">
          Файлы {files.length > 0 && `· ${files.length}`}
        </h3>
        {files.length === 0 ? (
          <div className="rounded-3xl glass p-10 flex flex-col items-center text-violet-200/40">
            <FileText className="h-10 w-10 mb-3" />
            <p className="text-sm">{folders.length === 0 ? "Тут пусто. Открой редактор фото или видео — файлы появятся здесь." : "В этой папке нет файлов"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {files.map((f) => (
              <FileCard
                key={f.id}
                item={f}
                onOpen={() => onOpen(f)}
                onRename={() => onRename(f)}
                onDelete={() => onDelete(f)}
                onMove={() => setMoveItemId(f.id)}
                onFav={() => onToggleFav(f)}
                isFav={f.source ? isFavorite(f.source, f.name.replace(/ \(черновик\)$/, "")) : false}
                renameMode={renameId === f.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameSubmit={submitRename}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function styleByExt(name: string) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext))
    return { icon: ImageIcon, color: "text-fuchsia-300" };
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext))
    return { icon: Video, color: "text-rose-300" };
  if (ext === "pdf") return { icon: FileType, color: "text-red-300" };
  if (["zip", "rar", "7z", "tar"].includes(ext)) return { icon: FileArchive, color: "text-emerald-300" };
  if (["xlsx", "xls", "csv"].includes(ext)) return { icon: Database, color: "text-emerald-300" };
  return { icon: FileText, color: "text-blue-300" };
}

function FolderCard({ item, onOpen, onRename, onDelete, onMove, renameMode, renameValue, onRenameChange, onRenameSubmit }: any) {
  return (
    <div className="group relative rounded-2xl glass p-4 hover:border-violet-400/40 transition-all cursor-pointer" onClick={() => !renameMode && onOpen()}>
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/15 border border-amber-400/30 flex items-center justify-center mb-3">
        <Folder className="h-5 w-5 text-amber-300" />
      </div>
      {renameMode ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={(e) => { if (e.key === "Enter") onRenameSubmit(); if (e.key === "Escape") onRenameChange(""); }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-lg bg-[#0a0c20]/70 border border-violet-400/30 px-2 py-1 text-sm focus:outline-none"
        />
      ) : (
        <p className="text-sm text-white truncate">{item.name}</p>
      )}
      <p className="text-[11px] text-violet-200/45 mt-0.5">{item.date}</p>
      <ItemActions onRename={onRename} onDelete={onDelete} onMove={onMove} />
    </div>
  );
}

function FileCard({ item, onOpen, onRename, onDelete, onMove, onFav, isFav, renameMode, renameValue, onRenameChange, onRenameSubmit }: any) {
  const t = styleByExt(item.name);
  const Icon = t.icon;
  return (
    <div
      className="group relative rounded-2xl glass overflow-hidden hover:border-violet-400/40 transition-all cursor-pointer"
      onClick={() => !renameMode && onOpen()}
    >
      <div className="aspect-video bg-[#0a0c20]/60 flex items-center justify-center overflow-hidden">
        {item.preview ? (
          <img src={item.preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className={`h-10 w-10 ${t.color}`} />
        )}
      </div>
      <div className="p-3">
        {renameMode ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={(e) => { if (e.key === "Enter") onRenameSubmit(); if (e.key === "Escape") onRenameChange(""); }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-lg bg-[#0a0c20]/70 border border-violet-400/30 px-2 py-1 text-sm focus:outline-none"
          />
        ) : (
          <p className="text-sm text-white truncate">{item.name}</p>
        )}
        <p className="text-[11px] text-violet-200/45 mt-0.5">{item.date}</p>
      </div>
      {item.source && (
        <button
          onClick={(e) => { e.stopPropagation(); onFav(); }}
          className={`absolute top-2 left-2 h-7 w-7 rounded-lg flex items-center justify-center backdrop-blur-md transition-all ${
            isFav ? "bg-yellow-500/30 text-yellow-200" : "bg-black/30 text-white/60 hover:text-yellow-200 opacity-0 group-hover:opacity-100"
          }`}
          title={isFav ? "Убрать из избранного" : "В избранное"}
        >
          <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
        </button>
      )}
      <ItemActions onRename={onRename} onDelete={onDelete} onMove={onMove} />
    </div>
  );
}

function ItemActions({ onRename, onDelete, onMove }: any) {
  return (
    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <ActionBtn onClick={onMove} title="Переместить"><Move className="h-3.5 w-3.5" /></ActionBtn>
      <ActionBtn onClick={onRename} title="Переименовать"><Pencil className="h-3.5 w-3.5" /></ActionBtn>
      <ActionBtn onClick={onDelete} title="Удалить" danger><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
    </div>
  );
}

function ActionBtn({ children, onClick, title, danger }: any) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`h-7 w-7 rounded-lg flex items-center justify-center backdrop-blur-md transition-colors ${
        danger ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/40" : "bg-black/40 text-white/80 hover:bg-violet-500/40"
      }`}
    >
      {children}
    </button>
  );
}

function MoveModal({ itemId, currentParent, onClose, onMove }: { itemId: number; currentParent: number | null; onClose: () => void; onMove: (id: number | null) => void }) {
  const [parentId, setParentId] = useState<number | null>(null);
  const [items, setItems] = useState<FileItem[]>([]);

  useEffect(() => {
    setItems(listFiles(parentId).filter((f) => f.type === "folder" && f.id !== itemId));
  }, [parentId, itemId]);

  const path = getFolderPath(parentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong rounded-2xl p-5 w-[500px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Переместить в...</h3>
        <div className="flex items-center gap-1 text-xs flex-wrap mb-3">
          <button onClick={() => setParentId(null)} className="rounded px-2 py-1 hover:bg-violet-500/20 text-violet-200/80">Корень</button>
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-violet-300/40" />
              <button onClick={() => setParentId(p.id)} className="rounded px-2 py-1 hover:bg-violet-500/20 text-violet-200/80">{p.name}</button>
            </span>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl bg-[#0a0c20]/40 border border-violet-400/10 p-2">
          {items.length === 0 ? (
            <p className="text-xs text-violet-200/40 text-center py-4">Нет вложенных папок</p>
          ) : (
            items.map((f) => (
              <button key={f.id} onClick={() => setParentId(f.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-violet-500/10">
                <Folder className="h-4 w-4 text-amber-300" />
                {f.name}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg glass px-4 py-2 text-sm">Отмена</button>
          <button onClick={() => onMove(parentId)} className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold">
            Переместить сюда
          </button>
        </div>
      </div>
    </div>
  );
}
