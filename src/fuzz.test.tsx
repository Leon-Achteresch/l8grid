// Random input on grids with the 0.3 options enabled. After every step the committed layout must keep the rules
// of the options in effect, and the DOM must match it once nothing is being dragged.
import { act, cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { Grid, resolveLayout, type GridItem, type GridProps } from ".";
import { placeFree } from "./free";

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const overlaps = (a: GridItem, b: GridItem) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const bottom = (layout: GridItem[]) => Math.max(0, ...layout.map((item) => item.y + item.h));

function scenario(seed: number) {
  const next = random(seed);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const cols = pick([6, 12]);
  const layout: GridItem[] = [];
  for (let i = 0; i < 3 + Math.floor(next() * 6); i++) {
    const w = 1 + Math.floor(next() * 4);
    layout.push({ id: `i${i}`, x: Math.floor(next() * (cols - w + 1)), y: Math.floor(next() * 8), w, h: 1 + Math.floor(next() * 3), ...(next() < 0.1 ? { static: true } : {}) });
  }
  const props: Partial<GridProps> = {
    cols,
    rowHeight: 60,
    gap: 12,
    compaction: next() < 0.7 ? "vertical" : "none",
    maxRows: next() < 0.4 ? 6 + Math.floor(next() * 6) : undefined,
    preventCollision: next() < 0.3,
    allowOverlap: next() < 0.2,
    direction: next() < 0.3 ? "rtl" : "ltr",
    keyboard: next() < 0.4 ? "grab" : "instant",
    resizeHandles: next() < 0.5 ? ["se"] : ["n", "e", "s", "w", "ne", "nw", "se", "sw"],
  };
  return { layout, props, next };
}

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 120);

test(`options keep their rules under random input (${SEEDS} scenarios)`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { layout: initial, props, next } = scenario(seed);
    const { cols = 24, maxRows, preventCollision, allowOverlap, compaction = "vertical" } = props;
    const stepX = (1200 - 12 * (cols - 1)) / cols + 12;
    const resolve = (layout: GridItem[]) => (allowOverlap ? placeFree(layout, cols) : resolveLayout(layout, { cols, compaction }));
    let committed = resolve(initial);
    let current = initial;
    const fail = (message: string) => {
      throw new Error(`seed ${seed}: ${message}`);
    };
    const check = (next: GridItem[], active: string) => {
      const before = committed;
      for (const item of next) if (item.x < 0 || item.x + item.w > cols || item.y < 0) fail(`out of bounds ${JSON.stringify(item)}`);
      if (!allowOverlap)
        for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) if (overlaps(next[i]!, next[j]!)) fail("overlap");
      if (maxRows != null && bottom(next) > Math.max(maxRows, bottom(before))) fail(`taller than maxRows ${maxRows}`);
      if (preventCollision && !allowOverlap)
        for (const item of next) {
          const prev = before.find((other) => other.id === item.id);
          if (prev && item.id !== active && (prev.x !== item.x || item.y > prev.y)) fail(`pushed ${item.id}`);
        }
      committed = next;
    };
    function Harness() {
      const [layout, setLayout] = useState(initial);
      current = layout;
      return (
        <Grid
          layout={layout}
          {...props}
          renderItem={(id) => <div className="content">{id}</div>}
          onDrop={(next, item) => {
            check(next, item.id);
            const stored = next.map((other) => (other.id === item.id ? { ...other, id: `d${next.length}` } : other));
            committed = stored;
            setLayout(stored);
          }}
          droppingItem={{ w: 2, h: 2 }}
          onLayoutChange={(next, change) => {
            check(next, change.id);
            setLayout(next);
          }}
        />
      );
    }
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const root = view.container.querySelector<HTMLElement>(".l8-grid")!;
    const frame = () =>
      act(() => {
        vi.advanceTimersToNextFrame();
      });
    const node = () => {
      const items = current.filter((item) => !item.static);
      const item = items[Math.floor(next() * items.length)];
      return item && root.querySelector<HTMLElement>(`[data-l8-id="${item.id}"]`);
    };
    for (let step = 0; step < 25; step++) {
      const r = next();
      const target = node();
      if (!target) break;
      if (r < 0.45) {
        const box = { x: Number(target.style.transform.match(/\(([-\d.]+)px/)![1]), y: Number(target.style.transform.match(/,([-\d.]+)px/)![1]) };
        const handles = target.querySelectorAll(".l8-resize");
        const from = next() < 0.35 && handles.length ? handles[Math.floor(next() * handles.length)]! : target.querySelector(".content")!;
        let x = box.x + 10;
        let y = box.y + 10;
        fireEvent.pointerDown(from, { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", clientX: x, clientY: y });
        for (let m = 0; m < 1 + Math.floor(next() * 6); m++) {
          x += (next() - 0.5) * 4 * stepX;
          y += (next() - 0.5) * 300;
          fireEvent.pointerMove(root, { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", clientX: x, clientY: y });
          frame();
        }
        if (next() < 0.1) fireEvent.keyDown(target, { key: "Escape" });
        fireEvent.pointerUp(root, { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", clientX: x, clientY: y });
      } else if (r < 0.85) {
        const key = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter", "Escape"][Math.floor(next() * 7)]!;
        fireEvent.keyDown(target, { key, shiftKey: next() < 0.3 });
        if (next() < 0.05) fireEvent.focusOut(target);
      } else {
        const x = next() * 1200;
        const y = next() * 600;
        const over = createEvent.dragOver(root);
        Object.defineProperties(over, { clientX: { value: x }, clientY: { value: y } });
        fireEvent(root, over);
        const end = next() < 0.7 ? createEvent.drop(root) : createEvent.dragLeave(root);
        Object.defineProperties(end, { clientX: { value: x }, clientY: { value: y } });
        fireEvent(root, end);
      }
      frame();
    }
    // drop any keyboard grab, then the DOM must show the committed layout
    for (const node of root.querySelectorAll<HTMLElement>("[data-l8-grabbed]")) fireEvent.keyDown(node, { key: "Escape" });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    const rtl = props.direction === "rtl";
    for (const item of resolve(current)) {
      const el = root.querySelector<HTMLElement>(`[data-l8-id="${item.id}"]`)!;
      const width = item.w * (stepX - 12) + (item.w - 1) * 12;
      const left = rtl ? 1200 - item.x * stepX - width : item.x * stepX;
      if (el.style.transform !== `translate3d(${left}px,${item.y * 72}px,0)`) fail(`DOM of ${item.id} is ${el.style.transform}, layout ${JSON.stringify(item)}`);
    }
    cleanup();
  }
}, 300_000);
