import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Grid, type GridChange, type GridProps } from "./Grid";
import { placeFree } from "./free";
import { resolveLayout, type Compaction, type GridItem, type Layout } from "./layout";

/** Minimum container width (px) per breakpoint name. */
export type Breakpoints = Readonly<Record<string, number>>;

export const DEFAULT_BREAKPOINTS: Breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

export const DEFAULT_COLS: Readonly<Record<string, number>> = { lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 };

const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

const descending = (breakpoints: Breakpoints) => Object.keys(breakpoints).sort((a, b) => breakpoints[b]! - breakpoints[a]!);

/** The largest breakpoint whose minimum width is at most `width` (the smallest one if none fits). */
export function getBreakpoint(breakpoints: Breakpoints, width: number): string {
  const names = descending(breakpoints);
  return names.find((name) => width >= breakpoints[name]!) ?? names.at(-1)!;
}

export interface LayoutForBreakpointOptions {
  breakpoints?: Breakpoints;
  cols?: Readonly<Record<string, number>>;
  compaction?: Compaction;
  allowOverlap?: boolean;
}

/**
 * The layout for `breakpoint`: the stored one if there is one, otherwise derived from the nearest breakpoint that has
 * a layout (larger ones first), with columns scaled to the new column count.
 */
export function layoutForBreakpoint(layouts: Readonly<Partial<Record<string, Layout>>>, breakpoint: string, options: LayoutForBreakpointOptions = {}): Layout {
  const { breakpoints = DEFAULT_BREAKPOINTS, cols = DEFAULT_COLS, compaction = "vertical", allowOverlap = false } = options;
  const own = layouts[breakpoint];
  if (own) return own;
  const names = descending(breakpoints);
  const index = names.indexOf(breakpoint);
  const candidates = [...names.slice(0, Math.max(0, index)).reverse(), ...names.slice(index + 1)];
  const source = candidates.find((name) => layouts[name]);
  if (!source) return [];
  const to = cols[breakpoint] ?? 24;
  const scale = to / (cols[source] ?? 24);
  const scaled = layouts[source]!.map((item) =>
    scale === 1 ? item : { ...item, x: Math.round(item.x * scale), w: Math.max(1, Math.round(item.w * scale)) },
  );
  return allowOverlap ? placeFree(scaled, to) : resolveLayout(scaled, { cols: to, compaction });
}

export interface ResponsiveChange extends GridChange {
  breakpoint: string;
}

export interface ResponsiveGridProps extends Omit<GridProps, "layout" | "onLayoutChange" | "cols"> {
  /** Layouts per breakpoint. Missing breakpoints are derived from the nearest one that has a layout. */
  layouts: Readonly<Partial<Record<string, Layout>>>;
  /** Called with all layouts, the one for the current breakpoint replaced. */
  onLayoutsChange: (layouts: Record<string, GridItem[]>, change: ResponsiveChange) => void;
  /** Minimum container width per breakpoint. Default `DEFAULT_BREAKPOINTS`. */
  breakpoints?: Breakpoints;
  /** Columns per breakpoint. Default `DEFAULT_COLS`. */
  cols?: Readonly<Record<string, number>>;
  /** Breakpoint used before the width is known (server rendering). Default: the largest one. */
  defaultBreakpoint?: string;
  onBreakpointChange?: (breakpoint: string, cols: number) => void;
}

function assignRef<T>(ref: GridProps["rootRef"], value: T | null): void {
  if (typeof ref === "function") ref(value as HTMLDivElement | null);
  else if (ref) (ref as { current: T | null }).current = value;
}

/** A `<Grid>` that switches columns and layouts with the width of its container. */
export function ResponsiveGrid({
  layouts,
  onLayoutsChange,
  breakpoints = DEFAULT_BREAKPOINTS,
  cols = DEFAULT_COLS,
  defaultBreakpoint,
  onBreakpointChange,
  rootRef,
  compaction = "vertical",
  allowOverlap,
  ...props
}: ResponsiveGridProps) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback(
    (next: HTMLDivElement | null) => {
      setNode(next);
      assignRef(rootRef, next);
    },
    [rootRef],
  );

  useIsomorphicLayoutEffect(() => {
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const breakpoint = width == null ? (defaultBreakpoint ?? descending(breakpoints)[0]!) : getBreakpoint(breakpoints, width);
  const columns = cols[breakpoint] ?? 24;
  // Keyed by content, so inline `breakpoints` and `cols` objects do not derive a new layout on every render.
  const shape = JSON.stringify([breakpoints, cols]);
  const layout = useMemo(
    () => {
      const [breakpoints, cols] = JSON.parse(shape) as [Breakpoints, Record<string, number>];
      return layoutForBreakpoint(layouts, breakpoint, { breakpoints, cols, compaction, allowOverlap });
    },
    [layouts, breakpoint, shape, compaction, allowOverlap],
  );

  const reported = useRef(breakpoint);
  useEffect(() => {
    if (reported.current === breakpoint) return;
    reported.current = breakpoint;
    onBreakpointChange?.(breakpoint, columns);
  });

  const latest = useRef({ layouts, onLayoutsChange, breakpoint });
  useIsomorphicLayoutEffect(() => {
    latest.current = { layouts, onLayoutsChange, breakpoint };
  });
  const onLayoutChange = useCallback((next: GridItem[], change: GridChange) => {
    const { layouts, onLayoutsChange, breakpoint } = latest.current;
    onLayoutsChange({ ...(layouts as Record<string, GridItem[]>), [breakpoint]: next }, { ...change, breakpoint });
  }, []);

  return (
    <Grid
      {...props}
      rootRef={ref}
      layout={layout}
      onLayoutChange={onLayoutChange}
      cols={columns}
      compaction={compaction}
      allowOverlap={allowOverlap}
    />
  );
}
