import { StrictMode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { addItem, Grid, ResponsiveGrid, useGridItem, useLayoutHistory, type Compaction, type GridItem, type ResizeHandle } from "../src";
import "./style.css";

type Kind = "kpi" | "bars" | "line" | "table" | "text" | "donut";

interface Tile {
  title: string;
  kind: Kind;
  seed: number;
}

const DASHBOARD: [GridItem, Tile][] = [
  [{ id: "header", x: 0, y: 0, w: 24, h: 2, static: true }, { title: "Sales Overview · Q3", kind: "text", seed: 0 }],
  [{ id: "revenue", x: 0, y: 2, w: 6, h: 4 }, { title: "Revenue", kind: "kpi", seed: 1 }],
  [{ id: "orders", x: 6, y: 2, w: 6, h: 4 }, { title: "Orders", kind: "kpi", seed: 2 }],
  [{ id: "margin", x: 12, y: 2, w: 6, h: 4 }, { title: "Margin", kind: "kpi", seed: 3 }],
  [{ id: "churn", x: 18, y: 2, w: 6, h: 4 }, { title: "Churn", kind: "kpi", seed: 4 }],
  [{ id: "region", x: 0, y: 6, w: 14, h: 10, minW: 6, minH: 6 }, { title: "Revenue by Region", kind: "bars", seed: 5 }],
  [{ id: "mix", x: 14, y: 6, w: 10, h: 10, minW: 4, minH: 6 }, { title: "Product Mix", kind: "donut", seed: 6 }],
  [{ id: "trend", x: 0, y: 16, w: 16, h: 8, minW: 6, minH: 4 }, { title: "Weekly Trend", kind: "line", seed: 7 }],
  [{ id: "top", x: 16, y: 16, w: 8, h: 8, minW: 6, minH: 4 }, { title: "Top Accounts", kind: "table", seed: 8 }],
];

const STORAGE_KEY = "l8grid-playground-v2";

const HANDLES: Record<string, readonly ResizeHandle[]> = {
  Ecke: ["se"],
  Rundum: ["n", "e", "s", "w", "ne", "nw", "se", "sw"],
  Keine: [],
};

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function series(seed: number, count: number) {
  const next = random(seed * 977 + 13);
  return Array.from({ length: count }, () => 0.2 + next() * 0.8);
}

function stressLayout(count: number): [GridItem[], Map<string, Tile>] {
  const next = random(99);
  const kinds: Kind[] = ["kpi", "bars", "line", "donut"];
  const items: GridItem[] = [];
  const tiles = new Map<string, Tile>();
  for (let i = 0; i < count; i++) {
    const w = 1 + Math.floor(next() * 3);
    const id = `s${i}`;
    items.push({ id, x: Math.floor(next() * (12 - w + 1)), y: i, w, h: 1 + Math.floor(next() * 3) });
    tiles.set(id, { title: `Tile ${i + 1}`, kind: kinds[i % kinds.length]!, seed: i });
  }
  return [items, tiles];
}

const NEW_KINDS: Kind[] = ["kpi", "bars", "line", "donut"];

function newTile(id: string): Tile {
  const n = Number(id.slice(4));
  return { title: `Neue Kachel ${n}`, kind: NEW_KINDS[n % NEW_KINDS.length]!, seed: 100 + n };
}

function loadDashboard(): GridItem[] {
  const fallback = DASHBOARD.map(([item]) => item);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as GridItem[] | null;
    const known = saved && fallback.every((item, i) => saved[i]?.id === item.id) && saved.slice(fallback.length).every((item) => item.id.startsWith("neu-"));
    return known ? saved : fallback;
  } catch {
    return fallback;
  }
}

function Bars({ seed }: { seed: number }) {
  const values = series(seed, 8);
  return (
    <svg className="chart" viewBox="0 0 80 40" preserveAspectRatio="none">
      {values.map((v, i) => (
        <rect key={i} x={i * 10 + 1.5} y={40 - v * 38} width={7} height={v * 38} rx={1} />
      ))}
    </svg>
  );
}

function Line({ seed }: { seed: number }) {
  const values = series(seed, 24);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - v * 36}`).join(" ");
  return (
    <svg className="chart line" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polygon points={`0,40 ${points} 100,40`} />
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Donut({ seed }: { seed: number }) {
  const values = series(seed, 4);
  const total = values.reduce((a, b) => a + b, 0);
  let offset = 0;
  return (
    <svg className="chart donut" viewBox="0 0 42 42">
      {values.map((v, i) => {
        const share = (v / total) * 100;
        const circle = (
          <circle key={i} cx="21" cy="21" r="15.9" pathLength={100} strokeDasharray={`${share - 1} ${101 - share}`} strokeDashoffset={-offset} data-i={i} />
        );
        offset += share;
        return circle;
      })}
    </svg>
  );
}

function Kpi({ seed }: { seed: number }) {
  const next = random(seed * 31);
  const value = (next() * 900 + 100).toFixed(1);
  const delta = (next() * 20 - 8).toFixed(1);
  return (
    <div className="kpi">
      <strong>{value}k</strong>
      <span className={Number(delta) >= 0 ? "up" : "down"}>
        {Number(delta) >= 0 ? "▲" : "▼"} {delta}%
      </span>
    </div>
  );
}

function Table({ seed }: { seed: number }) {
  const values = series(seed, 6);
  const names = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Stark"];
  return (
    <table>
      <tbody>
        {values.map((v, i) => (
          <tr key={i}>
            <td>{names[i]}</td>
            <td>{(v * 420).toFixed(0)}k</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BODY: Record<Kind, (props: { seed: number }) => ReactNode> = {
  kpi: Kpi,
  bars: Bars,
  line: Line,
  donut: Donut,
  table: Table,
  text: () => null,
};

function SizeBadge() {
  const item = useGridItem();
  return item ? <small className="size">{`${item.w} × ${item.h}`}</small> : null;
}

function TileView({ tile }: { tile: Tile }) {
  const Body = BODY[tile.kind];
  return (
    <section className="tile">
      <header>
        <span className="grip" data-l8-handle="" aria-hidden>
          <svg viewBox="0 0 10 16" width="10" height="16">
            {[3, 8, 13].map((cy) => [3, 7].map((cx) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={1.3} />))}
          </svg>
        </span>
        <h2>{tile.title}</h2>
        <SizeBadge />
      </header>
      <div className="body">
        <Body seed={tile.seed} />
      </div>
      {tile.kind === "table" && (
        <div className="stretch" data-l8-resize="s" title="Eigener Griff: nach unten ziehen">
          ⋯
        </div>
      )}
    </section>
  );
}

const DROP_TYPE = "application/x-l8grid-tile";

function App() {
  const [mode, setMode] = useState<"dashboard" | "responsive" | "stress">("dashboard");
  const history = useLayoutHistory(loadDashboard);
  const dashboard = history.layout;
  const setDashboard = history.reset;
  const [responsive, setResponsive] = useState<Record<string, GridItem[]>>(() => ({ lg: DASHBOARD.map(([item]) => item) }));
  const [breakpoint, setBreakpoint] = useState("");
  const [keyboard, setKeyboard] = useState<"instant" | "grab">("instant");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [overlap, setOverlap] = useState(false);
  const [noPush, setNoPush] = useState(false);
  const [stress, setStress] = useState(() => stressLayout(400));
  const [compaction, setCompaction] = useState<Compaction>("vertical");
  const [handle, setHandle] = useState(false);
  const [draggable, setDraggable] = useState(true);
  const [resizable, setResizable] = useState(true);
  const [handles, setHandles] = useState("Ecke");
  const [cols, setCols] = useState(24);
  const [rowHeight, setRowHeight] = useState(22);
  const stressMode = mode === "stress";

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboard)), [dashboard]);

  const toolbar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = toolbar.current!;
    const observer = new ResizeObserver(() => (document.documentElement.style.scrollPaddingTop = `${node.offsetHeight}px`));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const tiles = useMemo(() => (mode === "stress" ? stress[1] : new Map(DASHBOARD.map(([item, tile]) => [item.id, tile]))), [mode, stress]);
  const layout = mode === "stress" ? stress[0] : dashboard;
  const renderItem = useCallback((id: string) => <TileView tile={tiles.get(id) ?? newTile(id)} />, [tiles]);
  const getItemLabel = useCallback((id: string) => (tiles.get(id) ?? newTile(id)).title, [tiles]);
  const gridCols = stressMode ? 12 : cols;
  const gap = stressMode ? 6 : 12;

  const record = history.onLayoutChange;
  const onLayoutChange = useCallback(
    (next: GridItem[]) => {
      if (mode === "stress") return setStress(([, t]) => [next, t]);
      record(next);
    },
    [mode, record],
  );

  const nextId = () => `neu-${dashboard.filter((item) => item.id.startsWith("neu-")).length + 1}`;
  const add = () => onLayoutChange(addItem(dashboard, { id: nextId(), w: 6, h: 4 }, { cols, compaction }));
  const onDrop = useCallback(
    (next: GridItem[], item: GridItem) => {
      const id = `neu-${next.filter((other) => other.id.startsWith("neu-")).length + 1}`;
      record(next.map((other) => (other === item || other.id === item.id ? { ...other, id } : other)));
    },
    [record],
  );
  const droppingItem = useCallback((event: DragEvent) => event.dataTransfer?.types.includes(DROP_TYPE) && { w: 6, h: 4 }, []);

  const shared = {
    renderItem,
    getItemLabel,
    compaction,
    draggable,
    resizable,
    resizeHandles: HANDLES[handles],
    handle,
    keyboard,
    direction,
    allowOverlap: overlap,
    preventCollision: noPush,
  };

  return (
    <div className="app">
      <div className="toolbar" ref={toolbar}>
        <div className="segmented">
          <button aria-pressed={mode === "dashboard"} onClick={() => setMode("dashboard")}>
            Dashboard
          </button>
          <button aria-pressed={mode === "responsive"} onClick={() => setMode("responsive")}>
            Responsive{breakpoint && mode === "responsive" ? ` · ${breakpoint}` : ""}
          </button>
          <button aria-pressed={mode === "stress"} onClick={() => setMode("stress")}>
            Stress · {stress[0].length} Tiles
          </button>
        </div>
        <label className="gravity" title="An: Kacheln rutschen immer nach oben in freien Platz, Lücken schließen sich. Aus: Kacheln bleiben genau dort liegen, wo du sie loslässt.">
          <input type="checkbox" checked={compaction === "vertical"} onChange={(e) => setCompaction(e.target.checked ? "vertical" : "none")} />
          Schwerkraft
          <small>{compaction === "vertical" ? "Kacheln rutschen nach oben" : "Kacheln bleiben, wo du sie ablegst"}</small>
        </label>
        <label>
          <input type="checkbox" checked={draggable} onChange={(e) => setDraggable(e.target.checked)} />
          Ziehen
        </label>
        <div className="segmented" role="group" aria-label="Ziehen über">
          <button aria-pressed={!handle} disabled={!draggable} onClick={() => setHandle(false)}>
            Ganze Karte
          </button>
          <button aria-pressed={handle} disabled={!draggable} onClick={() => setHandle(true)}>
            Griff ⠿
          </button>
        </div>
        <label>
          <input type="checkbox" checked={resizable} onChange={(e) => setResizable(e.target.checked)} />
          Größe ändern
        </label>
        <div className="segmented" role="group" aria-label="Griffe zum Skalieren">
          {Object.keys(HANDLES).map((name) => (
            <button key={name} aria-pressed={handles === name} disabled={!resizable} onClick={() => setHandles(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Tastatur">
          <button aria-pressed={keyboard === "instant"} onClick={() => setKeyboard("instant")} title="Pfeiltasten verschieben sofort">
            Pfeile sofort
          </button>
          <button aria-pressed={keyboard === "grab"} onClick={() => setKeyboard("grab")} title="Leertaste aufnehmen, Pfeile, Leertaste ablegen, Esc bricht ab">
            Aufnehmen ␣
          </button>
        </div>
        <label>
          <input type="checkbox" checked={direction === "rtl"} onChange={(e) => setDirection(e.target.checked ? "rtl" : "ltr")} />
          RTL
        </label>
        <label title="Kacheln dürfen sich überlappen, nichts wird verschoben">
          <input type="checkbox" checked={overlap} onChange={(e) => setOverlap(e.target.checked)} />
          Überlappen
        </label>
        <label title="Andere Kacheln werden nie weggeschoben">
          <input type="checkbox" checked={noPush} onChange={(e) => setNoPush(e.target.checked)} />
          Nicht schieben
        </label>
        <label>
          Spalten
          <input type="range" min={4} max={48} value={cols} disabled={mode !== "dashboard"} onChange={(e) => setCols(Number(e.target.value))} />
          <output>{cols}</output>
        </label>
        <label>
          Zeilenhöhe
          <input type="range" min={8} max={96} value={rowHeight} disabled={stressMode} onChange={(e) => setRowHeight(Number(e.target.value))} />
          <output>{rowHeight}</output>
        </label>
        {mode === "dashboard" && (
          <>
            <button onClick={add}>+ Kachel</button>
            <span className="palette" draggable onDragStart={(event) => event.dataTransfer.setData(DROP_TYPE, "tile")} title="Ins Raster ziehen">
              ⠿ Kachel ziehen
            </span>
            <button onClick={history.undo} disabled={!history.canUndo}>
              ↶ Rückgängig
            </button>
            <button onClick={history.redo} disabled={!history.canRedo}>
              ↷ Wiederholen
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setDashboard(DASHBOARD.map(([item]) => item));
              }}
            >
              Zurücksetzen
            </button>
          </>
        )}
        <span className="hint">Ziehen · Griffe am Rand = Größe · Tab + Pfeiltasten (Shift = Größe) · Esc bricht ab</span>
      </div>
      {mode === "responsive" ? (
        <ResponsiveGrid
          {...shared}
          layouts={responsive}
          onLayoutsChange={setResponsive}
          onBreakpointChange={setBreakpoint}
          rowHeight={rowHeight}
          gap={gap}
          style={{ "--gap": `${gap}px` } as CSSProperties}
        />
      ) : (
        <Grid
          {...shared}
          key={mode}
          layout={layout}
          onLayoutChange={onLayoutChange}
          cols={gridCols}
          rowHeight={stressMode ? 28 : rowHeight}
          gap={gap}
          style={{ "--gap": `${gap}px` } as CSSProperties}
          onDrop={mode === "dashboard" ? onDrop : undefined}
          droppingItem={droppingItem}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
