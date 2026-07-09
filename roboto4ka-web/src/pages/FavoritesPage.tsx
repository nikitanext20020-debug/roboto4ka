import { useEffect, useState } from "react";
import { Star, Trash2, ImageIcon, Video } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { listFavorites, removeFavorite, type Favorite } from "../lib/autosave";
import { useAppState } from "../lib/appState";

export default function FavoritesPage({
  onBack,
  onOpenInEditor,
}: {
  onBack: () => void;
  onOpenInEditor: (page: "media" | "video") => void;
}) {
  const { setPendingOpen } = useAppState();
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => { setFavs(listFavorites()); }, [version]);

  const onOpen = (f: Favorite) => {
    if (!f.data) {
      alert("У этого избранного нет данных для открытия (только превью).");
      return;
    }
    setPendingOpen({ source: f.source, name: f.name, data: f.data });
    onOpenInEditor(f.source === "photo" ? "media" : "video");
  };

  const onRemove = (id: number) => {
    if (!confirm("Удалить из избранного?")) return;
    removeFavorite(id);
    setVersion((v) => v + 1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Избранное"
        subtitle="Любимые фото и видео для быстрого доступа"
        onBack={onBack}
      />

      {favs.length === 0 ? (
        <div className="rounded-3xl glass p-12 flex flex-col items-center text-violet-200/40">
          <div className="h-14 w-14 rounded-2xl bg-yellow-500/10 border border-yellow-400/20 flex items-center justify-center mb-3">
            <Star className="h-6 w-6 text-yellow-300/60" />
          </div>
          <p className="text-sm text-center">
            Пока пусто. Жми на ⭐ в редакторе фото или видео,<br />
            чтобы добавить файл сюда.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {favs.map((f) => {
            const Icon = f.source === "photo" ? ImageIcon : Video;
            return (
              <div
                key={f.id}
                onClick={() => onOpen(f)}
                className="group relative rounded-2xl glass overflow-hidden hover:border-yellow-400/40 transition-all cursor-pointer"
              >
                <div className="aspect-video bg-[#0a0c20]/60 flex items-center justify-center overflow-hidden">
                  {f.preview ? (
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-10 w-10 text-violet-300/60" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm text-white truncate">{f.name}</p>
                  <p className="text-[11px] text-violet-200/45 mt-0.5">
                    {f.source === "photo" ? "Фото" : "Видео"} · {new Date(f.addedAt).toLocaleDateString("ru")}
                  </p>
                </div>
                <div className="absolute top-2 left-2 h-7 w-7 rounded-lg flex items-center justify-center bg-yellow-500/30 text-yellow-200 backdrop-blur-md">
                  <Star className="h-3.5 w-3.5 fill-current" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(f.id); }}
                  className="absolute top-2 right-2 h-7 w-7 rounded-lg flex items-center justify-center bg-rose-500/20 text-rose-200 backdrop-blur-md hover:bg-rose-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
