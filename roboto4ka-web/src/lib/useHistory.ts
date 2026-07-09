// Хук для undo/redo. Хранит стек состояний.

import { useCallback, useRef, useState } from "react";

export type HistoryState<T> = {
  current: T;
  canUndo: boolean;
  canRedo: boolean;
  set: (value: T) => void;       // Записать новое состояние (добавляет в стек)
  replace: (value: T) => void;   // Заменить текущее без записи в стек (для промежуточных)
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;     // Сбросить всю историю
};

export function useHistory<T>(initial: T, maxSize: number = 50): HistoryState<T> {
  const [current, setCurrent] = useState<T>(initial);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);

  const set = useCallback((value: T) => {
    setCurrent((prev) => {
      undoStack.current.push(prev);
      if (undoStack.current.length > maxSize) undoStack.current.shift();
      redoStack.current = [];
      return value;
    });
  }, [maxSize]);

  const replace = useCallback((value: T) => {
    setCurrent(value);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    setCurrent((prev) => {
      redoStack.current.push(prev);
      return undoStack.current.pop()!;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    setCurrent((prev) => {
      undoStack.current.push(prev);
      return redoStack.current.pop()!;
    });
  }, []);

  const reset = useCallback((value: T) => {
    undoStack.current = [];
    redoStack.current = [];
    setCurrent(value);
  }, []);

  return {
    current,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    set,
    replace,
    undo,
    redo,
    reset,
  };
}
