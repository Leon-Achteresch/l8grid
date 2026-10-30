<img src="assets/icon.svg" width="64" height="64" alt="">

# l8grid

Drag-and-drop, resizable, keyboard-accessible grid layout for React.

```sh
npm i l8grid
```

Peer dependencies: `react` and `react-dom` >= 18.

**Live demo:** run `npm run dev`, or open the GitHub Pages demo once it is enabled for the repository.

> **Upgrading from 0.2?** Nothing to change. Every feature added in 0.3 is opt-in, layouts are stored in the same format, and CI checks on every change that the grid behaves exactly like 0.2.1 when only 0.2 props are used. See [Compatibility](#compatibility) and the [changelog](CHANGELOG.md).

Coming from react-grid-layout? See [MIGRATING.md](MIGRATING.md).

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
| `maxRows` | `number` | - | Moves and resizes that would make the layout taller than this many rows are not taken (a resize stops at the largest size that fits). A layout that is already taller is left alone. |
| `preventCollision` | `boolean` | `false` | Moving or resizing never pushes other items aside or down; an item only goes where there is room. |
| `allowOverlap` | `boolean` | `false` | Items may overlap: nothing is pushed or compacted (`compaction` is ignored), items are only clamped to the grid. |
| `direction` | `"ltr" \| "rtl"` | `"ltr"` | `"rtl"` mirrors the grid: column 0 is on the right, dragging, resizing and arrow keys follow. |
| `keyboard` | `"instant" \| "grab"` | `"instant"` | `"grab"`: Space/Enter picks a tile up, arrows move it, Space/Enter drops, Escape cancels. See [Keyboard and accessibility](#keyboard-and-accessibility). |
| `onInteractionStart` | `(change: GridChange) => void` | - | A pointer drag or resize (or a keyboard grab) started. |
| `onPreviewChange` | `(layout: GridItem[], change: GridChange) => void` | - | The previewed layout changed during an interaction. |
| `onInteractionEnd` | `(change: GridChange, committed: boolean) => void` | - | An interaction ended. `committed` is `true` when `onLayoutChange` was called for it (it is called right before). |
| `onDrop` | `(layout: GridItem[], item: GridItem, event: DragEvent) => void` | - | Accept external HTML drag-and-drop sources. See [Dropping from outside](#dropping-from-outside). |
| `droppingItem` | `DropItem \| (event: DragEvent) => DropItem \| false` | `{ w: 4, h: 4 }` | Size (and optional `id`, constraints) of the dropped item, or a function deciding per drag. |
| `rootRef` | `Ref<HTMLDivElement>` | - | Ref to the `.l8-grid` root. |

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

### Grab mode

With `keyboard="grab"` arrow keys do nothing until a tile is picked up, the pattern screen reader users know from other drag-and-drop lists:

- Space or Enter on a focused tile picks it up (`[data-l8-grabbed]` is set on it).
- Arrow keys move it, Shift + arrow keys resize it. The layout around it updates as a preview, nothing is committed yet.
- Space or Enter drops it and calls `onLayoutChange` once. Escape, or moving focus away, cancels and restores the layout.
- Each step is announced. Steps that are not possible are announced as blocked.

Grab mode has its own English defaults for the instructions and announcements. In the default mode (`"instant"`) nothing is announced beyond the `moved` message unless you pass a `blocked` message.

The `messages` prop (`GridMessages`) localizes these texts. Defaults are English. `grabInstructions`, `grabbed`, `dropped`, `cancelled` and `blocked` are optional and used for grab mode.

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
- `[data-l8-grabbed]`: on an item picked up with the keyboard (`keyboard="grab"`)
- `[data-l8-dropping]`: on the grid while something is dragged over it (`onDrop`)
- `[data-l8-ready]`: on the grid once it is mounted (see [Server rendering](#server-rendering))

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

## Responsive layouts

`ResponsiveGrid` switches columns and layouts with the width of its container. It takes all `Grid` props except `layout`, `onLayoutChange` and `cols`.

```tsx
import { ResponsiveGrid } from "l8grid";

const [layouts, setLayouts] = useState({ lg: initialLayout });

<ResponsiveGrid
  layouts={layouts}
  onLayoutsChange={setLayouts}
  breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} // default
  cols={{ lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }} // default
  onBreakpointChange={(breakpoint, cols) => {}}
  renderItem={renderItem}
/>;
```

- `breakpoints` are minimum container widths in px. The largest one that fits wins.
- A breakpoint without a layout is derived from the nearest breakpoint that has one (larger ones first), with `x` and `w` scaled to the new column count. It is stored in `layouts` once the user changes something there.
- `onLayoutsChange(layouts, change)` receives all layouts with the current breakpoint replaced; `change.breakpoint` names it.
- Before the width is known (server rendering) `defaultBreakpoint` (default: the largest) is used.
- `getBreakpoint(breakpoints, width)` and `layoutForBreakpoint(layouts, breakpoint, options)` are exported for your own logic.

## Dropping from outside

Pass `onDrop` to let users drag new tiles in from a palette (any element with `draggable` and HTML drag-and-drop):

```tsx
<div draggable onDragStart={(event) => event.dataTransfer.setData("application/x-widget", "chart")}>Chart</div>

<Grid
  {...props}
  droppingItem={(event) => event.dataTransfer?.types.includes("application/x-widget") && { w: 6, h: 4 }}
  onDrop={(layout, item, event) => {
    const id = crypto.randomUUID();
    setLayout(layout.map((other) => (other.id === item.id ? { ...other, id } : other)));
  }}
/>;
```

While dragging over the grid, the placeholder shows where the item would land and the other tiles make room (with the same rules as `maxRows`, `preventCollision` and `allowOverlap`). `layout` contains the new item with the id from `droppingItem` (default `"__l8-drop__"`); give it a real id when you store it. Return `false` from `droppingItem` to refuse a drag. Without `onDrop` the grid ignores HTML drag-and-drop as before.

## Tile size inside the content

`useGridItem()` returns the committed `GridItem` of the tile it is rendered in. Only components that call it re-render when their tile moves or resizes, so tiles can adapt their content to their size in JavaScript:

```tsx
function Chart() {
  const { w, h } = useGridItem()!;
  return w < 6 ? <Sparkline /> : <FullChart rows={h} />;
}
```

## Undo and redo

```tsx
const history = useLayoutHistory(initialLayout, { limit: 100 });

<Grid layout={history.layout} onLayoutChange={history.onLayoutChange} renderItem={renderItem} />
<button onClick={history.undo} disabled={!history.canUndo}>Undo</button>
<button onClick={history.redo} disabled={!history.canRedo}>Redo</button>
```

It works for any value, for example the `layouts` of a `ResponsiveGrid` (pass `history.onLayoutChange` as `onLayoutsChange`). `history.reset(layout)` replaces the state and clears the history.

## Server rendering

The grid renders the initial positions as CSS custom properties, and the stylesheet places tiles with them until the grid is mounted (`[data-l8-ready]`), so server-rendered HTML shows the layout before hydration. Load the stylesheet with the server-rendered page, because the client injects it only on mount:

```ts
import "l8grid/styles.css"; // or render the `gridStyles` string export into a <style> tag
```

Loading the stylesheet yourself also helps with a Content-Security-Policy that blocks injected `<style>` elements: the grid does not inject a second copy when an element with id `l8grid-styles` exists, so give your `<style>` or `<link>` that id.

## Headless

`useGrid(options)` gives you the behaviour of `<Grid>` for your own markup. It takes the same options as the `Grid` props (without the rendering ones) and returns refs:

```tsx
const { rootRef, placeholderRef, itemRef } = useGrid<HTMLUListElement, HTMLLIElement>({ layout, onLayoutChange, cols: 12 });

<ul ref={rootRef} className="l8-grid">
  {layout.map((item) => (
    <li key={item.id} ref={itemRef(item.id)} data-l8-id={item.id} className="l8-item" tabIndex={0}>
      {item.id}
    </li>
  ))}
  <li ref={placeholderRef} className="l8-placeholder" />
</ul>;
```

Items and the placeholder must be direct children of the root. The returned `controller` (`GridController`) exposes `getLayout()`, `getItem(id)` and `subscribe(id, listener)`.

## Compatibility

l8grid follows [semantic versioning](https://semver.org). Within 0.x, minor versions may add features but do not change existing behaviour:

- **Upgrading needs no code changes.** New props are optional and off by default. New `GridMessages` fields and `GridOptions` fields are optional, so existing TypeScript code still compiles.
- **Stored layouts stay compatible in both directions.** A layout is still a plain `GridItem[]` with the same fields; layouts saved by 0.3 load in 0.2 and the other way round. Downgrading only means removing the props and exports added in 0.3 from your code.
- **Behaviour is checked against the previous release.** `npm run test:compat` replays 300 random scenarios (layouts, props, pointer and keyboard input, external updates) on the published 0.2.1 and on the current code in jsdom, and `npm run test:e2e` replays real mouse and keyboard input in Chromium. Commits, return values and the DOM must be identical. The injected stylesheet keeps every 0.2.1 rule unchanged; new rules only match attributes that older setups never produce after mount.

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
npm run dev           # playground (Vite)
npm test              # unit tests (Vitest)
npm run test:compat   # differential test against the published 0.2.1
npm run test:fuzz     # randomized checks of the 0.3 options
npm run build         # tsdown, writes dist/styles.css too
npm run test:e2e      # Playwright (after build); E2E_BROWSERS=chromium,firefox,webkit
npm run typecheck
npm run lint          # oxlint
npm run size          # gzip size limit
npm run build:demo    # playground for GitHub Pages
```

CI runs all of these with React 18 and 19. Publishing a GitHub release publishes the package to npm with provenance (needs an `NPM_TOKEN` secret).
