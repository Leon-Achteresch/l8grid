import { act, cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useState } from "react";
import {
  getBreakpoint,
  Grid,
  layoutForBreakpoint,
  ResponsiveGrid,
  useGrid,
  useGridItem,
  useLayoutHistory,
  type GridChange,
  type GridItem,
  type GridProps,
  type Layout,
} from ".";

const initial: GridItem[] = [
  { id: "a", x: 0, y: 0, w: 4, h: 2 },
  { id: "b", x: 4, y: 0, w: 4, h: 2 },
  { id: "c", x: 0, y: 2, w: 8, h: 1 },
];

const STEP_X = 101;
const STEP_Y = 72;
let gridWidth = 1200;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("l8-grid") ? gridWidth : 0;
    },
  });
  Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
});

beforeEach(() => {
  gridWidth = 1200;
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function setup(props: Partial<GridProps> = {}, layout: GridItem[] = initial) {
  const changes: GridItem[][] = [];
  const events: unknown[] = [];
  function Harness(extra: Partial<GridProps>) {
    const [state, set] = useState(layout);
    return (
      <Grid
        layout={state}
        cols={12}
        rowHeight={60}
        renderItem={(id) => <div data-testid={id}>{id}</div>}
        onLayoutChange={(next, change) => {
          changes.push(next);
          events.push(["commit", change]);
          set(next);
        }}
        onInteractionStart={(change) => events.push(["start", change])}
        onPreviewChange={(_, change) => events.push(["preview", change])}
        onInteractionEnd={(change, committed) => events.push(["end", change, committed])}
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
  const live = () => {
    frame();
    return view.container.querySelector(".l8-sr")!.textContent;
  };
  return { view, Harness, item, committed, changes, events, live };
}

const pointer = (x: number, y: number) => ({ pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", clientX: x, clientY: y });
const root = () => document.querySelector<HTMLElement>(".l8-grid")!;
const down = (target: Element, x: number, y: number) => fireEvent.pointerDown(target, pointer(x, y));
const up = (x: number, y: number) => fireEvent.pointerUp(root(), pointer(x, y));
function frame() {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}
function move(x: number, y: number) {
  fireEvent.pointerMove(root(), pointer(x, y));
  frame();
}
const key = (target: Element, name: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { key: name, ...init });

describe("interaction callbacks", () => {
  test("a drag reports start, preview changes and end", () => {
    const { item, events } = setup();
    down(item("a"), 20, 20);
    move(20 + 4 * STEP_X, 20);
    up(20 + 4 * STEP_X, 20);
    expect(events).toEqual([
      ["start", { id: "a", kind: "move" }],
      ["preview", { id: "a", kind: "move" }],
      ["commit", { id: "a", kind: "move" }],
      ["end", { id: "a", kind: "move" }, true],
    ]);
  });

  test("a cancelled drag ends without commit and a click is no interaction", () => {
    const { item, events } = setup();
    down(item("a"), 20, 20);
    up(20, 20);
    expect(events).toEqual([]);
    down(item("a"), 20, 20);
    move(20 + 4 * STEP_X, 20);
    key(item("a"), "Escape");
    up(20 + 4 * STEP_X, 20);
    expect(events.at(-1)).toEqual(["end", { id: "a", kind: "move" }, false]);
    expect((events as [string][]).some(([type]) => type === "commit")).toBe(false);
  });

  test("a resize reports kind resize", () => {
    const { item, events } = setup();
    down(item("b").querySelector("[data-l8-resize]")!, 790, 128);
    move(790 + STEP_X, 128);
    up(790 + STEP_X, 128);
    expect(events[0]).toEqual(["start", { id: "b", kind: "resize" }]);
    expect(events.at(-1)).toEqual(["end", { id: "b", kind: "resize" }, true]);
  });
});

describe("maxRows", () => {
  test("resizing past the limit stops at the limit", () => {
    const { item, committed } = setup({ maxRows: 4 });
    down(item("b").querySelector("[data-l8-resize]")!, 790, 128);
    move(790, 128 + 5 * STEP_Y);
    up(790, 128 + 5 * STEP_Y);
    // b may grow to 3 rows, c (1 row) below it stays within 4 rows
    expect(committed("b").h).toBe(3);
  });

  test("keyboard steps that grow the layout past the limit are refused", () => {
    const { item, changes } = setup({ maxRows: 3 });
    key(item("a"), "ArrowDown", { shiftKey: true });
    expect(changes).toHaveLength(0);
  });

  test("an already taller layout is not changed by the limit", () => {
    const { item, committed } = setup({ maxRows: 1 });
    key(item("a"), "ArrowRight");
    expect(committed("a")).toMatchObject({ x: 4, y: 0 });
  });
});

describe("preventCollision", () => {
  test("a drag over a neighbour does not push it", () => {
    const { item, changes } = setup({ preventCollision: true, compaction: "none" });
    down(item("c"), 20, 2 * STEP_Y + 20);
    move(20, 20);
    up(20, 20);
    expect(changes).toHaveLength(0);
  });

  test("keyboard moves into other items are refused, moves into free space work", () => {
    const { item, changes, committed } = setup({ preventCollision: true });
    key(item("a"), "ArrowRight");
    expect(changes).toHaveLength(0);
    key(item("b"), "ArrowRight");
    expect(committed("b")).toMatchObject({ x: 5, y: 0 });
  });
});

describe("allowOverlap", () => {
  test("items overlap instead of being pushed", () => {
    const { item, committed } = setup({ allowOverlap: true });
    down(item("a"), 20, 20);
    move(20 + 2 * STEP_X, 20);
    up(20 + 2 * STEP_X, 20);
    expect(committed("a")).toEqual({ x: 2, y: 0, w: 4, h: 2 });
    expect(committed("b")).toEqual({ x: 4, y: 0, w: 4, h: 2 });
  });

  test("keyboard moves by one cell and keeps others in place", () => {
    const { item, committed } = setup({ allowOverlap: true });
    key(item("c"), "ArrowUp");
    expect(committed("c")).toEqual({ x: 0, y: 1, w: 8, h: 1 });
    expect(committed("a")).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });

  test("gaps are not compacted", () => {
    const { item, committed } = setup({ allowOverlap: true }, [{ id: "a", x: 0, y: 5, w: 2, h: 2 }]);
    key(item("a"), "ArrowRight");
    expect(committed("a")).toEqual({ x: 1, y: 5, w: 2, h: 2 });
  });
});

describe("direction rtl", () => {
  test("column 0 is on the right", () => {
    const { item, view } = setup({ direction: "rtl" });
    // width 1200, a spans 4 columns: 4 * 89 + 3 * 12 = 392
    expect(item("a").style.transform).toBe(`translate3d(${1200 - 392}px,0px,0)`);
    expect(view.container.querySelector(".l8-grid")!.hasAttribute("data-l8-rtl")).toBe(true);
  });

  test("dragging to the left moves to higher columns", () => {
    const { item, committed } = setup({ direction: "rtl" });
    down(item("a"), 1180, 20);
    move(1180 - 4 * STEP_X, 20);
    up(1180 - 4 * STEP_X, 20);
    expect(committed("a")).toMatchObject({ x: 4, y: 0 });
  });

  test("arrow left moves towards the end of the row", () => {
    const { item, committed } = setup({ direction: "rtl" });
    key(item("a"), "ArrowLeft");
    expect(committed("a")).toMatchObject({ x: 4 });
  });

  test("the visual right edge handle resizes from the start edge", () => {
    const { item, committed } = setup({ direction: "rtl", resizeHandles: ["e"] }, [{ id: "a", x: 2, y: 0, w: 4, h: 2 }]);
    // a occupies x 2..5, physically from 1200 - 6 * 101 + 12 = 606 to 1200 - 2 * 101 = 998
    down(item("a").querySelector('[data-l8-resize="e"]')!, 996, 20);
    move(996 + STEP_X, 20);
    up(996 + STEP_X, 20);
    expect(committed("a")).toEqual({ x: 1, y: 0, w: 5, h: 2 });
  });
});

describe("keyboard grab mode", () => {
  test("space picks up, arrows preview, enter drops and commits once", () => {
    const { item, changes, committed, live, events } = setup({ keyboard: "grab", getItemLabel: (id) => `Tile ${id}` });
    expect(key(item("a"), "ArrowRight")).toBe(true);
    expect(changes).toHaveLength(0);
    expect(key(item("a"), " ")).toBe(false);
    expect(item("a").hasAttribute("data-l8-grabbed")).toBe(true);
    expect(live()).toBe("Tile a picked up at column 1, row 1.");
    key(item("a"), "ArrowRight");
    expect(changes).toHaveLength(0);
    expect(item("a").style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
    expect(live()).toBe("Tile a: column 5, row 1, 4 × 2");
    key(item("a"), "Enter");
    expect(changes).toHaveLength(1);
    expect(committed("a")).toMatchObject({ x: 4, y: 0 });
    expect(item("a").hasAttribute("data-l8-grabbed")).toBe(false);
    expect(live()).toBe("Tile a dropped: column 5, row 1, 4 × 2");
    expect((events as [string][]).map(([type]) => type)).toEqual(["start", "preview", "commit", "end"]);
  });

  test("escape restores the layout", () => {
    const { item, changes, live } = setup({ keyboard: "grab" });
    key(item("a"), "Enter");
    key(item("a"), "ArrowRight");
    key(item("a"), "Escape");
    expect(changes).toHaveLength(0);
    expect(item("a").style.transform).toBe("translate3d(0px,0px,0)");
    expect(live()).toBe("a: cancelled, back at column 1, row 1.");
  });

  test("losing focus cancels", () => {
    const { item, changes } = setup({ keyboard: "grab" });
    key(item("a"), " ");
    key(item("a"), "ArrowRight");
    fireEvent.focusOut(item("a"));
    key(item("a"), "Enter");
    expect(item("a").hasAttribute("data-l8-grabbed")).toBe(true);
    key(item("a"), "Enter");
    expect(changes).toHaveLength(0);
  });

  test("shift + arrows resize while grabbed and blocked steps are announced", () => {
    const { item, committed, live } = setup({ keyboard: "grab" });
    key(item("a"), " ");
    key(item("a"), "ArrowLeft");
    expect(live()).toBe("a cannot go further in that direction.");
    key(item("a"), "ArrowDown", { shiftKey: true });
    key(item("a"), " ");
    expect(committed("a")).toMatchObject({ w: 4, h: 3 });
  });

  test("uses grab instructions and localized messages", () => {
    const { view, item, live } = setup({ keyboard: "grab", messages: { grabInstructions: "Leertaste", grabbed: (label) => `${label} aufgenommen` } });
    expect(view.container.querySelector("[hidden]")!.textContent).toBe("Leertaste");
    key(item("b"), " ");
    expect(live()).toBe("b aufgenommen");
  });
});

test("in instant mode a blocked step is announced only with a message for it", () => {
  const first = setup();
  key(first.item("a"), "ArrowLeft");
  expect(first.live()).toBe("");
  cleanup();
  const second = setup({ messages: { blocked: (label) => `${label} blockiert` } });
  key(second.item("a"), "ArrowLeft");
  expect(second.live()).toBe("a blockiert");
});

describe("dropping from outside", () => {
  const dragEvent = (type: "dragOver" | "drop" | "dragLeave", x: number, y: number) => {
    const event = createEvent[type](root(), { clientX: x, clientY: y });
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
    fireEvent(root(), event);
    return event;
  };

  test("without onDrop nothing happens", () => {
    setup();
    expect(dragEvent("dragOver", 20, 20).defaultPrevented).toBe(false);
  });

  test("previews the item under the pointer and reports the drop", () => {
    const onDrop = vi.fn();
    const { item, view } = setup({ onDrop, droppingItem: { id: "new", w: 2, h: 2 } });
    const over = dragEvent("dragOver", 20 + 4 * STEP_X, 20);
    expect(over.defaultPrevented).toBe(true);
    expect(root().hasAttribute("data-l8-dropping")).toBe(true);
    expect(view.container.querySelector(".l8-placeholder")!.hasAttribute("data-l8-visible")).toBe(true);
    // b is pushed below the new item
    expect(item("b").style.transform).toBe(`translate3d(${4 * STEP_X}px,${2 * STEP_Y}px,0)`);
    dragEvent("drop", 20 + 4 * STEP_X, 20);
    expect(onDrop).toHaveBeenCalledTimes(1);
    const [layout, dropped] = onDrop.mock.calls[0]!;
    expect(dropped).toMatchObject({ id: "new", x: 3, y: 0, w: 2, h: 2 });
    expect(layout).toContainEqual(dropped);
    expect(root().hasAttribute("data-l8-dropping")).toBe(false);
    expect(item("b").style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
  });

  test("leaving restores the layout and droppingItem can refuse", () => {
    const { item } = setup({ onDrop: () => {}, droppingItem: (event) => event.clientX > 600 && { w: 2, h: 2 } });
    expect(dragEvent("dragOver", 20, 20).defaultPrevented).toBe(false);
    dragEvent("dragOver", 700, 20);
    expect(item("b").style.transform).not.toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
    dragEvent("dragLeave", 700, 20);
    expect(item("b").style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
  });
});

test("useGridItem re-renders only the tile that changed", () => {
  const renders: Record<string, number> = {};
  function Size() {
    const item = useGridItem()!;
    renders[item.id] = (renders[item.id] ?? 0) + 1;
    return <span className="size">{`${item.x},${item.y},${item.w}x${item.h}`}</span>;
  }
  const { item } = setup({ renderItem: () => <Size /> });
  expect(item("b").textContent).toBe("4,0,4x2");
  const before = { ...renders };
  key(item("b"), "ArrowDown", { shiftKey: true });
  expect(item("b").textContent).toBe("4,0,4x3");
  expect(renders.a).toBe(before.a);
  expect(renders.b).toBeGreaterThan(before.b!);
});

describe("server rendering", () => {
  test("renders pre-mount positions as custom properties", () => {
    const html = renderToString(<Grid layout={initial} cols={12} rowHeight={60} renderItem={(id) => id} onLayoutChange={() => {}} />);
    expect(html).toContain("--l8-cols:12;--l8-gap:12px;--l8-row-height:60px;--l8-rows:3");
    expect(html).toContain('data-l8-id="c"');
    expect(html).toContain("--l8-x:0;--l8-y:2;--l8-w:8;--l8-h:1");
    expect(html).not.toContain("data-l8-ready");
  });

  test("the grid marks itself ready on mount", () => {
    setup();
    expect(root().hasAttribute("data-l8-ready")).toBe(true);
  });

  test("user styles win over the pre-mount variables", () => {
    setup({ style: { "--l8-gap": "3px", color: "red" } as React.CSSProperties });
    expect(root().style.getPropertyValue("--l8-gap")).toBe("3px");
    expect(root().style.color).toBe("red");
  });
});

describe("ResponsiveGrid", () => {
  const layouts = { lg: [{ id: "a", x: 12, y: 0, w: 12, h: 2 }] };

  test("breakpoints follow the container width", () => {
    expect(getBreakpoint({ lg: 1200, sm: 600, xs: 0 }, 1300)).toBe("lg");
    expect(getBreakpoint({ lg: 1200, sm: 600, xs: 0 }, 700)).toBe("sm");
    expect(getBreakpoint({ lg: 1200, sm: 600 }, 100)).toBe("sm");
  });

  test("missing layouts are derived from the nearest larger breakpoint and scaled", () => {
    expect(layoutForBreakpoint(layouts, "sm")).toEqual([{ id: "a", x: 6, y: 0, w: 6, h: 2 }]);
    expect(layoutForBreakpoint(layouts, "lg")).toBe(layouts.lg);
    expect(layoutForBreakpoint({ xs: [{ id: "a", x: 0, y: 0, w: 4, h: 1 }] }, "lg")).toEqual([{ id: "a", x: 0, y: 0, w: 12, h: 1 }]);
    expect(layoutForBreakpoint({}, "lg")).toEqual([]);
  });

  test("renders the layout for the measured width and stores changes per breakpoint", () => {
    gridWidth = 800;
    const onLayoutsChange = vi.fn();
    const onBreakpointChange = vi.fn();
    const view = render(
      <ResponsiveGrid layouts={layouts} onLayoutsChange={onLayoutsChange} onBreakpointChange={onBreakpointChange} rowHeight={60} renderItem={(id) => id} />,
    );
    const a = view.container.querySelector<HTMLElement>('[data-l8-id="a"]')!;
    // sm: 12 columns over 800px, gap 12: column 56.33, step 68.33; a at x 6
    expect(a.style.transform).toBe(`translate3d(${6 * ((800 - 132) / 12 + 12)}px,0px,0)`);
    expect(onBreakpointChange).toHaveBeenCalledWith("sm", 12);
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(onLayoutsChange).toHaveBeenCalledWith({ lg: layouts.lg, sm: [{ id: "a", x: 5, y: 0, w: 6, h: 2 }] }, { id: "a", kind: "move", breakpoint: "sm" });
  });
});

test("useLayoutHistory undoes and redoes changes", () => {
  let history!: ReturnType<typeof useLayoutHistory<Layout>>;
  function App() {
    history = useLayoutHistory<Layout>(initial);
    return <Grid layout={history.layout} onLayoutChange={history.onLayoutChange} cols={12} rowHeight={60} renderItem={(id) => id} />;
  }
  const view = render(<App />);
  const a = view.container.querySelector<HTMLElement>('[data-l8-id="a"]')!;
  expect(history.canUndo).toBe(false);
  fireEvent.keyDown(a, { key: "ArrowRight" });
  expect(history.layout.find((item) => item.id === "a")).toMatchObject({ x: 4 });
  act(() => history.undo());
  expect(history.layout).toBe(initial);
  expect(a.style.transform).toBe("translate3d(0px,0px,0)");
  expect(history.canRedo).toBe(true);
  act(() => history.redo());
  expect(history.layout.find((item) => item.id === "a")).toMatchObject({ x: 4 });
  act(() => history.reset(initial));
  expect(history.canUndo).toBe(false);
});

test("useGrid drives custom markup", () => {
  const changes: GridChange[] = [];
  function Custom() {
    const [layout, setLayout] = useState<Layout>(initial);
    const { rootRef, placeholderRef, itemRef } = useGrid<HTMLUListElement, HTMLLIElement>({
      layout,
      cols: 12,
      rowHeight: 60,
      onLayoutChange: (next, change) => {
        changes.push(change);
        setLayout(next);
      },
    });
    return (
      <ul ref={rootRef} className="l8-grid">
        {layout.map((item) => (
          <li key={item.id} ref={itemRef(item.id)} className="l8-item" data-l8-id={item.id} tabIndex={0}>
            {item.id}
          </li>
        ))}
        <li ref={placeholderRef} className="l8-placeholder" />
      </ul>
    );
  }
  const view = render(<Custom />);
  const a = view.container.querySelector<HTMLElement>('[data-l8-id="a"]')!;
  expect(a.style.transform).toBe("translate3d(0px,0px,0)");
  fireEvent.keyDown(a, { key: "ArrowRight" });
  expect(changes).toEqual([{ id: "a", kind: "move" }]);
  expect(a.style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
});

test("hydrating server-rendered markup does not warn", async () => {
  const { hydrateRoot } = await import("react-dom/client");
  const element = <Grid layout={initial} cols={12} rowHeight={60} renderItem={(id) => <b>{id}</b>} onLayoutChange={() => {}} />;
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const recoverable = vi.fn();
  let rootHandle!: ReturnType<typeof hydrateRoot>;
  act(() => {
    rootHandle = hydrateRoot(container, element, { onRecoverableError: recoverable });
  });
  expect(error).not.toHaveBeenCalled();
  expect(recoverable).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLElement>('[data-l8-id="b"]')!.style.transform).toBe(`translate3d(${4 * STEP_X}px,0px,0)`);
  error.mockRestore();
  act(() => rootHandle.unmount());
  container.remove();
});
