import { useEffect, useState } from "react";
import { Search, FileText, PenSquare } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import FeatureCard from "./components/FeatureCard";
import QuickAccess from "./components/QuickAccess";
import RecentFiles from "./components/RecentFiles";
import Quote from "./components/Quote";
import SystemStatus from "./components/SystemStatus";
import SearchPage from "./pages/SearchPage";
import TextPage from "./pages/TextPage";
import MediaPage from "./pages/MediaPage";
import ConvertPage from "./pages/ConvertPage";
import VideoPage from "./pages/VideoPage";
import FilesPage from "./pages/FilesPage";
import FavoritesPage from "./pages/FavoritesPage";
import HistoryPage from "./pages/HistoryPage";
import ComparePage from "./pages/ComparePage";
import { onOpenFile, readFileFromDisk, pageForFile } from "./lib/electron";
import { useAppState } from "./lib/appState";
import { registerHotkey } from "./lib/hotkeys";

export default function App() {
  const [active, setActive] = useState("home");
  const { setPendingOpen } = useAppState();

  // Горячие клавиши
  useEffect(() => {
    registerHotkey("ctrl+1", () => setActive("search"));
    registerHotkey("ctrl+2", () => setActive("text"));
    registerHotkey("ctrl+3", () => setActive("media"));
    registerHotkey("ctrl+4", () => setActive("video"));
    registerHotkey("ctrl+5", () => setActive("convert"));
    registerHotkey("ctrl+6", () => setActive("compare"));
    registerHotkey("ctrl+k", () => {
      setActive("home");
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Быстрый поиск"]');
        input?.focus();
      }, 100);
    });
  }, []);

  // Открытие файла из Windows (контекстное меню "Открыть с Roboto4ka")
  useEffect(() => {
    onOpenFile(async (filePath) => {
      const file = await readFileFromDisk(filePath);
      if (!file) return;
      const target = pageForFile(file.name);
      if (!target) return;

      // Конвертим в dataURL для pendingOpen (только для фото)
      if (target === "media") {
        const reader = new FileReader();
        reader.onload = () => {
          setPendingOpen({
            source: "photo",
            name: file.name,
            data: reader.result as string,
          });
          setActive("media");
        };
        reader.readAsDataURL(file);
      } else {
        // для video/search/text — подгружать вручную пока что
        setActive(target);
      }
    });
  }, [setPendingOpen]);

  // Страницы без постоянного монтирования (не хранят файлы Excel)
  const renderOther = () => {
    switch (active) {
      case "text":    return <TextPage onBack={() => setActive("home")} />;
      case "media":   return <MediaPage onBack={() => setActive("home")} />;
      case "video":   return <VideoPage onBack={() => setActive("home")} />;
      case "convert": return <ConvertPage onBack={() => setActive("home")} />;
      case "files":   return <FilesPage onBack={() => setActive("home")} onOpenInEditor={(p) => setActive(p)} />;
      case "fav":     return <FavoritesPage onBack={() => setActive("home")} onOpenInEditor={(p) => setActive(p)} />;
      case "history": return <HistoryPage onBack={() => setActive("home")} />;
      default:        return <Home onSelect={setActive} />;
    }
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 bg-[#040618]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(70%_60%_at_15%_15%,rgba(59,130,246,0.18),transparent_60%)]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(60%_55%_at_85%_25%,rgba(139,92,246,0.22),transparent_60%)]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(80%_70%_at_50%_100%,rgba(76,29,149,0.25),transparent_70%)]" />

      <div
        className="fixed inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="fixed top-1/3 left-1/2 -z-10 h-72 w-72 rounded-full bg-violet-600/15 blur-3xl animate-float-slow" />
      <div className="fixed bottom-20 right-20 -z-10 h-80 w-80 rounded-full bg-indigo-600/15 blur-3xl animate-float-slower" />

      <div className="flex min-h-screen">
        <Sidebar active={active} onSelect={setActive} />

        <main className="flex-1 min-w-0 px-6 md:px-10 py-7 md:py-9">
          <div className="max-w-[1280px] mx-auto">
            {/* SearchPage и ComparePage всегда в DOM — файлы Excel не теряются при переключении */}
            <div style={{ display: active === "search" ? "block" : "none" }}>
              <SearchPage onBack={() => setActive("home")} />
            </div>
            <div style={{ display: active === "compare" ? "block" : "none" }}>
              <ComparePage onBack={() => setActive("home")} />
            </div>
            {/* Остальные — монтируются по требованию */}
            {active !== "search" && active !== "compare" && renderOther()}
          </div>
        </main>
      </div>
    </div>
  );
}

function Home({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <>
      <Topbar />

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <FeatureCard
          index="01"
          title="Поиск по базе"
          description="Мгновенный поиск по вашей базе данных и документам"
          variant="blue"
          icon={<Search className="h-7 w-7 text-blue-200" strokeWidth={1.6} />}
          onClick={() => onSelect("search")}
        />
        <FeatureCard
          index="02"
          title="Анализ текста"
          description="Анализ, выделение ключевых мыслей и перевод текста"
          variant="indigo"
          icon={<FileText className="h-7 w-7 text-indigo-200" strokeWidth={1.6} />}
          onClick={() => onSelect("text")}
        />
        <FeatureCard
          index="03"
          title="Редактор фото и видео"
          description="Редактируйте фото и видео как профессионал"
          variant="violet"
          icon={<PenSquare className="h-7 w-7 text-violet-100" strokeWidth={1.6} />}
          onClick={() => onSelect("media")}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-5">
        <QuickAccess onSelect={onSelect} />
        <RecentFiles />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-5 pb-8">
        <Quote />
        <SystemStatus />
      </section>
    </>
  );
}
