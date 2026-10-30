import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
} from "react";
import { GridController, type Announcement, type ChangeKind, type DropItem, type GridOptions, type ResizeHandle } from "./controller";
import { placeFree } from "./free";
import { layoutBottom, resolveLayout, type Compaction, type GridItem, type Layout } from "./layout";

export interface GridMessages {
  roleDescription: string;
  instructions: string;
  moved: (label: string, item: GridItem) => string;
  /** Instructions with `keyboard="grab"`. */
  grabInstructions?: string;
  /** Announced when a tile is picked up with the keyboard (`keyboard="grab"`). */
  grabbed?: (label: string, item: GridItem) => string;
  /** Announced when a picked up tile is dropped (`keyboard="grab"`). */
  dropped?: (label: string, item: GridItem) => string;
  /** Announced when a keyboard move is cancelled with Escape (`keyboard="grab"`). */
  cancelled?: (label: string, item: GridItem) => string;
  /** Announced when an arrow key cannot move or resize the tile. With `keyboard="instant"` only if given. */
  blocked?: (label: string, item: GridItem) => string;
}

export interface GridChange {
  id: string;
  kind: ChangeKind;
}

export type DroppingItem = DropItem | ((event: DragEvent) => DropItem | false | null | undefined);

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
  /** Changes that would make the layout taller than this many rows are not taken. */
  maxRows?: number;
  /** Moving or resizing never pushes other items; an item only goes where there is room. */
  preventCollision?: boolean;
  /** Items may overlap: nothing is pushed or compacted. */
  allowOverlap?: boolean;
  /** `"rtl"` mirrors the grid: column 0 is on the right. Default `"ltr"`. */
  direction?: "ltr" | "rtl";
  /** `"instant"` (default): arrow keys move right away. `"grab"`: Space/Enter picks up and drops, Escape cancels. */
  keyboard?: "instant" | "grab";
  /** A pointer drag or resize (or a keyboard grab) started. */
  onInteractionStart?: (change: GridChange) => void;
  /** The previewed layout changed during an interaction. */
  onPreviewChange?: (layout: GridItem[], change: GridChange) => void;
  /** An interaction ended; `committed` tells whether `onLayoutChange` was called for it. */
  onInteractionEnd?: (change: GridChange, committed: boolean) => void;
  /** Enables dropping external HTML drag-and-drop sources onto the grid. `layout` contains the new `item`. */
  onDrop?: (layout: GridItem[], item: GridItem, event: DragEvent) => void;
  /** Size and id of the item previewed while something is dragged over the grid, or a function deciding per drag (return `false` to refuse). Default `{ w: 4, h: 4 }`. */
  droppingItem?: DroppingItem;
  /** Ref to the `.l8-grid` root element. */
  rootRef?: Ref<HTMLDivElement>;
}

const MESSAGES: GridMessages = {
  roleDescription: "movable tile",
  instructions: "Arrow keys move, Shift + arrow keys resize.",
  moved: (label, { x, y, w, h }) => `${label}: column ${x + 1}, row ${y + 1}, ${w} × ${h}`,
};

const GRAB_MESSAGES: Required<Pick<GridMessages, "grabInstructions" | "grabbed" | "dropped" | "cancelled" | "blocked">> = {
  grabInstructions: "Space or Enter picks the tile up. Then arrow keys move it, Shift + arrow keys resize it, Space or Enter drops it and Escape cancels.",
  grabbed: (label, { x, y }) => `${label} picked up at column ${x + 1}, row ${y + 1}.`,
  dropped: (label, { x, y, w, h }) => `${label} dropped: column ${x + 1}, row ${y + 1}, ${w} × ${h}`,
  cancelled: (label, { x, y }) => `${label}: cancelled, back at column ${x + 1}, row ${y + 1}.`,
  blocked: (label) => `${label} cannot go further in that direction.`,
};

const CORNER: readonly ResizeHandle[] = ["se"];

const DROP: DropItem = { w: 4, h: 4 };

const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

interface GridContextValue {
  controller: GridController;
  initial: ReadonlyMap<string, GridItem>;
}

const GridContext = createContext<GridContextValue | null>(null);
const ItemContext = createContext<string | null>(null);

const noop = () => () => {};

/**
 * The committed position and size of the tile this component is rendered in (inside `renderItem`).
 * Only components that call it re-render when their tile is moved or resized.
 */
export function useGridItem(): GridItem | undefined {
  const grid = useContext(GridContext);
  const id = useContext(ItemContext);
  const subscribe = useCallback((listener: () => void) => (grid && id != null ? grid.controller.subscribe(id, listener) : noop()), [grid, id]);
  const initial = () => (grid && id != null ? grid.initial.get(id) : undefined);
  return useSyncExternalStore(subscribe, () => (grid && id != null ? (grid.controller.getItem(id) ?? grid.initial.get(id)) : undefined), initial);
}

export interface UseGridOptions extends Partial<GridOptions> {
  layout: Layout;
  onLayoutChange: (layout: GridItem[], change: GridChange) => void;
  onInteractionStart?: (change: GridChange) => void;
  onPreviewChange?: (layout: GridItem[], change: GridChange) => void;
  onInteractionEnd?: (change: GridChange, committed: boolean) => void;
  onDrop?: (layout: GridItem[], item: GridItem, event: DragEvent) => void;
  droppingItem?: DroppingItem;
  /** Called for screen reader announcements of keyboard interactions. */
  onAnnounce?: (type: Announcement, id: string, item: GridItem) => void;
}

export interface UseGridResult<Root extends HTMLElement = HTMLDivElement, Placeholder extends HTMLElement = HTMLDivElement> {
  controller: GridController;
  /** Attach to the grid root. Items and the placeholder must be its direct children. */
  rootRef: RefObject<Root | null>;
  /** Attach to the drop preview element (rendered inside the root, class `l8-placeholder`). */
  placeholderRef: RefObject<Placeholder | null>;
  /** Ref callback for the item with this id (stable per id). The element needs `data-l8-id={id}`. */
  itemRef: (id: string) => RefCallback<HTMLElement>;
}

// The callbacks read the latest options when they are called.
function createController(options: GridOptions, latest: RefObject<UseGridOptions>): GridController {
  return new GridController(options, (next, id, kind) => latest.current.onLayoutChange(next, { id, kind }), {
    onInteractionStart: (id, kind) => latest.current.onInteractionStart?.({ id, kind }),
    onPreviewChange: (next, id, kind) => latest.current.onPreviewChange?.(next, { id, kind }),
    onInteractionEnd: (id, kind, committed) => latest.current.onInteractionEnd?.({ id, kind }, committed),
    announce: (type, id, item) => latest.current.onAnnounce?.(type, id, item),
    dropItem: (event) => {
      const { onDrop, droppingItem = DROP } = latest.current;
      if (!onDrop) return;
      return typeof droppingItem === "function" ? droppingItem(event) : droppingItem;
    },
    onDrop: (next, item, event) => latest.current.onDrop?.(next, item, event),
  });
}

/** Headless grid: the behaviour of `<Grid>` for your own markup. */
export function useGrid<Root extends HTMLElement = HTMLDivElement, Placeholder extends HTMLElement = HTMLDivElement>(
  options: UseGridOptions,
): UseGridResult<Root, Placeholder> {
  const {
    layout,
    cols = 24,
    rowHeight = 24,
    gap = 12,
    compaction = "vertical",
    handle = false,
    draggable = true,
    resizable = true,
    maxRows,
    preventCollision,
    allowOverlap,
    direction,
    keyboard,
  } = options;
  const latest = useRef(options);
  const [controller] = useState(() =>
    createController({ cols, rowHeight, gap, compaction, handle, draggable, resizable, maxRows, preventCollision, allowOverlap, direction, keyboard }, latest),
  );
  const rootRef = useRef<Root>(null);
  const placeholderRef = useRef<Placeholder>(null);
  const [itemRefs] = useState(() => new Map<string, RefCallback<HTMLElement>>());

  useIsomorphicLayoutEffect(() => {
    latest.current = options;
  });

  useIsomorphicLayoutEffect(() => controller.mount(rootRef.current!, placeholderRef.current!), [controller]);

  useIsomorphicLayoutEffect(() => {
    controller.setOptions({ cols, rowHeight, gap, compaction, handle, draggable, resizable, maxRows, preventCollision, allowOverlap, direction, keyboard });
  }, [controller, cols, rowHeight, gap, compaction, handle, draggable, resizable, maxRows, preventCollision, allowOverlap, direction, keyboard]);

  useIsomorphicLayoutEffect(() => {
    controller.setLayout(layout);
  }, [controller, layout]);

  const itemRef = useCallback(
    (id: string) => {
      let ref = itemRefs.get(id);
      if (!ref) {
        ref = (node) => {
          if (node) controller.register(id, node);
          else controller.unregister(id);
        };
        itemRefs.set(id, ref);
      }
      return ref;
    },
    [controller, itemRefs],
  );

  return { controller, rootRef, placeholderRef, itemRef };
}

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
  position: GridItem | undefined;
}

// Pre-mount position (server rendering); only used by the stylesheet until the grid is mounted.
const cellVars = ({ x, y, w, h }: GridItem) => ({ "--l8-x": x, "--l8-y": y, "--l8-w": w, "--l8-h": h }) as CSSProperties;

const Cell = memo(function Cell({ id, label, isStatic, draggable, resizable, handles, roleDescription, describedBy, controller, render, position }: CellProps) {
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
      style={position && cellVars(position)}
    >
      <ItemContext.Provider value={id}>{render(id)}</ItemContext.Provider>
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
  initial: ReadonlyMap<string, GridItem>;
}

const sameCells = (a: CellsProps, b: CellsProps) =>
  a.layout.length === b.layout.length &&
  a.layout.every((item, i) => {
    const other = b.layout[i]!;
    return item.id === other.id && !item.static === !other.static && item.draggable === other.draggable && item.resizable === other.resizable;
  }) &&
  (Object.keys(a) as (keyof CellsProps)[]).every((key) => key === "layout" || a[key] === b[key]);

const Cells = memo(function Cells({ layout, getItemLabel, draggable, resizable, initial, ...props }: CellsProps) {
  return layout.map((item) => (
    <Cell
      key={item.id}
      id={item.id}
      label={getItemLabel?.(item.id)}
      isStatic={!!item.static}
      draggable={!item.static && (item.draggable ?? draggable)}
      resizable={!item.static && (item.resizable ?? resizable)}
      position={initial.get(item.id)}
      {...props}
    />
  ));
}, sameCells);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

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
  maxRows,
  preventCollision,
  allowOverlap,
  direction,
  keyboard,
  onInteractionStart,
  onPreviewChange,
  onInteractionEnd,
  onDrop,
  droppingItem,
  rootRef: rootRefProp,
}: GridProps) {
  const grabMode = keyboard === "grab";
  const text: GridMessages = {
    roleDescription: messages?.roleDescription ?? MESSAGES.roleDescription,
    instructions: (grabMode ? messages?.grabInstructions : messages?.instructions) ?? (grabMode ? GRAB_MESSAGES.grabInstructions : MESSAGES.instructions),
    moved: messages?.moved ?? MESSAGES.moved,
  };
  const describedBy = useId();
  const liveRef = useRef<HTMLDivElement>(null);
  const say = (message: string) => {
    const live = liveRef.current;
    if (live) requestAnimationFrame(() => (live.textContent = message));
  };
  const label = (id: string) => getItemLabel?.(id) ?? id;

  const { controller, rootRef, placeholderRef } = useGrid({
    layout,
    cols,
    rowHeight,
    gap,
    compaction,
    handle,
    draggable,
    resizable,
    maxRows,
    preventCollision,
    allowOverlap,
    direction,
    keyboard,
    onInteractionStart,
    onPreviewChange,
    onInteractionEnd,
    onDrop,
    droppingItem,
    onLayoutChange: (next, change) => {
      const item = next.find((candidate) => candidate.id === change.id);
      if (item) say(text.moved(label(change.id), item));
      onLayoutChange(next, change);
    },
    onAnnounce: (type, id, item) => {
      const format = type === "moved" ? text.moved : (messages?.[type] ?? (grabMode ? GRAB_MESSAGES[type] : undefined));
      if (format) say(format(label(id), item));
    },
  });

  const [initial] = useState(() => {
    const placed = allowOverlap ? placeFree(layout, cols) : resolveLayout(layout, { cols, compaction });
    return {
      context: { controller, initial: new Map(placed.map((item) => [item.id, item])) },
      vars: { "--l8-cols": cols, "--l8-gap": `${gap}px`, "--l8-row-height": `${rowHeight}px`, "--l8-rows": layoutBottom(placed) } as CSSProperties,
    };
  });

  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      assignRef(rootRefProp, node);
    },
    [rootRef, rootRefProp],
  );

  return (
    <div ref={setRoot} className={className ? `l8-grid ${className}` : "l8-grid"} style={{ ...initial.vars, ...style }} data-l8-rtl={direction === "rtl" || undefined}>
      <GridContext.Provider value={initial.context}>
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
          initial={initial.context.initial}
        />
      </GridContext.Provider>
      <div ref={placeholderRef} className="l8-placeholder" aria-hidden />
      <div ref={liveRef} className="l8-sr" aria-live="polite" />
      <div id={describedBy} hidden>
        {text.instructions}
      </div>
    </div>
  );
}
