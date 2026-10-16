export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItem extends Rect {
  id: string;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
  draggable?: boolean;
  resizable?: boolean;
}

export type Layout = readonly GridItem[];

export type Compaction = "vertical" | "none";

export interface LayoutOptions {
  cols: number;
  compaction: Compaction;
}

class Occupancy {
  constructor(
    private readonly cols: number,
    private rows = 32,
    private cells = new Uint8Array(cols * rows),
  ) {}

  clone(): Occupancy {
    return new Occupancy(this.cols, this.rows, this.cells.slice());
  }

  fits(x: number, y: number, w: number, h: number): boolean {
    const { cells } = this;
    const end = Math.min(y + h, this.rows);
    for (let r = y; r < end; r++) {
      const base = r * this.cols + x;
      for (let c = base; c < base + w; c++) if (cells[c]) return false;
    }
    return true;
  }

  fill({ x, y, w, h }: Rect): void {
    this.grow(y + h);
    const { cells } = this;
    for (let r = y; r < y + h; r++) {
      const base = r * this.cols + x;
      for (let c = base; c < base + w; c++) cells[c] = 1;
    }
  }

  private grow(rows: number): void {
    if (rows <= this.rows) return;
    let next = this.rows;
    while (next < rows) next *= 2;
    const cells = new Uint8Array(this.cols * next);
    cells.set(this.cells);
    this.cells = cells;
    this.rows = next;
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const byPosition = (a: Rect, b: Rect) => a.y - b.y || a.x - b.x;

const round = (value: number, fallback: number) => (isFinite(value) ? Math.round(value) : fallback);

const MAX_ROWS = 2 ** 16;

const bound = (value: number | undefined, fallback: number) => (value != null && isFinite(value) ? Math.max(1, Math.round(value)) : fallback);

export function clampItem(item: GridItem, cols: number): GridItem {
  const w = clamp(round(item.w, 1), Math.min(bound(item.minW, 1), cols), Math.min(cols, bound(item.maxW, cols)));
  const h = clamp(round(item.h, 1), Math.min(bound(item.minH, 1), MAX_ROWS), Math.min(MAX_ROWS, bound(item.maxH, MAX_ROWS)));
  const x = clamp(round(item.x, 0), 0, cols - w);
  const y = item.y != null && isFinite(item.y) ? clamp(Math.round(item.y), 0, MAX_ROWS) : Infinity;
  return x === item.x && y === item.y && w === item.w && h === item.h ? item : { ...item, x, y, w, h };
}

const withY = (item: GridItem, y: number): GridItem => (item.y === y ? item : { ...item, y });

const atBottom = (item: GridItem, bottom: number) => (item.y === Infinity ? { ...item, y: bottom } : item);

function fitDown(occupancy: Occupancy, item: GridItem, from: number): number {
  let y = from;
  while (!occupancy.fits(item.x, y, item.w, item.h)) y++;
  return y;
}

function fitUp(occupancy: Occupancy, item: GridItem, from: number): number {
  for (let y = from; y >= 0; y--) if (occupancy.fits(item.x, y, item.w, item.h)) return y;
  return -1;
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function fitWithin(occupancy: Occupancy, item: GridItem, area: Rect, cols: number, layout: Layout): GridItem | undefined {
  const lastX = Math.min(area.x + Math.max(0, area.w - item.w), cols - item.w);
  const lastY = area.y + Math.max(0, area.h - item.h);
  if (item.w > area.w) {
    const first = clamp(area.x + area.w - item.w, 0, cols - item.w);
    const xs = Array.from({ length: lastX - first + 1 }, (_, i) => first + i).sort((a, b) => Math.abs(a - item.x) - Math.abs(b - item.x));
    const clear = (slot: Rect) => !layout.some((other) => other !== item && other !== area && intersects(other, slot));
    for (let y = area.y; y <= lastY; y++)
      for (const x of xs) {
        const slot = { ...item, x, y };
        if (occupancy.fits(x, y, item.w, item.h) && clear(slot)) return slot;
      }
  }
  for (let y = area.y; y <= lastY; y++)
    for (let x = Math.min(area.x, cols - item.w); x <= lastX; x++)
      if (occupancy.fits(x, y, item.w, item.h)) return { ...item, x, y };
}

function findSlot(occupancy: Occupancy, item: GridItem, anchor: GridItem | undefined, origin: GridItem | undefined, cols: number, layout: Layout): GridItem {
  if (occupancy.fits(item.x, item.y, item.w, item.h)) return item;
  if (anchor && origin && intersects(anchor, item)) {
    const slot = fitWithin(occupancy, item, origin, cols, layout);
    if (slot) return slot;
    if (origin.y * 2 + origin.h < item.y * 2 + item.h) {
      const up = fitUp(occupancy, item, Math.min(item.y, anchor.y - item.h));
      if (up >= 0) return withY(item, up);
    }
  }
  return withY(item, fitDown(occupancy, item, item.y));
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const columns = (cols: number) => Math.max(1, Math.round(cols)) || 1;

const sortIndices = (order: number[], layout: Layout) => order.sort((a, b) => byPosition(layout[a]!, layout[b]!));

function compact(layout: GridItem[], cols: number, order: number[]): GridItem[] {
  const occupancy = new Occupancy(cols, layoutBottom(layout) + 1);
  let bottom = 0;
  for (const item of layout)
    if (item.static) {
      occupancy.fill(item);
      bottom = Math.max(bottom, item.y + item.h);
    }
  for (const i of sortIndices(order, layout)) {
    const item = layout[i]!;
    let y = Math.min(item.y, bottom);
    while (y > 0 && occupancy.fits(item.x, y - 1, item.w, 1)) y--;
    occupancy.fill((layout[i] = withY(item, y)));
    bottom = Math.max(bottom, y + item.h);
  }
  return layout;
}

function resolver(layout: Layout, options: LayoutOptions, id?: string): (active?: GridItem) => GridItem[] {
  const cols = columns(options.cols);
  const items = layout.map((item) => clampItem(item, cols));
  let bottom = 0;
  for (const item of items) if (item.y !== Infinity) bottom = Math.max(bottom, item.y + item.h);
  const statics = new Occupancy(cols, bottom + 1);
  const base: GridItem[] = [];
  const actives: number[] = [];
  const order: number[] = [];
  let origin: GridItem | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = (items[i] = atBottom(items[i]!, bottom));
    if (item.id === id && !origin) {
      origin = item;
      actives.push(i);
    } else if (item.static) statics.fill((base[i] = withY(item, fitDown(statics, item, item.y))));
    else order.push(i);
  }
  sortIndices(order, items);

  return (active) => {
    const occupancy = statics.clone();
    const placed = base.slice();
    let anchor: GridItem | undefined;
    if (active) {
      const item = atBottom(clampItem(active, cols), bottom);
      anchor = withY(item, fitDown(occupancy, item, item.y));
      occupancy.fill(anchor);
      for (const i of actives) placed[i] = anchor;
    }
    for (const i of order) occupancy.fill((placed[i] = findSlot(occupancy, items[i]!, anchor, origin, cols, items)));
    const result = options.compaction === "vertical" ? compact(placed, cols, order.concat(actives.filter((i) => !placed[i]!.static))) : placed;
    for (let i = 0; i < result.length; i++) if (sameRect(result[i]!, layout[i]!)) result[i] = layout[i]!;
    return result;
  };
}

export function compactVertical(layout: Layout, cols: number): GridItem[] {
  return resolveLayout(layout, { cols, compaction: "vertical" });
}

export function resolveLayout(layout: Layout, options: LayoutOptions, active?: GridItem): GridItem[] {
  return resolver(layout, options, active?.id)(active);
}

export function moveItem(layout: Layout, id: string, target: Partial<Rect>, options: LayoutOptions): GridItem[] {
  const item = layout.find((candidate) => candidate.id === id);
  if (!item) return [...layout];
  return resolveLayout(layout, options, { ...item, ...target });
}

const SPRING = 5;
const REACH = 0.75;
const LEAVE = 0.5;
const BAND = 0.25;
const HOLD = 0.1;
const STRIDE = 0.5;
const MAX_CACHED = 256;

interface Entry {
  layout: GridItem[];
  x: number;
  y: number;
  at: GridItem;
  cost: number;
  free: boolean;
  holes: number;
  pushes: boolean;
  shifts: boolean;
}

function holes(layout: Layout, cols: number): number {
  const bottom = new Float64Array(cols);
  let empty = 0;
  for (const { x, y, w, h } of layout) {
    empty -= w * h;
    for (let c = x; c < x + w; c++) bottom[c] = Math.max(bottom[c]!, y + h);
  }
  for (const value of bottom) empty += value;
  return empty;
}

export function dragItem(layout: GridItem[], id: string, options: LayoutOptions, sticky = true): (x: number, y: number) => GridItem[] {
  const start = layout.find((candidate) => candidate.id === id);
  if (!start || start.static) return () => layout;
  const cols = columns(options.cols);
  const { w, h } = start;
  const compacting = options.compaction === "vertical";
  let base = layout;
  let item = start;
  let resolve = resolver(layout, options, id);
  let others = layout.filter((other) => other !== item);
  let occupancy = new Occupancy(cols);
  for (const other of others) occupancy.fill(other);
  const cache = new Map<number, Entry>();
  let last: Entry | undefined;
  let lastPast = false;

  const rebase = (next: GridItem[]) => {
    base = sameLayout(next, layout) ? layout : next;
    item = base.find((candidate) => candidate.id === id)!;
    resolve = resolver(base, options, id);
    others = base.filter((other) => other !== item);
    occupancy = new Occupancy(cols);
    for (const other of others) occupancy.fill(other);
    cache.clear();
  };

  const evaluate = (x: number, y: number) => {
    const key = y * cols + x;
    let entry = cache.get(key);
    if (entry) {
      cache.delete(key);
      cache.set(key, entry);
      return entry;
    }
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    let next = x === item.x && y === item.y ? base : resolve({ ...item, x, y });
    let at = item;
    let cost = 0;
    let pushes = false;
    let shifts = false;
    let same = true;
    for (let i = 0; i < next.length; i++) {
      const before = base[i]!;
      const after = next[i]!;
      same &&= before.x === after.x && before.y === after.y;
      if (before === item) at = after;
      else {
        cost += before.h * Math.abs(after.x - before.x) + before.w * Math.max(0, after.y - before.y);
        pushes ||= after.y > before.y && (!intersects(after, item) || after.y + after.h > item.y + item.h);
        shifts ||= after.x !== before.x;
      }
    }
    if (same) next = base;
    entry = { layout: next, x, y, at, cost, free: occupancy.fits(x, y, w, h), holes: compacting ? holes(next, cols) : 0, pushes, shifts };
    cache.set(key, entry);
    return entry;
  };

  const select = (px: number, fy: number) => {
    const fx = clamp(px, 0, cols - w);
    const edge = px <= 0 ? 0 : px >= cols - w ? cols - w : item.x;
    const top = fy <= 0 && item.y > 0 && Math.abs(fx - item.x) < w * LEAVE;
    const xs = new Set([Math.floor(fx), Math.ceil(fx)]);
    const ys = new Set([Math.floor(fy), Math.ceil(fy)]);
    const alignedX = new Set([item.x]);
    const alignedY = new Set([item.y]);
    const pastX = new Set<number>();
    const pastY = new Set<number>();
    alignedX.add(edge);
    if (top) alignedY.add(0);
    for (const other of others)
      if (other.x < fx + w && fx < other.x + other.w && other.y < fy + h && fy < other.y + other.h) {
        alignedX.add(other.x).add(other.x + other.w - w);
        alignedY.add(other.y).add(other.y + other.h - h);
        xs.add(other.x + other.w).add(other.x - w);
        ys.add(other.y + other.h).add(other.y - h);
        if (fx !== item.x) pastX.add(fx > item.x ? other.x + other.w : other.x - w);
        if (fy !== item.y) pastY.add(fy > item.y ? other.y + other.h : other.y - h);
      }
    for (const x of alignedX) xs.add(x);
    for (const y of alignedY) ys.add(y);
    for (const x of pastX) xs.add(x);
    for (const y of pastY) ys.add(y);

    const distance = ({ y, at, free }: Entry, slack: number) =>
      (Math.max(0, Math.abs(at.x - fx) - slack) / w) ** 2 + (Math.max(0, at.y - fy - slack, fy - (free ? Math.max(at.y, y) : at.y) - slack) / h) ** 2;
    const away = !!last && (last.at.x !== item.x || last.at.y !== item.y);
    const out = (size: number) => size * LEAVE + (away ? -BAND : base !== layout ? BAND : 0);
    const leaving = Math.abs(fx - item.x) > out(w) || Math.abs(fy - item.y) > out(h);
    const sideways = Math.abs(fy - item.y) < h * LEAVE - (last?.pushes ? BAND : 0);
    const close = (x: number, y: number, reach: number) => Math.abs(x - fx) <= w * reach && Math.abs(y - fy) <= h * reach;
    const near = ({ x, y, at }: Entry, reach: number) => close(x, y, reach) || close(at.x, at.y, reach);
    const valid = (entry: Entry) => {
      const { at } = entry;
      if (sideways && entry.pushes) return false;
      if (at.x === item.x && at.y === item.y) return !leaving;
      if (entry === last) return true;
      return Math.abs(at.x - fx) <= Math.abs(item.x - fx) && ((compacting && at.y <= item.y) || Math.abs(at.y - fy) <= Math.abs(item.y - fy));
    };
    let best: Entry | undefined;
    let min = Infinity;
    let flush = false;
    const consider = (entry: Entry) => {
      if (!valid(entry)) return;
      const edgewise = (sideways && edge !== item.x && entry.at.x === edge) || (top && entry.at.y === 0 && !entry.pushes);
      const value = entry.cost + SPRING * w * h * distance(entry, entry === last ? 2 * BAND : 0);
      if (flush && !edgewise) return;
      if (best && edgewise === flush && (value > min || (value === min && entry.holes >= best.holes))) return;
      best = entry;
      min = value;
      flush = edgewise;
    };
    consider(evaluate(item.x, item.y));
    for (const x of xs) {
      if (x < 0 || x > cols - w || (!pastX.has(x) && Math.abs(x - fx) > w * REACH)) continue;
      for (const y of ys) {
        if (y < 0 || (!pastY.has(y) && Math.abs(y - fy) > h * REACH)) continue;
        if (!((alignedX.has(x) || pastX.has(x)) && (alignedY.has(y) || pastY.has(y))) && !occupancy.fits(x, y, w, h)) continue;
        consider(evaluate(x, y));
      }
    }
    if (last && (lastPast || near(last, REACH + HOLD))) consider(last);
    if (!best && last && valid(last) && near(last, 1)) best = last;
    best ??= evaluate(item.x, item.y);
    if (sticky && best !== last) {
      lastPast = pastX.has(best.x) || pastY.has(best.y);
      last = best;
      if (sideways && best.shifts && best.at.y === item.y) {
        rebase(best.layout);
        last = best = evaluate(item.x, item.y);
        lastPast = false;
      }
    }
    return best;
  };

  let fromX = start.x;
  let fromY = start.y;
  const inRow = (y: number) => Math.abs(y - item.y) < h * LEAVE;
  return (px, py) => {
    if (sticky && inRow(fromY) && inRow(py)) {
      const from = clamp(fromX, 0, cols - w);
      const to = clamp(px, 0, cols - w);
      const steps = Math.ceil(Math.abs(to - from) / STRIDE);
      for (let i = 1; i < steps; i++) select(from + ((to - from) * i) / steps, fromY + ((py - fromY) * i) / steps);
    }
    fromX = px;
    fromY = py;
    return select(px, py).layout;
  };
}

export function nudgeItem(layout: Layout, id: string, delta: Partial<Rect>, options: LayoutOptions): GridItem[] | undefined {
  const current = resolveLayout(layout, options);
  const item = current.find((candidate) => candidate.id === id);
  if (!item || item.static) return;
  const { x = 0, y = 0, w = 0, h = 0 } = delta;
  if (w || h) {
    const target = { ...item, x: item.x + x, y: item.y + y, w: item.w + w, h: item.h + h };
    const next = resolveLayout(current, options, target);
    const resized = next.find((candidate) => candidate.id === id)!;
    if (resized.x !== target.x || resized.y !== target.y) return;
    return resized.w !== item.w || resized.h !== item.h ? next : undefined;
  }
  let limit = x ? Math.ceil((x < 0 ? item.x : options.cols - item.w - item.x) / Math.abs(x)) : 0;
  if (y < 0) limit = Math.max(limit, Math.ceil(item.y / -y));
  if (y > 0) {
    let reach = 1;
    for (const other of current)
      if (other !== item && other.x < item.x + item.w && item.x < other.x + other.w) reach = Math.max(reach, other.y + other.h - item.y);
    limit = Math.max(limit, Math.ceil(reach / y));
  }
  const drag = dragItem(current, id, options, false);
  for (let step = 0.5; step <= limit; step += 0.5) {
    const next = drag(item.x + x * step, item.y + y * step);
    const moved = next.find((candidate) => candidate.id === id)!;
    if ((moved.x - item.x) * x + (moved.y - item.y) * y > 0) return next;
  }
}

export function addItem(layout: Layout, item: Omit<GridItem, "x" | "y">, options: LayoutOptions): GridItem[] {
  const cols = columns(options.cols);
  const current = resolveLayout(layout, options);
  const occupancy = new Occupancy(cols);
  for (const other of current) occupancy.fill(other);
  const { w, h } = clampItem({ ...item, x: 0, y: 0 }, cols);
  for (let y = 0; ; y++) for (let x = 0; x + w <= cols; x++) if (occupancy.fits(x, y, w, h)) return [...current, { ...item, x, y, w, h }];
}

export function layoutBottom(layout: Layout): number {
  let bottom = 0;
  for (const item of layout) bottom = Math.max(bottom, item.y + item.h);
  return bottom;
}

export function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (p !== q && (p.id !== q.id || p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h)) return false;
  }
  return true;
}
