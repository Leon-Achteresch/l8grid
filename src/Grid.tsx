import { memo, useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GridController, type ChangeKind, type ResizeHandle } from "./controller";
import type { Compaction, GridItem, Layout } from "./layout";

export interface GridMessages {
  roleDescription: string;
  instructions: string;
  moved: (label: string, item: GridItem) => string;
}

export interface GridChange {
  id: string;
  kind: ChangeKind;
}

export interface GridProps {
  layout: Layout;
  onLayoutChange: (layout: GridItem[], change: GridChange) => void;
  renderItem: (id: string) => ReactNode;
  getItemLabel?: (id: string) => string;
  messages?: Partial<GridMessages>;
  cols?: number;
  rowHeight?: number;
  gap?: number;
  compaction?: Compaction;
  draggable?: boolean;
  resizable?: boolean;
  resizeHandles?: readonly ResizeHandle[];
  handle?: boolean;
  className?: string;
  style?: CSSProperties;
}

const MESSAGES: GridMessages = {
  roleDescription: "movable tile",
  instructions: "Arrow keys move, Shift + arrow keys resize.",
  moved: (label, { x, y, w, h }) => `${label}: column ${x + 1}, row ${y + 1}, ${w} × ${h}`,
};

const CORNER: readonly ResizeHandle[] = ["se"];

interface CellProps {
  id: string;
  label: string | undefined;
  isStatic: boolean;
  draggable: boolean;
  resizable: boolean;
  handles: string;
  roleDescription: string;
  describedBy: string;
  controller: GridController;
  render: (id: string) => ReactNode;
}

const Cell = memo(function Cell({ id, label, isStatic, draggable, resizable, handles, roleDescription, describedBy, controller, render }: CellProps) {
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) controller.register(id, node);
      else controller.unregister(id);
    },
    [controller, id],
  );
  const interactive = draggable || resizable;
  return (
    <div
      ref={ref}
      className="l8-item"
      role="group"
      data-l8-id={id}
      data-l8-static={isStatic || undefined}
      data-l8-nodrag={(!isStatic && !draggable) || undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-roledescription={interactive ? roleDescription : undefined}
      aria-describedby={interactive ? describedBy : undefined}
    >
      {render(id)}
      {resizable && handles && handles.split(",").map((edge) => <div key={edge} className="l8-resize" data-l8-resize={edge} aria-hidden />)}
    </div>
  );
});

interface CellsProps {
  layout: Layout;
  getItemLabel: ((id: string) => string) | undefined;
  draggable: boolean;
  resizable: boolean;
  handles: string;
  roleDescription: string;
  describedBy: string;
  controller: GridController;
  render: (id: string) => ReactNode;
}

const sameCells = (a: CellsProps, b: CellsProps) =>
  a.layout.length === b.layout.length &&
  a.layout.every((item, i) => {
    const other = b.layout[i]!;
    return item.id === other.id && !item.static === !other.static && item.draggable === other.draggable && item.resizable === other.resizable;
  }) &&
  (Object.keys(a) as (keyof CellsProps)[]).every((key) => key === "layout" || a[key] === b[key]);

const Cells = memo(function Cells({ layout, getItemLabel, draggable, resizable, ...props }: CellsProps) {
  return layout.map((item) => (
    <Cell
      key={item.id}
      id={item.id}
      label={getItemLabel?.(item.id)}
      isStatic={!!item.static}
      draggable={!item.static && (item.draggable ?? draggable)}
      resizable={!item.static && (item.resizable ?? resizable)}
      {...props}
    />
  ));
}, sameCells);

export function Grid({
  layout,
  onLayoutChange,
  renderItem,
  getItemLabel,
  messages,
  cols = 24,
  rowHeight = 24,
  gap = 12,
  compaction = "vertical",
  draggable = true,
  resizable = true,
  resizeHandles = CORNER,
  handle = false,
  className,
  style,
}: GridProps) {
  const text: GridMessages = {
    roleDescription: messages?.roleDescription ?? MESSAGES.roleDescription,
    instructions: messages?.instructions ?? MESSAGES.instructions,
    moved: messages?.moved ?? MESSAGES.moved,
  };
  const describedBy = useId();
  const commitRef = useRef<(layout: GridItem[], change: GridChange) => void>(undefined);
  const [controller] = useState(
    () => new GridController({ cols, rowHeight, gap, compaction, handle, draggable, resizable }, (next, id, kind) => commitRef.current?.(next, { id, kind })),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    commitRef.current = (next, change) => {
      const item = next.find((candidate) => candidate.id === change.id);
      const live = liveRef.current;
      if (item && live) {
        const message = text.moved(getItemLabel?.(change.id) ?? change.id, item);
        requestAnimationFrame(() => (live.textContent = message));
      }
      onLayoutChange(next, change);
    };
  });

  useLayoutEffect(() => controller.mount(rootRef.current!, placeholderRef.current!), [controller]);

  useLayoutEffect(() => {
    controller.setOptions({ cols, rowHeight, gap, compaction, handle, draggable, resizable });
  }, [controller, cols, rowHeight, gap, compaction, handle, draggable, resizable]);

  useLayoutEffect(() => {
    controller.setLayout(layout);
  }, [controller, layout]);

  return (
    <div ref={rootRef} className={className ? `l8-grid ${className}` : "l8-grid"} style={style}>
      <Cells
        layout={layout}
        getItemLabel={getItemLabel}
        draggable={draggable}
        resizable={resizable}
        handles={[...new Set(resizeHandles)].join()}
        roleDescription={text.roleDescription}
        describedBy={describedBy}
        controller={controller}
        render={renderItem}
      />
      <div ref={placeholderRef} className="l8-placeholder" aria-hidden />
      <div ref={liveRef} className="l8-sr" aria-live="polite" />
      <div id={describedBy} hidden>
        {text.instructions}
      </div>
    </div>
  );
}
