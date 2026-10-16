import { addItem, compactVertical, dragItem, layoutBottom, moveItem, nudgeItem, resolveLayout, type GridItem, type Layout, type LayoutOptions, type Rect } from "./layout";

const vertical: LayoutOptions = { cols: 12, compaction: "vertical" };
const free: LayoutOptions = { cols: 12, compaction: "none" };

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function overlaps(layout: Layout): string | undefined {
  for (let i = 0; i < layout.length; i++)
    for (let j = i + 1; j < layout.length; j++) if (intersects(layout[i]!, layout[j]!)) return `${layout[i]!.id}/${layout[j]!.id}`;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function randomLayout(count: number, cols: number, random: () => number, maxW = 4): GridItem[] {
  const items = Array.from({ length: count }, (_, i) => {
    const w = 1 + Math.floor(random() * maxW);
    return { id: `i${i}`, x: Math.floor(random() * (cols - w + 1)), y: Math.floor(random() * count), w, h: 1 + Math.floor(random() * 3) };
  });
  return resolveLayout(items, { cols, compaction: "vertical" });
}

const at = (layout: Layout, id: string) => {
  const { x, y, w, h } = layout.find((item) => item.id === id)!;
  return { x, y, w, h };
};

test("swaps with the item below once dragged past its midpoint", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 0, y: 2, w: 4, h: 2 },
  ];
  expect(at(moveItem(layout, "a", { y: 1 }, vertical), "a").y).toBe(0);
  const swapped = moveItem(layout, "a", { y: 2 }, vertical);
  expect(at(swapped, "b").y).toBe(0);
  expect(at(swapped, "a").y).toBe(2);
});

test("pushes items down when dragged onto from below", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 0, y: 2, w: 4, h: 2 },
  ];
  const next = moveItem(layout, "b", { y: 0 }, vertical);
  expect(at(next, "b").y).toBe(0);
  expect(at(next, "a").y).toBe(2);
});

test("never moves static items and routes others around them", () => {
  const layout = [
    { id: "s", x: 0, y: 0, w: 12, h: 1, static: true },
    { id: "a", x: 0, y: 1, w: 6, h: 2 },
    { id: "b", x: 6, y: 1, w: 6, h: 2 },
  ];
  const next = moveItem(layout, "a", { x: 0, y: 0 }, vertical);
  expect(at(next, "s")).toEqual({ x: 0, y: 0, w: 12, h: 1 });
  expect(overlaps(next)).toBeUndefined();
});

test("clamps to columns and size constraints", () => {
  const layout = [{ id: "a", x: 0, y: 0, w: 2, h: 2, minW: 2, maxH: 3 }];
  expect(at(moveItem(layout, "a", { x: 50, w: 1, h: 9 }, free), "a")).toEqual({ x: 10, y: 0, w: 2, h: 3 });
});

test("keeps object identity for untouched items", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 6, y: 0, w: 4, h: 2 },
  ];
  const next = moveItem(layout, "a", { x: 1 }, vertical);
  expect(next[1]).toBe(layout[1]);
});

test("fuzz: no overlaps, inside bounds, fully compacted", () => {
  const random = seeded(42);
  for (const compaction of ["vertical", "none"] as const) {
    let layout = randomLayout(60, 12, random);
    for (let step = 0; step < 2000; step++) {
      const item = layout[Math.floor(random() * layout.length)]!;
      const resize = random() < 0.3;
      const target = resize
        ? { w: item.w + Math.round(random() * 4 - 2), h: item.h + Math.round(random() * 2 - 1) }
        : { x: Math.floor(random() * 12), y: Math.floor(random() * 40) };
      layout = moveItem(layout, item.id, target, { cols: 12, compaction });
      expect(overlaps(layout)).toBeUndefined();
      for (const placed of layout) expect(placed.x + placed.w).toBeLessThanOrEqual(12);
      if (compaction === "vertical") expect(compactVertical(layout, 12)).toEqual(layout);
    }
  }
});

test("perf: 1000 items resolve well under a frame", () => {
  const layout = randomLayout(1000, 24, seeded(7));
  const options = { cols: 24, compaction: "vertical" } as const;
  const runs = 200;
  const start = performance.now();
  for (let i = 0; i < runs; i++) moveItem(layout, `i${i % 1000}`, { x: i % 20, y: i % 50 }, options);
  const perRun = (performance.now() - start) / runs;
  console.info(`resolveLayout 1000 items: ${perRun.toFixed(3)} ms`);
  expect(perRun).toBeLessThan(8);
});

test("swaps horizontally into the vacated slot", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 3, h: 2 },
    { id: "b", x: 3, y: 0, w: 3, h: 2 },
    { id: "c", x: 6, y: 0, w: 3, h: 2 },
  ];
  expect(at(moveItem(layout, "a", { x: 1 }, vertical), "b").y).toBe(2);
  const swapped = moveItem(layout, "a", { x: 3 }, vertical);
  expect(at(swapped, "a")).toMatchObject({ x: 3, y: 0 });
  expect(at(swapped, "b")).toMatchObject({ x: 0, y: 0 });
  expect(at(swapped, "c")).toMatchObject({ x: 6, y: 0 });
});

test("displaced items pack into the area the dragged item left", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 3, h: 2 },
    { id: "b", x: 3, y: 0, w: 3, h: 2 },
    { id: "big", x: 6, y: 0, w: 6, h: 4 },
  ];
  const next = moveItem(layout, "big", { x: 0, y: 0 }, vertical);
  expect(at(next, "big")).toMatchObject({ x: 0, y: 0 });
  expect(at(next, "a")).toMatchObject({ x: 6, y: 0 });
  expect(at(next, "b")).toMatchObject({ x: 9, y: 0 });
});

test("y: Infinity appends below everything else", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 6, h: 2 },
    { id: "b", x: 6, y: 0, w: 6, h: 3 },
    { id: "new", x: 0, y: Infinity, w: 4, h: 1 },
    { id: "next", x: 4, y: Infinity, w: 4, h: 1 },
  ];
  const loose = resolveLayout(layout, free);
  expect(at(loose, "new")).toEqual({ x: 0, y: 3, w: 4, h: 1 });
  expect(at(loose, "next")).toEqual({ x: 4, y: 3, w: 4, h: 1 });
  const packed = resolveLayout(layout, vertical);
  expect(at(packed, "new")).toEqual({ x: 0, y: 2, w: 4, h: 1 });
  expect(at(packed, "next")).toEqual({ x: 4, y: 3, w: 4, h: 1 });
  expect(at(moveItem(layout, "a", { y: Infinity }, free), "a").y).toBe(3);
  expect(resolveLayout(JSON.parse(JSON.stringify(layout)), free)).toEqual(loose);
});

test("broken numbers from persisted layouts fall back to sane values", () => {
  const layout = [
    { id: "a", x: Number.NaN, y: 0, w: Number.NaN, h: 2 },
    { id: "b", x: 2, y: Number.NaN, w: 3, h: Number.POSITIVE_INFINITY },
    { id: "c", x: 0, y: -5, w: 99, h: -1 },
  ];
  const next = resolveLayout(layout, free);
  expect(at(next, "a")).toEqual({ x: 0, y: 0, w: 1, h: 2 });
  expect(at(next, "b")).toEqual({ x: 2, y: 3, w: 3, h: 1 });
  expect(at(next, "c")).toEqual({ x: 0, y: 2, w: 12, h: 1 });
  expect(overlaps(next)).toBeUndefined();
});

test("compactVertical sanitizes broken input instead of hanging", () => {
  const next = compactVertical(
    [
      { id: "a", x: 0, y: Infinity, w: 2, h: 1 },
      { id: "b", x: 0, y: Number.NaN, w: 2, h: 1 },
      { id: "s", x: 0, y: Infinity, w: 12, h: 1, static: true },
    ],
    12,
  );
  expect(next.map(({ y }) => y)).toEqual([1, 2, 0]);
});

const dashboard: GridItem[] = [
  { id: "header", x: 0, y: 0, w: 12, h: 1, static: true },
  { id: "revenue", x: 0, y: 1, w: 3, h: 2 },
  { id: "orders", x: 3, y: 1, w: 3, h: 2 },
  { id: "margin", x: 6, y: 1, w: 3, h: 2 },
  { id: "churn", x: 9, y: 1, w: 3, h: 2 },
  { id: "region", x: 0, y: 3, w: 7, h: 5 },
  { id: "mix", x: 7, y: 3, w: 5, h: 5 },
];

const moved = (before: Layout, after: Layout) => after.filter((item, i) => item !== before[i]).map(({ id }) => id);

test("a sideways drag never pushes the neighbour down and swaps once it is more than halfway over it", () => {
  const drag = dragItem(dashboard, "churn", vertical);
  for (const x of [8.6, 8, 7.5]) expect(drag(x, 1.3)).toBe(dashboard);
  const swapped = drag(7, 1);
  expect(at(swapped, "churn")).toMatchObject({ x: 6, y: 1 });
  expect(at(swapped, "margin")).toMatchObject({ x: 9, y: 1 });
  expect(moved(dashboard, swapped)).toEqual(["margin", "churn"]);
  expect(drag(7, 1)).toBe(swapped);
});

test("slides into free space first and takes a neighbour's place only when mostly over it", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 3, h: 2 },
    { id: "b", x: 3, y: 0, w: 3, h: 2 },
    { id: "d", x: 9, y: 0, w: 3, h: 2 },
  ];
  const drag = dragItem(layout, "d", vertical);
  expect(at(drag(7.6, 0), "d")).toMatchObject({ x: 8, y: 0 });
  const free = drag(4.5, 0);
  expect(at(free, "d")).toMatchObject({ x: 6, y: 0 });
  expect(moved(layout, free)).toEqual(["d"]);
  const taken = drag(3.2, 0);
  expect(at(taken, "d")).toMatchObject({ x: 3, y: 0 });
  expect(at(taken, "b").y).toBe(0);
});

test("tiles of different widths trade places instead of dropping out of the row", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 6, h: 2 },
    { id: "w", x: 6, y: 0, w: 4, h: 2 },
    { id: "d", x: 10, y: 0, w: 2, h: 2 },
  ];
  const drag = dragItem(layout, "d", vertical);
  for (const x of [9, 8, 7.6]) expect(drag(x, 0)).toBe(layout);
  const swapped = drag(7, 0);
  expect(at(swapped, "d")).toMatchObject({ x: 6, y: 0 });
  expect(at(swapped, "w")).toMatchObject({ x: 8, y: 0 });
});

test("addItem fills the first gap that fits instead of appending at the bottom", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 8, y: 0, w: 4, h: 2 },
    { id: "c", x: 0, y: 2, w: 12, h: 2 },
  ];
  expect(at(addItem(layout, { id: "n", w: 4, h: 2 }, vertical), "n")).toEqual({ x: 4, y: 0, w: 4, h: 2 });
  expect(at(addItem(layout, { id: "n", w: 6, h: 1 }, vertical), "n")).toEqual({ x: 0, y: 4, w: 6, h: 1 });
});

test("a pointer jittering around the swap point does not flip the layout back and forth", () => {
  const drag = dragItem(dashboard, "churn", vertical);
  const results = new Set(Array.from({ length: 12 }, (_, i) => drag(i % 2 ? 7.45 : 7.55, 1)));
  expect(results.size).toBe(2);
});

test("a large tile can be dragged above a row of smaller ones", () => {
  const next = dragItem(dashboard, "region", vertical)(0, 0);
  expect(at(next, "region")).toMatchObject({ x: 0, y: 1 });
  expect(at(next, "revenue").y).toBeGreaterThanOrEqual(6);
  expect(nudgeItem(dashboard, "region", { y: -1 }, vertical)).toEqual(next);
});

test("arrow keys keep the tile in its column", () => {
  for (const id of ["revenue", "orders", "margin", "churn"]) {
    const before = at(dashboard, id);
    expect(at(nudgeItem(dashboard, id, { y: 1 }, vertical)!, id)).toMatchObject({ x: before.x, y: 8 });
  }
});

test("dragging into another row inserts there and pushes that column down", () => {
  const drag = dragItem(dashboard, "margin", vertical);
  expect(at(drag(0, 2), "margin")).toMatchObject({ x: 0, y: 1 });
  const inserted = drag(0, 2.8);
  expect(at(inserted, "margin")).toMatchObject({ x: 0, y: 3 });
  expect(at(inserted, "region")).toMatchObject({ x: 0, y: 5 });
  expect(at(inserted, "revenue")).toMatchObject({ x: 0, y: 1 });
});

test("fuzz: fractional drags stay valid and never push tiles down while moving sideways", () => {
  const random = seeded(11);
  for (const [cols, maxW] of [
    [12, 4],
    [60, 20],
  ] as const)
    for (const compaction of ["vertical", "none"] as const) {
      const options = { cols, compaction };
      let layout = randomLayout(40, cols, random, maxW);
      for (let step = 0; step < 400; step++) {
        const item = layout[Math.floor(random() * layout.length)]!;
        const sideways = random() < 0.5;
        const fx = random() * (cols - item.w);
        const fy = Math.max(0, sideways ? item.y + (random() - 0.5) * 0.98 * item.h : item.y + (random() - 0.5) * 12);
        const drag = dragItem(layout, item.id, options);
        const steps = 1 + Math.floor(random() * 8);
        let next = layout;
        for (let i = 1; i <= steps; i++) {
          next = drag(item.x + ((fx - item.x) * i) / steps, item.y + ((fy - item.y) * i) / steps);
          expect(overlaps(next)).toBeUndefined();
          for (const placed of next) expect(placed.x + placed.w).toBeLessThanOrEqual(cols);
          if (compaction === "vertical") expect(compactVertical(next, cols)).toEqual(next);
          if (sideways)
            for (let j = 0; j < next.length; j++) {
              const before = layout[j]!;
              const after = next[j]!;
              if (before !== item) expect(after.y + after.h).toBeLessThanOrEqual(Math.max(before.y + before.h, item.y + item.h));
            }
        }
        layout = next;
      }
    }
});

test("a taller neighbour never swaps into a sideways-dragged tile's slot if it would stick out below", () => {
  const layout = [
    { id: "i0", x: 0, y: 5, w: 1, h: 1 },
    { id: "i1", x: 3, y: 0, w: 2, h: 1 },
    { id: "i2", x: 2, y: 3, w: 2, h: 3 },
    { id: "i3", x: 0, y: 2, w: 1, h: 3 },
    { id: "i4", x: 1, y: 2, w: 2, h: 1 },
  ];
  const next = dragItem(layout, "i0", { cols: 6, compaction: "none" })(1.92, 4.61);
  const { y, h } = at(next, "i2");
  expect(y + h).toBeLessThanOrEqual(6);
});

test("persisted garbage with huge coordinates is clamped instead of exhausting memory", () => {
  const next = resolveLayout(
    [
      { id: "a", x: 0, y: 1e12, w: 2, h: 1e12 },
      { id: "b", x: 0, y: 0, w: 2, h: 1 },
    ],
    vertical,
  );
  expect(at(next, "a")).toEqual({ x: 0, y: 1, w: 2, h: 2 ** 16 });
});

test("perf: a drag across 1000 items stays well under a frame", () => {
  const layout = randomLayout(1000, 24, seeded(5));
  const options = { cols: 24, compaction: "vertical" } as const;
  const item = layout[500]!;
  const drag = dragItem(layout, item.id, options);
  const frames = 240;
  const start = performance.now();
  for (let i = 0; i < frames; i++) drag(Math.max(0, Math.min(24 - item.w, item.x + Math.sin(i / 15) * 8)), Math.max(0, item.y - 12 + i * 0.1));
  const perFrame = (performance.now() - start) / frames;
  console.info(`dragItem 1000 items: ${perFrame.toFixed(3)} ms per frame`);
  expect(perFrame).toBeLessThan(8);
});

test("nudge moves one slot and reports no-ops as undefined", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 0, y: 2, w: 4, h: 3 },
    { id: "c", x: 4, y: 0, w: 4, h: 1, minH: 1, maxH: 2 },
  ];
  const down = nudgeItem(layout, "a", { y: 1 }, vertical)!;
  expect(at(down, "a").y).toBe(3);
  expect(at(down, "b").y).toBe(0);
  expect(nudgeItem(layout, "b", { y: 1 }, vertical)).toBeUndefined();
  expect(nudgeItem(layout, "a", { y: -1 }, vertical)).toBeUndefined();
  expect(at(nudgeItem(layout, "b", { y: 1 }, free)!, "b").y).toBe(3);
  expect(at(nudgeItem(layout, "c", { h: 1 }, vertical)!, "c").h).toBe(2);
  expect(nudgeItem(layout, "c", { h: -1 }, vertical)).toBeUndefined();
  expect(nudgeItem(layout, "missing", { x: 1 }, vertical)).toBeUndefined();
  const right = nudgeItem(layout, "a", { x: 1 }, vertical)!;
  expect(at(right, "a")).toMatchObject({ x: 4, y: 0 });
  expect(at(right, "c")).toMatchObject({ x: 0, y: 0 });
  expect(at(right, "b").y).toBe(1);
  expect(nudgeItem([{ id: "e", x: 10, y: 0, w: 2, h: 2 }], "e", { w: 1 }, vertical)).toBeUndefined();
});

test("broken size limits and duplicate ids never produce overlaps", () => {
  const next = resolveLayout(
    [
      { id: "a", x: 0, y: 0, w: 2, h: 2, maxH: Number.NaN, maxW: 0 },
      { id: "b", x: 0, y: 1, w: 2, h: 2 },
    ],
    vertical,
  );
  expect(at(next, "a")).toEqual({ x: 0, y: 0, w: 1, h: 2 });
  expect(overlaps(next)).toBeUndefined();
  const twins = moveItem(
    [
      { id: "a", x: 0, y: 0, w: 2, h: 1 },
      { id: "a", x: 2, y: 0, w: 2, h: 1 },
    ],
    "a",
    { x: 6 },
    vertical,
  );
  expect(overlaps(twins)).toBeUndefined();
});

test("perf: nudging the lowest of 1000 items stays instant", () => {
  const layout = randomLayout(1000, 12, seeded(3));
  const lowest = layout.reduce((a, b) => (b.y + b.h > a.y + a.h ? b : a));
  const start = performance.now();
  expect(nudgeItem(layout, lowest.id, { y: 1 }, vertical)).toBeUndefined();
  const elapsed = performance.now() - start;
  console.info(`nudge 1000 items, bottom ${layoutBottom(layout)}: ${elapsed.toFixed(2)} ms`);
  expect(elapsed).toBeLessThan(50);
});

const wide: LayoutOptions = { cols: 60, compaction: "vertical" };

const row = (widths: number[], h: number): GridItem[] => {
  let x = 0;
  return widths.map((w, i) => ({ id: `k${i}`, x: (x += w) - w, y: 0, w, h }));
};

const spots = (layout: Layout) => layout.map(({ id, x, y }) => ({ id, x, y }));

function sweep(drag: (x: number, y: number) => GridItem[], from: number, to: number, y: number, visit?: (next: GridItem[], fx: number) => void): GridItem[] {
  const step = from < to ? 0.25 : -0.25;
  let next!: GridItem[];
  for (let i = 0; i <= Math.abs(to - from) / 0.25; i++) {
    const fx = from + i * step;
    next = drag(fx, y);
    visit?.(next, fx);
  }
  return next;
}

test("a lone tile reaches both edges", () => {
  const layout = [{ id: "a", x: 0, y: 0, w: 30, h: 8 }];
  const drag = dragItem(layout, "a", wide);
  expect(at(sweep(drag, 0, 30, 0), "a").x).toBe(30);
  expect(at(sweep(drag, 30, 0, 0), "a").x).toBe(0);
});

test("in free space the placeholder stays within a column of the pointer whatever the tile size", () => {
  for (const w of [4, 8, 20, 30]) {
    const drag = dragItem([{ id: "a", x: 0, y: 0, w, h: 4 }], "a", wide);
    const follows = (next: GridItem[], fx: number) => expect(Math.abs(at(next, "a").x - Math.round(fx))).toBeLessThanOrEqual(1);
    sweep(drag, 0, 60 - w, 0, follows);
    sweep(drag, 60 - w, 0, 0, follows);
  }
});

test("dragging along a row of mixed widths shifts the crossed tiles like a sortable list", () => {
  const layout = row([9, 9, 9, 9, 8, 8, 8], 3);
  const drag = dragItem(layout, "k0", wide);
  const right = sweep(drag, 0, 51, 0);
  expect(spots(right)).toEqual([0, 9, 18, 27, 35, 43].map((x, i) => ({ id: `k${i + 1}`, x, y: 0 })).concat({ id: "k0", x: 51, y: 0 }).sort((a, b) => a.id.localeCompare(b.id)));
  let nudged: GridItem[] = layout;
  for (let i = 0; i < 6; i++) nudged = nudgeItem(nudged, "k0", { x: 1 }, wide)!;
  expect(spots(right)).toEqual(spots(nudged));
  expect(spots(dragItem(layout, "k0", wide)(100, 0))).toEqual(spots(right));
  expect(spots(sweep(drag, 51, 0, 0))).toEqual(spots(layout));
});

test("a tile reaches the free columns at the end of a full row", () => {
  const next = sweep(dragItem(row([8, 8, 8, 8, 8, 8, 8], 3), "k0", wide), 0, 52, 0);
  expect(at(next, "k0").x).toBe(52);
  expect(next.every(({ y }) => y === 0)).toBe(true);
});

test("a tile crosses neighbours of different sizes up to the edge", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 20, h: 8 },
    { id: "b", x: 20, y: 0, w: 30, h: 12 },
    { id: "c", x: 50, y: 0, w: 10, h: 4 },
    { id: "d", x: 0, y: 12, w: 60, h: 8 },
  ];
  const next = sweep(dragItem(layout, "a", wide), 0, 40, 0);
  expect(at(next, "a")).toMatchObject({ x: 40, y: 0 });
  expect(at(next, "b").y).toBe(0);
  expect(at(next, "c").y).toBe(0);
  expect(overlaps(next)).toBeUndefined();
  expect(at(next, "d").y).toBeGreaterThanOrEqual(12);
});

test("a tile in a lower row follows the pointer to the edge even if that leaves a gap", () => {
  const layout = [
    { id: "a", x: 0, y: 0, w: 20, h: 8 },
    { id: "b", x: 20, y: 0, w: 20, h: 8 },
    { id: "c", x: 0, y: 8, w: 30, h: 8 },
  ];
  expect(at(sweep(dragItem(layout, "c", wide), 0, 30, 8), "c")).toMatchObject({ x: 30, y: 8 });
});

test("a tile dragged past the top edge goes up to the first row when nothing has to be pushed down", () => {
  const layout = [
    { id: "wide", x: 0, y: 0, w: 6, h: 1 },
    { id: "a", x: 0, y: 1, w: 4, h: 2 },
  ];
  const next = dragItem(layout, "a", vertical)(0, 0);
  expect(at(next, "a")).toMatchObject({ x: 0, y: 0 });
  expect(at(next, "wide")).toMatchObject({ x: 0, y: 2 });
  expect(nudgeItem(layout, "a", { y: -1 }, vertical)).toEqual(next);
});
