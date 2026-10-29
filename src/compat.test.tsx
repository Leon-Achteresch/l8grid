// Differential test: the current Grid must behave exactly like the published 0.2.1 when only the 0.2.1 API is used.
// Random scenarios (layouts, props, pointer and keyboard input, external updates) run against both versions and the
// resulting commits, return values and DOM must be identical.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type ComponentType, type Dispatch, type SetStateAction } from "react";
import { Grid as OldGrid } from "l8grid-v021";
import { Grid as NewGrid, type GridItem, type GridProps, type ResizeHandle } from ".";


const EDGES: ResizeHandle[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
// Custom properties added by the current version for server rendering; they have no effect after mount.
const NEW_VARS = new Set(["--l8-x", "--l8-y", "--l8-w", "--l8-h", "--l8-cols", "--l8-gap", "--l8-row-height", "--l8-rows"]);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("l8-grid") ? 1200 : 0;
    },
  });
  Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
  window.scrollBy = () => {};
});

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

type Props = Pick<GridProps, "cols" | "rowHeight" | "gap" | "compaction" | "draggable" | "resizable" | "resizeHandles" | "handle">;

type Step =
  | { kind: "drag"; id: number; target: "tile" | "handle" | "button" | "resize" | "custom"; edge: number; pointerType: string; dx: number; dy: number; moves: [number, number][]; hold: number; escape: number; end: "up" | "cancel"; click: boolean }
  | { kind: "key"; id: number; key: string; shift: boolean; mod: boolean }
  | { kind: "external"; mode: "copy" | "swap" | "add" | "remove" | "shuffle"; a: number; b: number }
  | { kind: "props"; props: Partial<Props> }
  | { kind: "time"; ms: number };

interface Scenario {
  layout: GridItem[];
  props: Props;
  steps: Step[];
}

function pick<T>(next: () => number, values: readonly T[]): T {
  return values[Math.floor(next() * values.length)]!;
}

function randomProps(next: () => number): Partial<Props> {
  const props: Partial<Props> = {};
  if (next() < 0.3) props.cols = pick(next, [4, 6, 8, 12, 24]);
  if (next() < 0.2) props.rowHeight = pick(next, [10, 24, 60]);
  if (next() < 0.2) props.gap = pick(next, [0, 4, 12]);
  if (next() < 0.3) props.compaction = pick(next, ["vertical", "none"] as const);
  if (next() < 0.2) props.draggable = next() < 0.7;
  if (next() < 0.2) props.resizable = next() < 0.7;
  if (next() < 0.3) props.resizeHandles = EDGES.filter(() => next() < 0.4);
  if (next() < 0.2) props.handle = next() < 0.5;
  return props;
}

function scenario(seed: number): Scenario {
  const next = random(seed);
  const cols = pick(next, [6, 12, 24]);
  const count = 2 + Math.floor(next() * 9);
  const layout: GridItem[] = [];
  for (let i = 0; i < count; i++) {
    const w = 1 + Math.floor(next() * Math.min(cols, 8));
    const item: GridItem = { id: `i${i}`, x: Math.floor(next() * (cols - w + 1)), y: Math.floor(next() * 12), w, h: 1 + Math.floor(next() * 4) };
    if (next() < 0.1) item.static = true;
    if (next() < 0.15) item.minW = 1 + Math.floor(next() * 3);
    if (next() < 0.1) item.maxW = 2 + Math.floor(next() * 6);
    if (next() < 0.15) item.minH = 1 + Math.floor(next() * 3);
    if (next() < 0.1) item.maxH = 2 + Math.floor(next() * 4);
    if (next() < 0.08) item.draggable = false;
    if (next() < 0.08) item.resizable = false;
    if (next() < 0.05) item.y = Infinity;
    layout.push(item);
  }
  const props: Props = {
    cols,
    rowHeight: pick(next, [16, 24, 60]),
    gap: pick(next, [0, 8, 12]),
    compaction: next() < 0.75 ? "vertical" : "none",
    draggable: next() < 0.9,
    resizable: next() < 0.9,
    resizeHandles: next() < 0.5 ? ["se"] : EDGES.filter(() => next() < 0.5),
    handle: next() < 0.2,
  };
  const steps: Step[] = [];
  const total = 10 + Math.floor(next() * 25);
  for (let s = 0; s < total; s++) {
    const r = next();
    if (r < 0.55) {
      const moves: [number, number][] = [];
      const n = Math.floor(next() * 12);
      for (let m = 0; m < n; m++) moves.push([(next() - 0.5) * 500, (next() - 0.5) * 300]);
      steps.push({
        kind: "drag",
        id: Math.floor(next() * count),
        target: pick(next, ["tile", "tile", "tile", "handle", "button", "resize", "resize", "custom"] as const),
        edge: Math.floor(next() * EDGES.length),
        pointerType: next() < 0.85 ? "mouse" : "touch",
        dx: next(),
        dy: next(),
        moves,
        hold: next() < 0.5 ? 300 : 0,
        escape: next() < 0.1 ? Math.floor(next() * (n + 1)) : -1,
        end: next() < 0.9 ? "up" : "cancel",
        click: next() < 0.3,
      });
    } else if (r < 0.8) {
      steps.push({ kind: "key", id: Math.floor(next() * count), key: pick(next, ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape", "a"]), shift: next() < 0.3, mod: next() < 0.05 });
    } else if (r < 0.88) {
      steps.push({ kind: "external", mode: pick(next, ["copy", "swap", "add", "remove", "shuffle"] as const), a: next(), b: next() });
    } else if (r < 0.95) {
      steps.push({ kind: "props", props: randomProps(next) });
    } else steps.push({ kind: "time", ms: Math.floor(next() * 500) });
  }
  return { layout, props, steps };
}

function snapshot(node: Element): unknown {
  const attributes: Record<string, string> = {};
  for (const { name, value } of node.attributes) {
    if (name === "data-l8-ready" || name === "id" || name === "aria-describedby") continue;
    if (name === "style") {
      const style = (node as HTMLElement).style;
      const kept: string[] = [];
      for (let i = 0; i < style.length; i++) {
        const prop = style[i]!;
        if (!NEW_VARS.has(prop)) kept.push(`${prop}:${style.getPropertyValue(prop)}`);
      }
      if (kept.length) attributes.style = kept.join(";");
      continue;
    }
    attributes[name] = value;
  }
  return { tag: node.tagName, attributes, text: node.children.length ? undefined : node.textContent, children: [...node.children].map(snapshot) };
}

function run(GridImpl: ComponentType<GridProps>, { layout, props, steps }: Scenario): unknown[] {
  const trace: unknown[] = [];
  let setLayout!: Dispatch<SetStateAction<GridItem[]>>;
  let current = layout;
  let currentProps = props;
  const renderItem = (id: string) => (
    <div className="content" data-id={id} onClick={() => trace.push(["click", id])}>
      <span data-l8-handle="">h</span>
      <button>b</button>
      <i data-l8-resize="e">r</i>
      {id}
    </div>
  );
  function Harness(extra: Props) {
    const [state, set] = useState(layout);
    setLayout = set;
    current = state;
    return (
      <GridImpl
        layout={state}
        renderItem={renderItem}
        getItemLabel={(id) => `label ${id}`}
        onLayoutChange={(next, change) => {
          trace.push(["commit", change, next]);
          set(next);
        }}
        {...extra}
      />
    );
  }
  const view = render(<Harness {...props} />);
  const record = (label: string, extra?: unknown) => {
    const root = view.container.querySelector(".l8-grid")!;
    trace.push([label, extra, snapshot(root)]);
  };
  const metrics = () => {
    const cols = currentProps.cols ?? 24;
    const gap = currentProps.gap ?? 12;
    const rowHeight = currentProps.rowHeight ?? 24;
    const colWidth = (1200 - gap * (cols - 1)) / cols;
    return { colWidth, rowHeight, stepX: colWidth + gap, stepY: rowHeight + gap };
  };
  const frame = () =>
    act(() => {
      vi.advanceTimersToNextFrame();
    });
  const pointer = (x: number, y: number, pointerType: string) => ({ pointerId: 1, isPrimary: true, button: 0, pointerType, clientX: x, clientY: y });
  record("initial");

  for (const step of steps) {
    const root = view.container.querySelector(".l8-grid")!;
    if (step.kind === "drag") {
      const item = current[step.id % current.length];
      const node = item && root.querySelector<HTMLElement>(`[data-l8-id="${item.id}"]`);
      if (!item || !node) continue;
      const placed = current.find((candidate) => candidate.id === item.id)!;
      const { colWidth, rowHeight, stepX, stepY } = metrics();
      const y = Number.isFinite(placed.y) ? placed.y : 0;
      let x0 = placed.x * stepX + step.dx * (placed.w * colWidth);
      let y0 = y * stepY + step.dy * (placed.h * rowHeight);
      let target: Element | null = node.querySelector(".content") ?? node;
      if (step.target === "handle") target = node.querySelector("[data-l8-handle]");
      if (step.target === "button") target = node.querySelector("button");
      if (step.target === "custom") target = node.querySelector("i[data-l8-resize]");
      if (step.target === "resize") {
        const handles = node.querySelectorAll(".l8-resize");
        target = handles[step.edge % Math.max(1, handles.length)] ?? target;
        const edge = (target as HTMLElement).dataset.l8Resize ?? "";
        if (edge.includes("e")) x0 = placed.x * stepX + placed.w * colWidth + (placed.w - 1) * (stepX - colWidth) - 3;
        if (edge.includes("w")) x0 = placed.x * stepX + 3;
        if (edge.includes("s")) y0 = y * stepY + placed.h * rowHeight + (placed.h - 1) * (stepY - rowHeight) - 3;
        if (edge.includes("n")) y0 = y * stepY + 3;
      }
      if (!target) continue;
      trace.push(["down", fireEvent.pointerDown(target, pointer(x0, y0, step.pointerType))]);
      if (step.hold)
        act(() => {
          vi.advanceTimersByTime(step.hold);
        });
      let px = x0;
      let py = y0;
      step.moves.forEach(([dx, dy], i) => {
        if (i === step.escape) trace.push(["escape", fireEvent.keyDown(target!, { key: "Escape" })]);
        px += dx;
        py += dy;
        trace.push(["move", fireEvent.pointerMove(root, pointer(px, py, step.pointerType))]);
        frame();
        record("frame");
      });
      if (step.end === "up") fireEvent.pointerUp(root, pointer(px, py, step.pointerType));
      else fireEvent.pointerCancel(root, pointer(px, py, step.pointerType));
      record("released");
      if (step.click) fireEvent.click(target);
      frame();
      record("settled");
    } else if (step.kind === "key") {
      const item = current[step.id % current.length];
      const node = item && root.querySelector<HTMLElement>(`[data-l8-id="${item.id}"]`);
      if (!node) continue;
      trace.push(["key", fireEvent.keyDown(node, { key: step.key, shiftKey: step.shift, ctrlKey: step.mod })]);
      record("key");
      frame();
    } else if (step.kind === "external") {
      act(() =>
        setLayout((prev) => {
          const copy = prev.map((item) => ({ ...item }));
          const i = Math.floor(step.a * copy.length);
          const j = Math.floor(step.b * copy.length);
          if (step.mode === "swap" && copy[i] && copy[j]) {
            const { x, y } = copy[i]!;
            copy[i] = { ...copy[i]!, x: copy[j]!.x, y: copy[j]!.y };
            copy[j] = { ...copy[j]!, x, y };
          }
          if (step.mode === "add") copy.push({ id: `n${copy.length}-${i}`, x: i % 4, y: Infinity, w: 1 + (j % 3), h: 2 });
          if (step.mode === "remove" && copy.length > 1) copy.splice(i, 1);
          if (step.mode === "shuffle") copy.reverse();
          return copy;
        }),
      );
      record("external");
      frame();
    } else if (step.kind === "props") {
      currentProps = { ...currentProps, ...step.props };
      view.rerender(<Harness {...currentProps} />);
      record("props");
      frame();
    } else {
      act(() => {
        vi.advanceTimersByTime(step.ms);
      });
      record("time");
    }
  }
  act(() => {
    vi.runOnlyPendingTimers();
  });
  record("end");
  cleanup();
  document.getElementById("l8grid-styles")?.remove();
  return trace;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

// New options set to their defaults, plus listeners for the new callbacks, must not change anything either.
function NewGridWithDefaults(props: GridProps) {
  return (
    <NewGrid
      direction="ltr"
      keyboard="instant"
      preventCollision={false}
      allowOverlap={false}
      onInteractionStart={() => {}}
      onPreviewChange={() => {}}
      onInteractionEnd={() => {}}
      rootRef={() => {}}
      {...props}
    />
  );
}

const SEEDS = Number(process.env.COMPAT_SEEDS ?? 300);

const stats = new Map<string, number>();
afterAll(() => {
  if (process.env.COMPAT_STATS) process.stderr.write(JSON.stringify([...stats]) + "\n");
});

test(`behaves exactly like 0.2.1 in ${SEEDS} random scenarios`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const input = scenario(seed);
    const before = run(OldGrid as ComponentType<GridProps>, input);
    const after = run(seed % 2 ? NewGrid : NewGridWithDefaults, input);
    if (process.env.COMPAT_STATS) for (const entry of before as [string, { kind?: string }?][]) if (entry[0] === "commit" || entry[0] === "click") stats.set(entry[0] + (entry[1]?.kind ?? ""), (stats.get(entry[0] + (entry[1]?.kind ?? "")) ?? 0) + 1);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      const index = after.findIndex((entry, i) => JSON.stringify(entry) !== JSON.stringify(before[i]));
      expect({ seed, index, entry: after[index] }).toEqual({ seed, index, entry: before[index] });
    }
  }
}, 600_000);

test("the injected stylesheet keeps every 0.2.1 rule unchanged and in order", () => {
  render(<OldGrid layout={[]} renderItem={() => null} onLayoutChange={() => {}} />);
  const old = document.getElementById("l8grid-styles")!.textContent!;
  cleanup();
  document.getElementById("l8grid-styles")!.remove();
  render(<NewGrid layout={[]} renderItem={() => null} onLayoutChange={() => {}} />);
  const current = document.getElementById("l8grid-styles")!.textContent!;
  cleanup();
  document.getElementById("l8grid-styles")!.remove();
  expect(current.startsWith(old)).toBe(true);
  // every added rule only matches attributes the 0.2.1 API never produces after mount
  const added = current.slice(old.length).trim().split("\n");
  for (const rule of added) expect(rule).toMatch(/^[^{]*(:not\(\[data-l8-ready\]\)|\[data-l8-grabbed\])[^{]*\{/);
});
