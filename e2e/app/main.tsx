import { useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { Grid as OldGrid } from "l8grid-v021";
import { Grid, ResponsiveGrid, type GridItem, type GridProps } from "../../src";

declare global {
  interface Window {
    l8: { changes: unknown[]; events: unknown[] };
  }
}

window.l8 = { changes: [], events: [] };
const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "compat";

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Deterministic layout and props per seed, shared by the old and the new version.
export function compatSetup(seed: number): { layout: GridItem[]; props: Partial<GridProps> } {
  const next = random(seed);
  const cols = [6, 12, 24][Math.floor(next() * 3)]!;
  const layout: GridItem[] = [];
  const count = 3 + Math.floor(next() * 8);
  for (let i = 0; i < count; i++) {
    const w = 1 + Math.floor(next() * Math.min(cols, 6));
    layout.push({ id: `i${i}`, x: Math.floor(next() * (cols - w + 1)), y: Math.floor(next() * 10), w, h: 1 + Math.floor(next() * 3), ...(next() < 0.1 ? { static: true } : {}) });
  }
  return {
    layout,
    props: {
      cols,
      rowHeight: [20, 30, 50][Math.floor(next() * 3)],
      gap: [0, 8, 12][Math.floor(next() * 3)],
      compaction: next() < 0.75 ? "vertical" : "none",
      resizeHandles: next() < 0.5 ? ["se"] : ["n", "e", "s", "w", "ne", "nw", "se", "sw"],
    },
  };
}

function Compat({ GridImpl }: { GridImpl: ComponentType<GridProps> }) {
  const { layout: initial, props } = compatSetup(Number(params.get("seed") ?? 1));
  const [layout, setLayout] = useState(initial);
  return (
    <GridImpl
      layout={layout}
      {...props}
      renderItem={(id) => <div className="tile">{id}</div>}
      onLayoutChange={(next, change) => {
        window.l8.changes.push([change, next]);
        setLayout(next);
      }}
    />
  );
}

const FEATURE_LAYOUT: GridItem[] = [
  { id: "a", x: 0, y: 0, w: 4, h: 2 },
  { id: "b", x: 4, y: 0, w: 4, h: 2 },
  { id: "c", x: 0, y: 2, w: 8, h: 2 },
];

function Features() {
  const [layout, setLayout] = useState(FEATURE_LAYOUT);
  const direction = params.get("dir") === "rtl" ? "rtl" : "ltr";
  return (
    <>
      <div className="palette" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", "new")}>
        New tile
      </div>
      <Grid
        layout={layout}
        cols={12}
        rowHeight={40}
        direction={direction}
        keyboard={params.get("keyboard") === "grab" ? "grab" : "instant"}
        droppingItem={{ w: 2, h: 2 }}
        onDrop={(next, item) => {
          window.l8.events.push(["drop", item]);
          setLayout(next.map((other) => (other.id === item.id ? { ...other, id: `new${next.length}` } : other)));
        }}
        renderItem={(id) => <div className="tile">{id}</div>}
        onInteractionStart={(change) => window.l8.events.push(["start", change])}
        onInteractionEnd={(change, committed) => window.l8.events.push(["end", change, committed])}
        onLayoutChange={(next, change) => {
          window.l8.changes.push([change, next]);
          setLayout(next);
        }}
      />
    </>
  );
}

function Responsive() {
  const [layouts, setLayouts] = useState<Record<string, GridItem[]>>({ lg: [{ id: "a", x: 12, y: 0, w: 12, h: 2 }, { id: "b", x: 0, y: 0, w: 12, h: 2 }] });
  return (
    <ResponsiveGrid
      layouts={layouts}
      rowHeight={40}
      renderItem={(id) => <div className="tile">{id}</div>}
      onBreakpointChange={(breakpoint, cols) => window.l8.events.push(["breakpoint", breakpoint, cols])}
      onLayoutsChange={(next) => {
        window.l8.changes.push(next);
        setLayouts(next);
      }}
    />
  );
}

const app =
  mode === "features" ? <Features /> : mode === "responsive" ? <Responsive /> : <Compat GridImpl={params.get("v") === "old" ? (OldGrid as ComponentType<GridProps>) : Grid} />;
createRoot(document.getElementById("root")!).render(app);
