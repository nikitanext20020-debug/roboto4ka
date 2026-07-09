// Глобальные горячие клавиши приложения.

export type HotkeyHandler = (e: KeyboardEvent) => void;

const handlers: Map<string, HotkeyHandler> = new Map();

function keyId(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(e.key.toLowerCase());
  return parts.join("+");
}

function globalHandler(e: KeyboardEvent) {
  // Не перехватываем если фокус в input/textarea/contentEditable
  const ae = document.activeElement as HTMLElement | null;
  if (ae && (
    ae.tagName === "INPUT" ||
    ae.tagName === "TEXTAREA" ||
    ae.isContentEditable
  )) return;

  const id = keyId(e);
  const handler = handlers.get(id);
  if (handler) {
    e.preventDefault();
    handler(e);
  }
}

let listening = false;

export function registerHotkey(combo: string, handler: HotkeyHandler) {
  // combo: "ctrl+k", "ctrl+1", "ctrl+shift+s"
  handlers.set(combo.toLowerCase(), handler);
  if (!listening) {
    window.addEventListener("keydown", globalHandler);
    listening = true;
  }
}

export function unregisterHotkey(combo: string) {
  handlers.delete(combo.toLowerCase());
}

export function unregisterAll() {
  handlers.clear();
}
