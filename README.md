<img src="assets/icon.svg" width="64" height="64" alt="">

# l8grid

Drag-and-drop, resizable, keyboard-accessible grid layout for React.

```sh
npm i l8grid
```

Peer dependencies: `react` and `react-dom` >= 18.

## Quick start

```tsx
import { useCallback, useState } from "react";
import { Grid, type GridItem } from "l8grid";

const initial: GridItem[] = [
  { id: "a", x: 0, y: 0, w: 8, h: 4 },
  { id: "b", x: 8, y: 0, w: 8, h: 4 },
  { id: "c", x: 16, y: 0, w: 8, h: 6, minW: 4 },
];

export function Dashboard() {
  const [layout, setLayout] = useState(initial);
  const renderItem = useCallback((id: string) => <div className="tile">{id}</div>, []);

  return <Grid layout={layout} onLayoutChange={setLayout} renderItem={renderItem} />;
}
```

Keep `renderItem` and `getItemLabel` stable (e.g. `useCallback`): cells re-render when they change. Positions are written to the DOM directly, so dragging and dropping does not re-render tiles. `onLayoutChange` is called synchronously on release; the visual clean-up after a drop runs in the next animation frame.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `layout` | `readonly GridItem[]` | required | Current layout (controlled). |
| `onLayoutChange` | `(layout: GridItem[], change: GridChange) => void` | required | Called once per committed change (a drop or a keyboard step). `change` is `{ id, kind: "move" \| "resize" }`. |
| `renderItem` | `(id: string) => ReactNode` | required | Renders the content of a tile. |
| `getItemLabel` | `(id: string) => string` | - | Accessible label for a tile; falls back to the id in announcements. |
| `messages` | `Partial<GridMessages>` | English defaults | Screen reader texts, see below. |
| `cols` | `number` | `24` | Number of columns. |
| `rowHeight` | `number` | `24` | Row height in px. |
| `gap` | `number` | `12` | Gap between cells in px. |
| `compaction` | `"vertical" \| "none"` | `"vertical"` | `"vertical"` (gravity) pulls items up into free space. `"none"` leaves them where they are dropped. |
| `draggable` | `boolean` | `true` | Items can be moved. `GridItem.draggable` overrides it per item. |
| `resizable` | `boolean` | `true` | Items can be resized. `GridItem.resizable` overrides it per item. |
| `resizeHandles` | `ResizeHandle[]` | `["se"]` | Built-in resize handles: any of `"n"`, `"e"`, `"s"`, `"w"`, `"ne"`, `"nw"`, `"se"`, `"sw"`. `[]` renders none. |
| `handle` | `boolean` | `false` | Only elements with `data-l8-handle` start a move. |
| `className` | `string` | - | Added to the `.l8-grid` root. |
| `style` | `CSSProperties` | - | Inline style for the root. |

## Layout items

```ts
interface GridItem {
  id: string;
  x: number;       // column
  y: number;       // row
  w: number;       // width in columns
  h: number;       // height in rows
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;    // fixed obstacle: cannot be moved, resized or focused, other items flow around it
  draggable?: boolean; // overrides the grid's `draggable` for this item
  resizable?: boolean; // overrides the grid's `resizable` for this item
}
```

- `y: Infinity` appends the item at the bottom of the layout. A `y` that is not a finite number (e.g. `null` after `JSON.stringify(Infinity)`) does the same.
- Invalid numbers (`NaN`, etc.) are sanitized; sizes are clamped to `min*`/`max*` and the column count.
- Changing `cols` re-resolves from the layout you passed in, so the original arrangement is not lost when switching back.
- An item with `draggable: false` and `resizable: false` stays where it is unless other items push it. Use `static` for items that must never move.

## Interaction

- The whole tile is draggable. With `handle`, only elements with `data-l8-handle` start a move. `draggable={false}` or `draggable: false` on an item turns moving off.
- While dragging, every frame scores the nearby slots: how far the slot is from where you hold the tile (relative to its size) and how much other tiles would have to move. The cheapest slot wins; the gaps a slot would leave behind only decide between slots that are equally close:
  - Free space is used directly. In free space the placeholder follows the pointer column by column, whatever the size of the tile, so a free slot under the tile is always reachable. Being lifted by gravity does not count as moving away from the pointer.
  - A neighbour is displaced once the tile is more than halfway over it. Displaced tiles move into the space the dragged tile left (swap), so rows stay filled. A displaced tile that is wider than that space overhangs on the side it comes from.
  - Dragged sideways along a row, the tile behaves like an item in a sortable list: every tile it passes moves one place towards where the dragged tile came from, whatever their widths. The result is the same as pressing the arrow key repeatedly, and dragging back restores the order.
  - With the pointer past the left or right edge of the grid, the tile goes flush against that edge as long as nothing has to be pushed down for it, even where the remaining space is less than half a tile. The same applies to the top edge when dragging upwards.
  - Once a tile is dragged more than halfway out of its slot it does not snap back; it takes the cheapest slot in the direction you drag, even if other tiles have to make room. It returns only when you bring it back a quarter column (or row) past the halfway point.
  - The placeholder never moves away from the pointer: a slot is only taken if it is at least as close to the pointer as the original slot on both axes (gravity may still lift it).
  - Dragged across a larger tile, the tile jumps to the far side of it once you pass its middle.
  - Thresholds have a hysteresis of about a quarter column or row, independent of the tile size, so a hand resting on a boundary does not make the layout flicker.
  - While the tile stays within half its height of its row, nothing is pushed down. Inserting into another row, which pushes that column down, only happens when you drag the tile there.
  - The result does not depend on how fast you drag: a quick flick along a row ends in the same place as a slow drag.
  - The tile can be dragged into the empty row below all other tiles.
- Inputs, textareas, selects, buttons, links, `contenteditable` and anything inside `[data-l8-nodrag]` never start a drag.
- Clicks on tile content keep working; the click that ends a drag is swallowed.
- Touch: a move needs a 250 ms long press (outside handle mode), so swiping still scrolls the page.
- Resize via the built-in handles from `resizeHandles` (`.l8-resize`, larger on coarse pointers). The dragged edge follows the pointer, the opposite edge stays put, and `minW`/`maxW`/`minH`/`maxH` are respected. The top edge only grows into free space; it stops at the item above.
- Custom handles: any element inside a tile with `data-l8-resize="<edge>"` (for example `data-l8-resize="e"`) resizes its tile from that edge (an empty value means `se`). Combine with `resizeHandles={[]}` to replace the built-in handles. Custom handles bring their own styling and cursor.
- With gravity (`compaction="vertical"`) an item always rises into free space above it, so it cannot be left floating below a gap. Use `compaction="none"` to place items freely.
- `Escape` cancels an active drag.
- Dragging near the edges of the viewport or the nearest scroll container auto-scrolls. `scroll-padding-top`/`-bottom` on the scroll container (or `html` for the page) move the edges, so sticky headers do not cover them.

## Keyboard and accessibility

- Focus a tile (Tab), then arrow keys move it to the next slot in that direction (swapping with neighbours, same rules as dragging, without leaving its column or row) and Shift + arrow keys resize it. Combinations with Alt, Ctrl or Meta are left to the browser. Moving and resizing follow `draggable` and `resizable`; items that allow neither are not focusable.
- Each item has `role="group"`, an `aria-label` from `getItemLabel`, an `aria-roledescription`, and instructions linked via `aria-describedby`.
- After each committed change a polite live region announces the new position.

The `messages` prop (`GridMessages`) localizes these texts. Defaults are English.

```tsx
const messages = {
  roleDescription: "verschiebbares Element",
  instructions: "Pfeiltasten verschieben, Umschalt + Pfeiltasten ändern die Größe.",
  moved: (label: string, { x, y, w, h }: GridItem) => `${label}: Spalte ${x + 1}, Zeile ${y + 1}, ${w} × ${h}`,
};

<Grid messages={messages} {...props} />;
```

## Styling

Base styles are injected once. Visual defaults use `:where()` (zero specificity), so they are easy to override.

Hooks:

- `.l8-grid`: root element
- `.l8-item`: tile wrapper
- `.l8-placeholder`: drop target preview
- `.l8-resize[data-l8-resize="<edge>"]`: built-in resize handles
- `--l8-handle`: size of the built-in handles (set on `.l8-grid`, default `16px`, `28px` on coarse pointers)
- `--l8-col-width`: current column width in px, set on `.l8-grid` (for grid guides, see below)
- `[data-l8-active="move" | "resize"]`: on the dragged item
- `[data-l8-edge]`: on the item while it is resized, with the edge being dragged
- `[data-l8-dragging]`: on the grid during a drag
- `[data-l8-settling]`: on an item while it animates into place after a drop
- `[data-l8-static]`: on static items
- `[data-l8-nodrag]`: on items that cannot be moved
- `[data-l8-handle-mode]`: on the grid when `handle` is set

Items are CSS size containers (`container-type: size`), so tile content can use container queries. `prefers-reduced-motion: reduce` disables transitions. Padding on `.l8-grid` insets the tiles, and grids inside scaled or zoomed parents (`transform: scale()`) track the pointer correctly.

```css
.l8-placeholder {
  border-radius: 8px;
  border: 2px dashed rgb(78 121 167 / 0.55);
  background: rgb(78 121 167 / 0.14);
}

.l8-resize[data-l8-resize="se"]::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 2px solid #ccc;
  border-bottom: 2px solid #ccc;
}

/* column guides while dragging, for gap={12} */
.l8-grid[data-l8-dragging]::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(to right, rgb(78 121 167 / 0.07) 0 var(--l8-col-width), transparent 0 calc(var(--l8-col-width) + 12px));
}
```

## Layout utilities

Pure functions, exported from the package. `LayoutOptions` is `{ cols: number; compaction: Compaction }`.

- `resolveLayout(layout: Layout, options: LayoutOptions, active?: GridItem): GridItem[]`: clamps items, resolves collisions (giving `active` priority) and compacts.
- `moveItem(layout: Layout, id: string, target: Partial<Rect>, options: LayoutOptions): GridItem[]`: moves/resizes one item to `target` and resolves the rest.
- `nudgeItem(layout: Layout, id: string, delta: Partial<Rect>, options: LayoutOptions): GridItem[] | undefined`: moves an item to the next slot in the direction of `delta.x`/`delta.y` using the drag rules (swaps instead of pushing neighbours down), or resizes it by `delta.w`/`delta.h`; returns `undefined` when nothing changes. Useful for "move up/down" buttons.
- `addItem(layout: Layout, item: Omit<GridItem, "x" | "y">, options: LayoutOptions): GridItem[]`: resolves the layout and appends `item` at the first free slot that fits (top-left first), so new widgets fill gaps instead of going to the bottom.
- `compactVertical(layout: Layout, cols: number): GridItem[]`: sanitizes the layout, resolves overlaps and pulls non-static items up as far as possible.
- `clampItem(item: GridItem, cols: number): GridItem`: sanitizes and clamps one item to the grid and its constraints.
- `layoutBottom(layout: Layout): number`: the lowest occupied row (`max(y + h)`).
- `sameLayout(a: Layout, b: Layout): boolean`: compares ids and positions in order.

## Development

```sh
npm run dev        # playground (Vite)
npm test           # Vitest
npm run typecheck
npm run build      # tsdown
```
