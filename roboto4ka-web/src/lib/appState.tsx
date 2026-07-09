import { createContext, useContext, useState, type ReactNode } from "react";
import type { IndexedRecord, SearchHit } from "./search";
import type { TextGearsError } from "./textgears";
import type { SpellMistake } from "./spell";

// ===== Search page =====
export type SearchState = {
  db: IndexedRecord[];
  dbName: string;
  fio: string;
  phone: string;
  batch: string;
  hits: SearchHit[];
  notFound: string[];
};

const emptySearch: SearchState = {
  db: [], dbName: "", fio: "", phone: "", batch: "", hits: [], notFound: [],
};

// ===== Text page =====
export type TextState = {
  text: string;
  mistakes: (SpellMistake | TextGearsError | any)[] | null;
};

const emptyText: TextState = { text: "", mistakes: null };

// ===== Convert page =====
export type ConvertFileState = {
  id: number;
  fileName: string;
  fileSize: number;
  ext: string;
  target: string;
  status: "pending" | "uploading" | "processing" | "downloading" | "done" | "error";
  outputName?: string;
  outputSize?: number;
  error?: string;
  // file и outputBlob не сохраняем в context — только метаданные
};

export type ConvertState = {
  files: ConvertFileState[];
};

const emptyConvert: ConvertState = { files: [] };

// ===== Pending file open (передача файла из Files в редактор) =====
export type PendingOpen = {
  source: "photo" | "video";
  name: string;
  data: string; // dataURL
} | null;

// ===== Context =====
type AppState = {
  search: SearchState;
  setSearch: (s: SearchState | ((prev: SearchState) => SearchState)) => void;
  text: TextState;
  setText: (s: TextState | ((prev: TextState) => TextState)) => void;
  convert: ConvertState;
  setConvert: (s: ConvertState | ((prev: ConvertState) => ConvertState)) => void;
  pendingOpen: PendingOpen;
  setPendingOpen: (p: PendingOpen) => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<SearchState>(emptySearch);
  const [text, setText] = useState<TextState>(emptyText);
  const [convert, setConvert] = useState<ConvertState>(emptyConvert);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen>(null);

  return (
    <AppStateContext.Provider value={{
      search, setSearch, text, setText, convert, setConvert,
      pendingOpen, setPendingOpen,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState вне AppStateProvider");
  return ctx;
}
