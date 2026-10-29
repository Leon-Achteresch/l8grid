import { clampItem, type GridItem, type Layout, type Rect } from "./layout";

const columns = (cols: number) => Math.max(1, Math.round(cols)) || 1;

// Layout rules for `allowOverlap`: items are only sanitized and clamped, never pushed or compacted.
export function placeFree(layout: Layout, cols: number): GridItem[] {
  const items = layout.map((item) => clampItem(item, columns(cols)));
  let bottom = 0;
  for (const item of items) if (item.y !== Infinity) bottom = Math.max(bottom, item.y + item.h);
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.y !== Infinity) continue;
    items[i] = { ...item, y: bottom };
    bottom += item.h;
  }
  return items;
}

export function setFree(layout: Layout, target: GridItem, cols: number): GridItem[] {
  const placed = clampItem(target, columns(cols));
  return layout.map((item) => (item.id === target.id ? placed : item));
}

export function nudgeFree(layout: Layout, id: string, delta: Partial<Rect>, cols: number): GridItem[] | undefined {
  const item = layout.find((candidate) => candidate.id === id);
  if (!item || item.static) return;
  const { x = 0, y = 0, w = 0, h = 0 } = delta;
  const next = clampItem({ ...item, x: item.x + x, y: Math.max(0, item.y + y), w: item.w + w, h: item.h + h }, columns(cols));
  if (next.x === item.x && next.y === item.y && next.w === item.w && next.h === item.h) return;
  if ((w || h) && (next.x !== item.x + x || next.y !== item.y + y)) return;
  return layout.map((other) => (other === item ? next : other));
}
