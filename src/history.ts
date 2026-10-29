import { useCallback, useMemo, useReducer } from "react";
import type { GridItem } from "./layout";

export interface LayoutHistory<T> {
  layout: T;
  /** Records a new state; pass it as `onLayoutChange` (or `onLayoutsChange`). */
  onLayoutChange: (layout: T) => void;
  undo: () => void;
  redo: () => void;
  /** Replaces the state and clears the history. */
  reset: (layout: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface State<T> {
  past: T[];
  present: T;
  future: T[];
}

type Action<T> = { type: "push"; value: T; limit: number } | { type: "undo" } | { type: "redo" } | { type: "reset"; value: T };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "push":
      if (Object.is(action.value, state.present)) return state;
      return { past: [...state.past, state.present].slice(-action.limit), present: action.value, future: [] };
    case "undo":
      if (!state.past.length) return state;
      return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
    case "redo":
      if (!state.future.length) return state;
      return { past: [...state.past, state.present], present: state.future[0]!, future: state.future.slice(1) };
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

/** Undo/redo for a controlled layout (or the `layouts` of a `ResponsiveGrid`). Keeps up to `limit` steps (default 100). */
export function useLayoutHistory<T = GridItem[]>(initial: T | (() => T), { limit = 100 }: { limit?: number } = {}): LayoutHistory<T> {
  const [state, dispatch] = useReducer(reducer<T>, initial, (value): State<T> => ({
    past: [],
    present: typeof value === "function" ? (value as () => T)() : value,
    future: [],
  }));
  const onLayoutChange = useCallback((value: T) => dispatch({ type: "push", value, limit }), [limit]);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  return useMemo(
    () => ({ layout: state.present, onLayoutChange, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }),
    [state, onLayoutChange, undo, redo, reset],
  );
}
