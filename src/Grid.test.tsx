import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Grid, type GridProps } from "./Grid";
import type { GridItem } from "./layout";

const initial: GridItem[] = [
  { id: "a", x: 0, y: 0, w: 4, h: 2 },
  { id: "b", x: 4, y: 0, w: 4, h: 2 },
  { id: "c", x: 0, y: 2, w: 8, h: 1 },
];

const STEP_X = 101;
const STEP_Y = 72;
const capture = vi.fn();

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("l8-grid") ? 1200 : 0;
    },
  });
  Object.assign(HTMLElement.prototype, { setPointerCapture: capture, releasePointerCapture() {}, hasPointerCapture: () => false });
});

beforeEach(() => {
  capture.mockClear();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function setup(props: Partial<GridProps> = {}, layout: GridItem[] = initial) {
  const renders = new Map<string, number>();
  const changes: GridItem[][] = [];
  const clicks: string[] = [];
  let setLayout!: Dispatch<SetStateAction<GridItem[]>>;
  const renderItem = (id: string) => {
    renders.set(id, (renders.get(id) ?? 0) + 1);
    return (
      <div data-testid={id} onClick={() => clicks.push(id)}>
        {id}
      </div>
    );
  };
  function Harness(extra: Partial<GridProps>) {
    const [state, set] = useState(layout);
    setLayout = set;
    return (
      <Grid
        layout={state}
        cols={12}
        rowHeight={60}
        renderItem={renderItem}
        onLayoutChange={(next) => {
          changes.push(next);
          set(next);
        }}
        {...props}
        {...extra}
      />
    );
  }
  const view = render(<Harness />);
  const item = (id: string) => view.container.querySelector<HTMLElement>(`[data-l8-id="${id}"]`)!;
  const committed = (id: string) => {
    const { x, y, w, h } = changes.at(-1)!.find((candidate) => candidate.id === id)!;
    return { x, y, w, h };
  };
  return { view, Harness, item, committed, renders, changes, clicks, setLayout: (fn: (layout: GridItem[]) => GridItem[]) => act(() => setLayout(fn)) };
}

const pointer = (x: number, y: number, init: PointerEventInit = {}) => ({ pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", clientX: x, clientY: y, ...init });
const down = (target: Element, x: number, y: number, init?: PointerEventInit) => fireEvent.pointerDown(target, pointer(x, y, init));
const root = () => document.querySelector(".l8-grid")!;
const up = (x: number, y: number) => fireEvent.pointerUp(root(), pointer(x, y));
function move(x: number, y: number, init?: PointerEventInit) {
  fireEvent.pointerMove(root(), pointer(x, y, init));
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

test("arrow keys swap with the neighbour instead of pushing it down and commit once", () => {
  const { changes, item, renders, committed } = setup();
  fireEvent.keyDown(item("a"), { key: "ArrowRight" });
  expect(changes).toHaveLength(1);
  expect(committed("a")).toMatchObject({ x: 4, y: 0 });
  expect(committed("b")).toMatchObject({ x: 0, y: 0 });
  expect([...renders.values()]).toEqual([1, 1, 1]);
});

test("arrow up moves past the item above", () => {
  const { item, committed } = setup();
  fireEvent.keyDown(item("c"), { key: "ArrowUp" });
  expect(committed("c")).toMatchObject({ y: 0 });
  expect(committed("a")).toMatchObject({ y: 1 });
});

test("shift+arrow resizes", () => {
  const { item, committed } = setup();
  fireEvent.keyDown(item("b"), { key: "ArrowDown", shiftKey: true });
  expect(committed("b")).toMatchObject({ h: 3 });
});

test("arrow keys with modifiers stay with the browser", () => {
  const { item, changes } = setup();
  expect(fireEvent.keyDown(item("a"), { key: "ArrowRight", altKey: true })).toBe(true);
  expect(fireEvent.keyDown(item("a"), { key: "ArrowDown", metaKey: true })).toBe(true);
  expect(changes).toHaveLength(0);
});

test("dragging commits once on release", () => {
  const { item, changes, committed } = setup();
  down(item("a"), 20, 20);
  move(20 + 4 * STEP_X, 20);
  expect(item("a").hasAttribute("data-l8-active")).toBe(true);
  expect(changes).toHaveLength(0);
  up(20 + 4 * STEP_X, 20);
  expect(changes).toHaveLength(1);
  expect(committed("a")).toEqual({ x: 4, y: 0, w: 4, h: 2 });
  expect(committed("b")).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  expect(item("a").hasAttribute("data-l8-active")).toBe(false);
});

test("a drag started before the previous drop settled keeps its own state", () => {
  const { item } = setup();
  down(item("a"), 20, 20);
  move(20 + 4 * STEP_X, 20);
  up(20 + 4 * STEP_X, 20);
  down(item("c"), 20, 2 * STEP_Y + 20);
  fireEvent.pointerMove(root(), pointer(20, 2 * STEP_Y + 60));
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  expect(item("a").hasAttribute("data-l8-active")).toBe(false);
  expect(item("c").getAttribute("data-l8-active")).toBe("move");
  expect(root().getAttribute("data-l8-dragging")).toBe("move");
  expect(document.querySelector(".l8-placeholder")!.hasAttribute("data-l8-visible")).toBe(true);
});

test("a short sideways drag over the neighbour keeps the layout, a long one swaps", () => {
  const { item, changes, committed } = setup();
  const before = item("b").style.transform;
  down(item("a"), 20, 20);
  move(20 + 1.8 * STEP_X, 20);
  expect(item("b").style.transform).toBe(before);
  up(20 + 1.8 * STEP_X, 20);
  expect(changes).toHaveLength(0);

  down(item("a"), 20, 20);
  move(20 + 2.6 * STEP_X, 20);
  up(20 + 2.6 * STEP_X, 20);
  expect(committed("a")).toEqual({ x: 4, y: 0, w: 4, h: 2 });
  expect(committed("b")).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  expect(committed("c")).toEqual({ x: 0, y: 2, w: 8, h: 1 });
});

test("a click without dragging reaches the tile content", () => {
  const { view, changes, clicks } = setup();
  const content = view.getByTestId("a");
  down(content, 20, 20);
  move(22, 21);
  up(22, 21);
  fireEvent.click(content);
  expect(clicks).toEqual(["a"]);
  expect(capture).not.toHaveBeenCalled();
  expect(changes).toHaveLength(0);
});

test("the click that ends a drag is swallowed", () => {
  const { view, clicks } = setup();
  const content = view.getByTestId("a");
  down(content, 20, 20);
  move(20 + 4 * STEP_X, 20);
  expect(capture).toHaveBeenCalledWith(1);
  up(20 + 4 * STEP_X, 20);
  fireEvent.click(content);
  expect(clicks).toEqual([]);
  act(() => {
    vi.runOnlyPendingTimers();
  });
  fireEvent.click(content);
  expect(clicks).toEqual(["a"]);
});

test("escape cancels a drag and the release does not commit", () => {
  const { view, item, changes, clicks } = setup();
  const before = item("b").style.transform;
  down(item("a"), 20, 20);
  move(20 + 4 * STEP_X, 20);
  expect(item("b").style.transform).not.toBe(before);
  fireEvent.keyDown(item("a"), { key: "Escape" });
  expect(item("b").style.transform).toBe(before);
  expect(item("a").style.transform).toBe("translate3d(0px,0px,0)");
  move(20 + 5 * STEP_X, 20);
  up(20 + 5 * STEP_X, 20);
  fireEvent.click(view.getByTestId("a"));
  expect(changes).toHaveLength(0);
  expect(clicks).toEqual([]);
});

test("re-rendering with an equal layout keeps the drag alive", () => {
  const { item, changes, committed, setLayout } = setup();
  down(item("a"), 20, 20);
  move(20 + 4 * STEP_X, 20);
  setLayout((layout) => layout.map((entry) => ({ ...entry })));
  move(20 + 4 * STEP_X, 21);
  up(20 + 4 * STEP_X, 21);
  expect(changes).toHaveLength(1);
  expect(committed("a")).toMatchObject({ x: 4, y: 0 });
});

test("a structural layout change cancels the drag", () => {
  const { item, changes, setLayout } = setup();
  down(item("a"), 20, 20);
  move(20 + 4 * STEP_X, 20);
  setLayout((layout) => layout.filter((entry) => entry.id !== "c"));
  move(20 + 5 * STEP_X, 20);
  up(20 + 5 * STEP_X, 20);
  expect(changes).toHaveLength(0);
  expect(item("a").hasAttribute("data-l8-active")).toBe(false);
});

test("changing compaction mid-drag applies the new rules to the running drag", () => {
  const { view, Harness, item, committed } = setup({}, [
    { id: "a", x: 0, y: 0, w: 2, h: 1 },
    { id: "b", x: 0, y: 1, w: 2, h: 1 },
  ]);
  down(item("a"), 20, 20);
  move(30, 20);
  view.rerender(<Harness compaction="none" />);
  move(20 + 4 * STEP_X, 20 + 2 * STEP_Y);
  up(20 + 4 * STEP_X, 20 + 2 * STEP_Y);
  expect(committed("a")).toEqual({ x: 4, y: 2, w: 2, h: 1 });
});

test("changing cols and back restores the arrangement", () => {
  const { view, Harness, item } = setup();
  expect(item("b").style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
  view.rerender(<Harness cols={4} />);
  expect(item("b").style.transform).toBe(`translate3d(0px,${2 * STEP_Y}px,0)`);
  view.rerender(<Harness cols={12} />);
  expect(item("b").style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
});

test("touch drags need a long press so swipes keep scrolling", () => {
  const { item, changes, committed } = setup();
  expect(down(item("a"), 20, 20, { pointerType: "touch" })).toBe(true);
  move(20, 60, { pointerType: "touch" });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(item("a").hasAttribute("data-l8-active")).toBe(false);
  up(20, 60);

  down(item("a"), 20, 20, { pointerType: "touch" });
  act(() => {
    vi.advanceTimersByTime(250);
  });
  expect(item("a").getAttribute("data-l8-active")).toBe("move");
  move(20 + 4 * STEP_X, 20, { pointerType: "touch" });
  up(20 + 4 * STEP_X, 20);
  expect(changes).toHaveLength(1);
  expect(committed("a")).toMatchObject({ x: 4, y: 0 });
});

test("the resize handle changes the size", () => {
  const { item, committed } = setup();
  const handle = item("b").querySelector("[data-l8-resize]")!;
  down(handle, 790, 128);
  move(790 + STEP_X, 128 + STEP_Y);
  expect(item("b").getAttribute("data-l8-active")).toBe("resize");
  up(790 + STEP_X, 128 + STEP_Y);
  expect(committed("b")).toEqual({ x: 4, y: 0, w: 5, h: 3 });
});

test("static items and interactive content do not start drags", () => {
  const { view, item, changes } = setup({}, [
    { id: "s", x: 0, y: 0, w: 12, h: 1, static: true },
    { id: "a", x: 0, y: 1, w: 4, h: 2 },
  ]);
  expect(down(item("s"), 20, 20)).toBe(true);
  move(20, 200);
  up(20, 200);
  const input = document.createElement("input");
  view.getByTestId("a").append(input);
  expect(down(input, 20, 100)).toBe(true);
  move(20 + 4 * STEP_X, 100);
  up(20 + 4 * STEP_X, 100);
  expect(changes).toHaveLength(0);
  expect(item("s").tabIndex).toBe(-1);
});

test("handle mode ignores pointer down outside the handle", () => {
  const { item } = setup({
    handle: true,
    renderItem: (id) => <span data-l8-handle={id === "a" ? "" : undefined}>{id}</span>,
  });
  expect(down(item("b"), 420, 20)).toBe(true);
  up(420, 20);
  expect(down(item("a").firstElementChild!, 20, 20)).toBe(false);
});

test("announces commits and exposes instructions with custom messages", () => {
  const { view, item } = setup({
    getItemLabel: (id) => id.toUpperCase(),
    messages: { moved: (label, { x, y }) => `${label} at ${x},${y}`, instructions: "Use arrows" },
  });
  const a = item("a");
  expect(a.getAttribute("role")).toBe("group");
  expect(a.getAttribute("aria-label")).toBe("A");
  expect(a.getAttribute("aria-roledescription")).toBe("movable tile");
  expect(document.getElementById(a.getAttribute("aria-describedby")!)?.textContent).toBe("Use arrows");
  fireEvent.keyDown(a, { key: "ArrowRight" });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  expect(view.container.querySelector("[aria-live]")?.textContent).toBe("A at 4,0");
});

test("onLayoutChange reports which item changed and how", () => {
  const onLayoutChange = vi.fn();
  const { item } = setup({ onLayoutChange });
  fireEvent.keyDown(item("a"), { key: "ArrowRight" });
  fireEvent.keyDown(item("a"), { key: "ArrowDown", shiftKey: true });
  expect(onLayoutChange.mock.calls.map(([, change]) => change)).toEqual([
    { id: "a", kind: "move" },
    { id: "a", kind: "resize" },
  ]);
});

test("padding on the grid insets the tiles", () => {
  const { item } = setup({ style: { padding: 10 } });
  expect(item("a").style.transform).toBe("translate3d(10px,10px,0)");
});

test("draggable={false} blocks moving but keeps resizing", () => {
  const { item, changes, committed } = setup({ draggable: false });
  down(item("a"), 20, 20);
  move(20 + 4 * STEP_X, 20);
  expect(item("a").hasAttribute("data-l8-active")).toBe(false);
  up(20 + 4 * STEP_X, 20);
  fireEvent.keyDown(item("a"), { key: "ArrowRight" });
  expect(changes).toHaveLength(0);
  expect(item("a").hasAttribute("data-l8-nodrag")).toBe(true);
  fireEvent.keyDown(item("a"), { key: "ArrowDown", shiftKey: true });
  expect(committed("a")).toMatchObject({ x: 0, y: 0, h: 3 });
});

test("item flags override the grid settings", () => {
  const { item, changes, committed } = setup({ resizable: false }, [
    { id: "a", x: 0, y: 0, w: 4, h: 2, draggable: false },
    { id: "b", x: 4, y: 0, w: 4, h: 2, resizable: true },
  ]);
  expect(item("a").querySelector("[data-l8-resize]")).toBeNull();
  expect(item("b").querySelector("[data-l8-resize]")).not.toBeNull();
  expect(item("a").tabIndex).toBe(-1);
  down(item("a"), 20, 20);
  move(20 + 6 * STEP_X, 20);
  up(20 + 6 * STEP_X, 20);
  expect(changes).toHaveLength(0);
  fireEvent.keyDown(item("b"), { key: "ArrowRight", shiftKey: true });
  expect(committed("b")).toMatchObject({ w: 5 });
});

test("renders the requested built-in handles and none for an empty list", () => {
  const { item, view } = setup({ resizeHandles: ["n", "e", "s", "w", "ne", "nw", "se", "sw"] });
  expect([...item("a").querySelectorAll("[data-l8-resize]")].map((node) => node.getAttribute("data-l8-resize"))).toEqual(["n", "e", "s", "w", "ne", "nw", "se", "sw"]);
  view.unmount();
  const next = setup({ resizeHandles: [] });
  expect(next.item("a").querySelector("[data-l8-resize]")).toBeNull();
});

test("any element marked with data-l8-resize resizes its tile", () => {
  const { item, committed } = setup(
    { resizeHandles: [], renderItem: (id) => <span data-l8-resize="e">{id}</span> },
    [{ id: "a", x: 0, y: 0, w: 4, h: 2 }],
  );
  down(item("a").firstElementChild!, 390, 60);
  move(390 + 2 * STEP_X, 60);
  expect(item("a").getAttribute("data-l8-edge")).toBe("e");
  up(390 + 2 * STEP_X, 60);
  expect(committed("a")).toEqual({ x: 0, y: 0, w: 6, h: 2 });
});

test("resizing from the west edge keeps the right edge in place", () => {
  const { item, committed } = setup({ resizeHandles: ["w"] }, [{ id: "a", x: 6, y: 0, w: 4, h: 2 }]);
  down(item("a").querySelector('[data-l8-resize="w"]')!, 608, 60);
  move(608 - 2 * STEP_X, 60);
  up(608 - 2 * STEP_X, 60);
  expect(committed("a")).toEqual({ x: 4, y: 0, w: 6, h: 2 });
});

test("resizing from the north edge keeps the bottom edge in place", () => {
  const { item, committed } = setup({ resizeHandles: ["n"], compaction: "none" }, [{ id: "a", x: 0, y: 4, w: 4, h: 2 }]);
  down(item("a").querySelector('[data-l8-resize="n"]')!, 100, 290);
  move(100, 290 - 2 * STEP_Y);
  up(100, 290 - 2 * STEP_Y);
  expect(committed("a")).toEqual({ x: 0, y: 2, w: 4, h: 4 });
});

test("a corner resize stops at the minimum size and keeps the opposite corner", () => {
  const { item, committed } = setup({ resizeHandles: ["nw"], compaction: "none" }, [{ id: "a", x: 2, y: 2, w: 4, h: 4, minW: 2, minH: 3 }]);
  down(item("a").querySelector('[data-l8-resize="nw"]')!, 204, 146);
  move(590, 410);
  up(590, 410);
  expect(committed("a")).toEqual({ x: 4, y: 3, w: 2, h: 3 });
});

test("custom resize handles do nothing on tiles that are not resizable", () => {
  const { item, changes } = setup({ resizable: false, renderItem: (id) => <span data-l8-resize="e">{id}</span> }, [{ id: "a", x: 0, y: 0, w: 4, h: 2 }]);
  down(item("a").firstElementChild!, 390, 60);
  move(390 + 2 * STEP_X, 60);
  expect(item("a").hasAttribute("data-l8-active")).toBe(false);
  up(390 + 2 * STEP_X, 60);
  expect(changes).toHaveLength(0);
});

test("a fast resize past the bottom commits the full size", () => {
  const { item, committed } = setup({}, [{ id: "a", x: 0, y: 0, w: 4, h: 2 }]);
  down(item("a").querySelector('[data-l8-resize="se"]')!, 390, 130);
  move(390, 130 + 4 * STEP_Y);
  up(390, 130 + 4 * STEP_Y);
  expect(committed("a")).toEqual({ x: 0, y: 0, w: 4, h: 6 });
});

test("without gravity a tile below the others stays in its row when dragged sideways", () => {
  const { item, committed } = setup({ compaction: "none" }, [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 4, y: 6, w: 4, h: 2 },
  ]);
  down(item("b"), 420, 450);
  move(420 + STEP_X, 450);
  up(420 + STEP_X, 450);
  expect(committed("b")).toMatchObject({ x: 5, y: 6 });
});

test("messages with undefined entries fall back to the defaults", () => {
  const { item, changes } = setup({ messages: { moved: undefined } });
  fireEvent.keyDown(item("a"), { key: "ArrowRight" });
  expect(changes).toHaveLength(1);
});

test("the top edge grows only into free space and stops at the tile above", () => {
  const { item, changes, committed } = setup({ resizeHandles: ["n"], compaction: "none" }, [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 0, y: 4, w: 4, h: 2 },
  ]);
  down(item("b").querySelector('[data-l8-resize="n"]')!, 100, 290);
  move(100, 290 - 4 * STEP_Y);
  up(100, 290 - 4 * STEP_Y);
  expect(committed("b")).toEqual({ x: 0, y: 2, w: 4, h: 4 });
  expect(committed("a")).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  expect(changes).toHaveLength(1);
});
