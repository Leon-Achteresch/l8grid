import { clampItem, dragItem, layoutBottom, nudgeItem, resolveLayout, sameLayout, type Compaction, type GridItem, type Layout } from "./layout";

export type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

export type ChangeKind = "move" | "resize";

export interface GridOptions {
  cols: number;
  rowHeight: number;
  gap: number;
  compaction: Compaction;
  handle: boolean;
  draggable: boolean;
  resizable: boolean;
}

interface Session {
  kind: ChangeKind;
  edge: string;
  state: "pending" | "active" | "done";
  item: GridItem;
  node: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  holdTimer: ReturnType<typeof setTimeout> | undefined;
  scroller: HTMLElement | null;
  origin: readonly [number, number, number] | undefined;
  view: DOMRect | undefined;
  inset: readonly [number, number];
  scrollArmed: boolean;
  lastScroll: number;
  minRows: number;
  floor: number;
  key: string;
  dirty: boolean;
  drag: ((x: number, y: number) => GridItem[]) | undefined;
  preview: GridItem[];
}

const DRAG_THRESHOLD = 4;
const TOUCH_HOLD_MS = 250;
const SCROLL_EDGE = 72;
const SCROLL_MAX_SPEED = 1.4;
const INTERACTIVE = "input, textarea, select, button, a[href], [contenteditable], [data-l8-nodrag]";
const EDGES = new Map<string, readonly [number, number]>([
  ["n", [0, -1]],
  ["e", [1, 0]],
  ["s", [0, 1]],
  ["w", [-1, 0]],
  ["ne", [1, -1]],
  ["nw", [-1, -1]],
  ["se", [1, 1]],
  ["sw", [-1, 1]],
]);
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const STYLES = `
.l8-grid{position:relative;box-sizing:content-box;--l8-handle:16px}
.l8-item{position:absolute;top:0;left:0;box-sizing:border-box;container-type:size;touch-action:manipulation;-webkit-touch-callout:none}
:where(.l8-grid:not([data-l8-handle-mode])>.l8-item:not([data-l8-static],[data-l8-nodrag])),:where(.l8-grid[data-l8-handle-mode]>.l8-item:not([data-l8-nodrag]) [data-l8-handle]){cursor:grab}
.l8-grid[data-l8-handle-mode] [data-l8-handle],.l8-grid [data-l8-resize]{touch-action:none}
.l8-grid[data-l8-animate] .l8-item,.l8-grid[data-l8-animate] .l8-placeholder{transition:transform .22s cubic-bezier(.2,.8,.2,1),width .22s cubic-bezier(.2,.8,.2,1),height .22s cubic-bezier(.2,.8,.2,1)}
.l8-grid .l8-item[data-l8-active]{transition:none;z-index:3;will-change:transform;-webkit-user-select:none;user-select:none}
:where(.l8-grid .l8-item[data-l8-active=move]){cursor:grabbing}
.l8-resize[data-l8-resize=n],.l8-resize[data-l8-resize=s],.l8-item[data-l8-edge=n],.l8-item[data-l8-edge=s]{cursor:ns-resize}
.l8-resize[data-l8-resize=e],.l8-resize[data-l8-resize=w],.l8-item[data-l8-edge=e],.l8-item[data-l8-edge=w]{cursor:ew-resize}
.l8-resize[data-l8-resize=ne],.l8-resize[data-l8-resize=sw],.l8-item[data-l8-edge=ne],.l8-item[data-l8-edge=sw]{cursor:nesw-resize}
.l8-resize[data-l8-resize=nw],.l8-resize[data-l8-resize=se],.l8-item[data-l8-edge=nw],.l8-item[data-l8-edge=se]{cursor:nwse-resize}
.l8-item[data-l8-settling]{z-index:2}
.l8-placeholder{position:absolute;top:0;left:0;box-sizing:border-box;pointer-events:none;display:none}
:where(.l8-placeholder){border-radius:6px;background:rgb(128 128 128/.18)}
.l8-placeholder[data-l8-visible]{display:block}
.l8-resize{position:absolute;width:var(--l8-handle);height:var(--l8-handle)}
.l8-resize:is([data-l8-resize=n],[data-l8-resize=s]){left:var(--l8-handle);right:var(--l8-handle);width:auto;height:calc(var(--l8-handle)/2)}
.l8-resize:is([data-l8-resize=e],[data-l8-resize=w]){top:var(--l8-handle);bottom:var(--l8-handle);width:calc(var(--l8-handle)/2);height:auto}
.l8-resize:is([data-l8-resize=n],[data-l8-resize=ne],[data-l8-resize=nw]){top:0}
.l8-resize:is([data-l8-resize=s],[data-l8-resize=se],[data-l8-resize=sw]){bottom:0}
.l8-resize:is([data-l8-resize=e],[data-l8-resize=ne],[data-l8-resize=se]){right:0}
.l8-resize:is([data-l8-resize=w],[data-l8-resize=nw],[data-l8-resize=sw]){left:0}
@media (pointer:coarse){.l8-grid{--l8-handle:28px}}
.l8-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.l8-grid .l8-item,.l8-grid .l8-placeholder{transition:none}}
`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

const px = (value: string) => parseFloat(value) || 0;

function injectStyles(doc: Document): void {
  if (doc.getElementById("l8grid-styles")) return;
  const style = doc.createElement("style");
  style.id = "l8grid-styles";
  style.textContent = STYLES;
  doc.head.prepend(style);
}

function swallowClick(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

export class GridController {
  private source: Layout = [];
  private layout: GridItem[] = [];
  private byId = new Map<string, GridItem>();
  private nodes = new Map<string, HTMLElement>();
  private painted = new WeakMap<HTMLElement, number[]>();
  private root: HTMLElement | null = null;
  private placeholder: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private width = 0;
  private padLeft = 0;
  private padTop = 0;
  private colWidth = NaN;
  private session: Session | null = null;
  private frameId = 0;
  private animateId = 0;
  private settleId = 0;
  private settling: (() => void) | null = null;

  constructor(
    private options: GridOptions,
    private readonly onCommit: (layout: GridItem[], id: string, kind: ChangeKind) => void,
  ) {}

  mount(root: HTMLElement, placeholder: HTMLElement): () => void {
    injectStyles(root.ownerDocument);
    this.root = root;
    this.placeholder = placeholder;
    this.measure();
    root.addEventListener("pointerdown", this.onPointerDown);
    root.addEventListener("keydown", this.onKeyDown);
    root.addEventListener("touchmove", this.onTouchMove, { passive: false });
    root.addEventListener("contextmenu", this.onContextMenu);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => {
        if (this.measure()) this.instant(() => this.repaint());
      });
      this.observer.observe(root);
    }
    this.syncHandleMode();
    this.instant(() => this.paint(this.layout));
    return () => this.unmount();
  }

  private unmount(): void {
    this.end(false);
    this.flush();
    this.observer?.disconnect();
    this.root?.removeEventListener("pointerdown", this.onPointerDown);
    this.root?.removeEventListener("keydown", this.onKeyDown);
    this.root?.removeEventListener("touchmove", this.onTouchMove);
    this.root?.removeEventListener("contextmenu", this.onContextMenu);
    cancelAnimationFrame(this.animateId);
    this.root = this.placeholder = this.observer = null;
  }

  setOptions(options: GridOptions): void {
    const relayout = options.cols !== this.options.cols || options.compaction !== this.options.compaction;
    this.options = options;
    this.syncHandleMode();
    if (relayout) this.apply(resolveLayout(this.source, options));
    else this.repaint();
  }

  setLayout(layout: Layout): void {
    if (layout === this.source) return;
    this.source = layout;
    this.apply(resolveLayout(layout, this.options));
  }

  register(id: string, node: HTMLElement): void {
    this.nodes.set(id, node);
    const item = this.byId.get(id);
    if (item && this.root) this.place(node, item);
  }

  unregister(id: string): void {
    this.nodes.delete(id);
  }

  private apply(next: GridItem[]): void {
    this.flush();
    const session = this.session;
    if (session) {
      const item = next.find((candidate) => candidate.id === session.item.id);
      if (item && this.allows(item, session.kind) && sameLayout(next, this.layout)) {
        session.item = item;
        session.dirty = true;
        session.drag = undefined;
      } else if (session.state === "active") this.finish(session, false);
      else if (session.state === "pending") this.end(false);
    }
    this.layout = next;
    this.byId = new Map(next.map((item) => [item.id, item]));
    this.repaint();
  }

  private measure(): boolean {
    const root = this.root!;
    const style = getComputedStyle(root);
    const before = [this.width, this.padLeft, this.padTop];
    this.padLeft = px(style.paddingLeft);
    this.padTop = px(style.paddingTop);
    this.width = Math.max(0, root.clientWidth - this.padLeft - px(style.paddingRight));
    return before[0] !== this.width || before[1] !== this.padLeft || before[2] !== this.padTop;
  }

  private origin(): readonly [number, number, number] {
    const root = this.root!;
    const rect = root.getBoundingClientRect();
    const scale = rect.width / root.offsetWidth || 1;
    return [rect.left + (root.clientLeft + this.padLeft) * scale, rect.top + (root.clientTop + this.padTop) * scale, scale];
  }

  private get metrics() {
    const { cols, gap, rowHeight } = this.options;
    const colWidth = Math.max(0, (this.width - gap * (cols - 1)) / cols);
    return { colWidth, stepX: colWidth + gap, stepY: rowHeight + gap };
  }

  private place(node: HTMLElement, { x, y, w, h }: GridItem, { colWidth, stepX, stepY } = this.metrics): void {
    const { gap, rowHeight } = this.options;
    this.write(node, x * stepX, y * stepY, w * colWidth + (w - 1) * gap, h * rowHeight + (h - 1) * gap);
  }

  private write(node: HTMLElement, left: number, top: number, width: number, height: number): void {
    left += this.padLeft;
    top += this.padTop;
    let box = this.painted.get(node);
    if (!box) this.painted.set(node, (box = [NaN, NaN, NaN, NaN]));
    if (box[0] !== left || box[1] !== top) {
      box[0] = left;
      box[1] = top;
      node.style.transform = `translate3d(${left}px,${top}px,0)`;
    }
    if (box[2] !== width || box[3] !== height) {
      box[2] = width;
      box[3] = height;
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
    }
  }

  private paint(layout: Layout, skip?: string, spareRows = 0): void {
    if (!this.root) return;
    const metrics = this.metrics;
    for (const item of layout) {
      if (item.id === skip) continue;
      const node = this.nodes.get(item.id);
      if (node) this.place(node, item, metrics);
    }
    const { style } = this.root;
    style.height = `${Math.max(0, (layoutBottom(layout) + spareRows) * metrics.stepY - this.options.gap)}px`;
    if (metrics.colWidth !== this.colWidth) style.setProperty("--l8-col-width", `${(this.colWidth = metrics.colWidth)}px`);
  }

  private repaint(): void {
    if (this.session?.state === "active") {
      this.session.dirty = true;
      this.session.origin = this.session.view = undefined;
      this.schedule();
    } else this.paint(this.layout);
  }

  private instant(fn: () => void): void {
    const root = this.root!;
    root.removeAttribute("data-l8-animate");
    fn();
    cancelAnimationFrame(this.animateId);
    this.animateId = requestAnimationFrame(() => {
      this.animateId = requestAnimationFrame(() => root.setAttribute("data-l8-animate", ""));
    });
  }

  private syncHandleMode(): void {
    this.root?.toggleAttribute("data-l8-handle-mode", this.options.handle);
  }

  private allows(item: GridItem, kind: Session["kind"]): boolean {
    return !item.static && (kind === "move" ? item.draggable ?? this.options.draggable : item.resizable ?? this.options.resizable);
  }

  private itemNode(target: EventTarget | null): HTMLElement | null {
    const node = (target as Element | null)?.closest?.<HTMLElement>("[data-l8-id]");
    return node && node.parentElement === this.root ? node : null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.session || event.button !== 0 || !event.isPrimary || !this.root) return;
    const target = event.target as Element;
    const node = this.itemNode(target);
    const item = node && this.byId.get(node.dataset.l8Id!);
    if (!node || !item) return;
    const resizer = target.closest<HTMLElement>("[data-l8-resize]");
    const edge = resizer && this.itemNode(resizer) === node ? resizer.dataset.l8Resize || "se" : "";
    const kind = EDGES.has(edge) ? "resize" : "move";
    if (!this.allows(item, kind)) return;
    if (kind === "move") {
      const interactive = target.closest(INTERACTIVE);
      if (interactive && node.contains(interactive)) return;
      if (this.options.handle && !target.closest("[data-l8-handle]")) return;
    }

    const hold = event.pointerType === "touch" && kind === "move" && !this.options.handle;
    if (!hold) event.preventDefault();
    node.focus({ preventScroll: true });

    const [ox, oy, scale] = this.origin();
    const { colWidth, stepX, stepY } = this.metrics;
    const { gap, rowHeight } = this.options;
    const [ex, ey] = EDGES.get(edge) ?? [0, 0];
    const left = item.x * stepX;
    const top = item.y * stepY;
    const px = (event.clientX - ox) / scale;
    const py = (event.clientY - oy) / scale;
    const session: Session = {
      kind,
      edge,
      state: "pending",
      item,
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: (ex > 0 ? left + item.w * colWidth + (item.w - 1) * gap : left) - px,
      offsetY: (ey > 0 ? top + item.h * rowHeight + (item.h - 1) * gap : top) - py,
      holdTimer: undefined,
      scroller: null,
      origin: undefined,
      view: undefined,
      inset: [0, 0],
      scrollArmed: false,
      lastScroll: 0,
      minRows: layoutBottom(this.layout),
      floor: 0,
      key: "",
      dirty: true,
      drag: undefined,
      preview: this.layout,
    };
    this.session = session;
    if (hold) {
      session.holdTimer = setTimeout(() => {
        navigator.vibrate?.(8);
        this.activate(session);
        this.schedule();
      }, TOUCH_HOLD_MS);
    }
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const session = this.session;
    if (!session || event.pointerId !== session.pointerId) return;
    session.clientX = event.clientX;
    session.clientY = event.clientY;
    if (session.state === "pending") {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < DRAG_THRESHOLD) return;
      if (session.holdTimer) return this.end(false);
      this.activate(session);
    }
    if (session.state === "active") this.schedule();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.session?.pointerId) this.end(true, true);
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.session?.pointerId) this.end(false);
  };

  private onScroll = (): void => {
    if (this.session) this.session.origin = this.session.view = undefined;
    this.schedule();
  };

  private onTouchMove = (event: TouchEvent): void => {
    if (this.session?.state === "active") event.preventDefault();
  };

  private onContextMenu = (event: Event): void => {
    if (this.session) event.preventDefault();
  };

  private activate(session: Session): void {
    this.flush();
    const root = this.root!;
    session.state = "active";
    session.holdTimer = undefined;
    session.scroller = scrollParent(root);
    const scrolling = getComputedStyle(session.scroller ?? root.ownerDocument.documentElement);
    session.inset = [px(scrolling.scrollPaddingTop), px(scrolling.scrollPaddingBottom)];
    root.setPointerCapture(session.pointerId);
    root.setAttribute("data-l8-dragging", session.kind);
    session.node.setAttribute("data-l8-active", session.kind);
    session.node.removeAttribute("data-l8-settling");
    if (session.kind === "resize") session.node.setAttribute("data-l8-edge", session.edge);
    const placeholder = this.placeholder!;
    placeholder.style.transition = "none";
    placeholder.setAttribute("data-l8-visible", "");
    this.place(placeholder, session.item);
    void placeholder.offsetWidth;
    placeholder.style.transition = "";
    window.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
  }

  private schedule(): void {
    if (!this.frameId) this.frameId = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.frameId = 0;
    const session = this.session;
    const root = this.root;
    if (session?.state !== "active" || !root) return;

    const [ox, oy, scale] = (session.origin ??= this.origin());
    const view = session.scroller ? (session.view ??= session.scroller.getBoundingClientRect()) : undefined;
    const px = (session.clientX - ox) / scale;
    const py = (session.clientY - oy) / scale;
    const { colWidth, stepX, stepY } = this.metrics;
    const { cols, gap, rowHeight } = this.options;
    const span = (cells: number, size: number) => cells * size + (cells - 1) * gap;
    const origin = session.item;
    const x = px + session.offsetX;
    const y = py + session.offsetY;
    let preview = session.preview;

    if (session.kind === "move") {
      if (!session.drag) {
        session.drag = dragItem(this.layout, origin.id, this.options);
        session.floor = origin.y;
        for (const other of this.layout) if (other.id !== origin.id) session.floor = Math.max(session.floor, other.y + other.h);
      }
      const width = span(origin.w, colWidth);
      const height = span(origin.h, rowHeight);
      const left = clamp(x, 0, this.width - width);
      const top = clamp(y, 0, session.floor * stepY);
      this.write(session.node, left, top, width, height);
      preview = session.drag(x / stepX, top / stepY);
    } else {
      const [ex, ey] = EDGES.get(session.edge)!;
      const minW = Math.max(1, origin.minW ?? 1);
      const maxW = Math.min(cols, origin.maxW ?? cols);
      const minH = Math.max(1, origin.minH ?? 1);
      const maxH = origin.maxH ?? Infinity;
      let left = origin.x * stepX;
      let top = origin.y * stepY;
      let right = left + span(origin.w, colWidth);
      let bottom = top + span(origin.h, rowHeight);
      if (ex > 0) right = clamp(x, left + span(minW, colWidth), Math.min(this.width, left + span(maxW, colWidth)));
      if (ex < 0) left = clamp(x, Math.max(0, right - span(maxW, colWidth)), right - span(minW, colWidth));
      if (ey > 0) bottom = clamp(y, top + span(minH, rowHeight), top + span(maxH, rowHeight));
      if (ey < 0) {
        const from = Math.round(left / stepX);
        const to = Math.round((right + gap) / stepX);
        let ceiling = 0;
        for (const other of this.layout)
          if (other !== origin && other.y + other.h <= origin.y && other.x < to && from < other.x + other.w) ceiling = Math.max(ceiling, other.y + other.h);
        top = clamp(y, Math.max(ceiling * stepY, bottom - span(maxH, rowHeight)), bottom - span(minH, rowHeight));
      }
      this.write(session.node, left, top, right - left, bottom - top);
      const x0 = ex < 0 ? Math.round(left / stepX) : origin.x;
      const y0 = ey < 0 ? Math.round(top / stepY) : origin.y;
      const x1 = ex > 0 ? Math.round((right + gap) / stepX) : origin.x + origin.w;
      const y1 = ey > 0 ? Math.round((bottom + gap) / stepY) : origin.y + origin.h;
      const target = clampItem({ ...origin, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cols);
      const key = `${target.x},${target.y},${target.w},${target.h}`;
      if (session.dirty || key !== session.key) {
        session.key = key;
        preview = resolveLayout(this.layout, this.options, target);
      }
    }

    if (session.dirty || preview !== session.preview) {
      session.dirty = false;
      session.preview = preview;
      this.paint(preview, origin.id, Math.max(session.kind === "move" ? 0 : 1, session.minRows - layoutBottom(preview)));
      this.place(this.placeholder!, preview.find((item) => item.id === origin.id)!);
    }
    this.autoScroll(session, Math.max(0, view?.top ?? 0) + session.inset[0], Math.min(window.innerHeight, view?.bottom ?? Infinity) - session.inset[1]);
  };

  private autoScroll(session: Session, top: number, bottom: number): void {
    const { scroller } = session;
    const edge = Math.min(SCROLL_EDGE, (bottom - top) / 4);
    const y = session.clientY;
    const depth = y < top + edge ? (y - top - edge) / edge : y > bottom - edge ? (y - bottom + edge) / edge : 0;
    if (!depth) {
      session.scrollArmed = true;
      session.lastScroll = 0;
      return;
    }
    if (!session.scrollArmed) return;
    const now = performance.now();
    const elapsed = session.lastScroll ? Math.min(now - session.lastScroll, 50) : 16;
    session.lastScroll = now;
    const delta = Math.sign(depth) * Math.min(1, Math.abs(depth)) ** 2 * SCROLL_MAX_SPEED * elapsed;
    const target = scroller ?? document.scrollingElement ?? document.documentElement;
    const before = target.scrollTop;
    if (scroller) scroller.scrollTop += delta;
    else window.scrollBy(0, delta);
    if (target.scrollTop !== before) this.schedule();
  }

  private finish(session: Session, commit: boolean, defer = false): void {
    session.state = "done";
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    window.removeEventListener("scroll", this.onScroll, { capture: true });
    if (this.root?.hasPointerCapture(session.pointerId)) this.root.releasePointerCapture(session.pointerId);
    if (commit) this.commit(session.preview, session.item.id, session.kind);
    this.settling = () => {
      this.settling = null;
      this.root?.removeAttribute("data-l8-dragging");
      this.placeholder?.removeAttribute("data-l8-visible");
      const { node } = session;
      node.removeAttribute("data-l8-active");
      node.removeAttribute("data-l8-edge");
      node.setAttribute("data-l8-settling", "");
      const settle = () => node.removeAttribute("data-l8-settling");
      node.addEventListener("transitionend", settle, { once: true });
      setTimeout(settle, 400);
      this.paint(this.layout);
    };
    if (defer) this.settleId = requestAnimationFrame(this.settling);
    else this.flush();
  }

  private flush(): void {
    cancelAnimationFrame(this.settleId);
    this.settling?.();
  }

  private end(commit: boolean, defer = false): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    clearTimeout(session.holdTimer);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    if (session.state === "pending") return;
    if (session.state === "active") this.finish(session, commit, defer);
    window.addEventListener("click", swallowClick, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }));
  }

  private commit(next: GridItem[], id: string, kind: ChangeKind): void {
    if (sameLayout(next, this.layout)) return;
    this.source = this.layout = next;
    this.byId = new Map(next.map((item) => [item.id, item]));
    this.onCommit(next, id, kind);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const session = this.session;
    if (session) {
      if (event.key === "Escape" && session.state === "active") {
        event.preventDefault();
        this.finish(session, false);
      }
      return;
    }
    const delta = ARROWS[event.key];
    const node = this.itemNode(event.target);
    if (!delta || !node || node !== event.target || event.altKey || event.ctrlKey || event.metaKey) return;
    const item = this.byId.get(node.dataset.l8Id!);
    const kind = event.shiftKey ? "resize" : "move";
    if (!item || !this.allows(item, kind)) return;
    event.preventDefault();
    const [dx, dy] = delta;
    const next = nudgeItem(this.layout, item.id, event.shiftKey ? { w: dx, h: dy } : { x: dx, y: dy }, this.options);
    if (!next) return;
    this.commit(next, item.id, kind);
    this.paint(this.layout);
  };
}
