import { clampItem, resolveLayout, type GridItem, type Layout, type LayoutOptions } from "./layout";

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  return value;
}

export function rowsForContent(height: number, rowHeight: number, gap = 12): number {
  positive(rowHeight, "rowHeight");
  if (!Number.isFinite(height) || height < 0 || !Number.isFinite(gap) || gap < 0) throw new RangeError("height and gap must be finite and non-negative");
  return Math.max(1, Math.ceil((height + gap) / (rowHeight + gap)));
}

export function rowsForAspectRatio(width: number, ratio: number, rowHeight: number, gap = 12): number {
  return rowsForContent(positive(width, "width") / positive(ratio, "ratio"), rowHeight, gap);
}

export function resizeItems(layout: Layout, ids: readonly string[], size: Pick<GridItem, "w" | "h">, options: LayoutOptions): GridItem[] {
  positive(size.w, "width");
  positive(size.h, "height");
  const selected = new Set(ids);
  return resolveLayout(layout.map(item => selected.has(item.id) && !item.static && item.resizable !== false ? clampItem({ ...item, ...size }, options.cols) : { ...item }), options);
}
