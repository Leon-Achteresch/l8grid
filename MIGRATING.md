# Migrating from react-grid-layout

l8grid covers the common react-grid-layout (RGL) setups with a smaller API. The main differences: the grid measures its own width (no `WidthProvider`), tiles are rendered from ids with `renderItem` instead of children, and positions are written to the DOM directly, so tiles do not re-render while dragging.

## Layout items

| react-grid-layout | l8grid |
| --- | --- |
| `i` | `id` |
| `x`, `y`, `w`, `h`, `minW`, `maxW`, `minH`, `maxH`, `static` | same |
| `isDraggable` | `draggable` |
| `isResizable` | `resizable` |
| `moved`, `isBounded`, `resizeHandles` per item | not supported (resize handles are set on the grid) |

```ts
import type { Layout as RglLayout } from "react-grid-layout";
import type { GridItem } from "l8grid";

const toL8 = (layout: RglLayout): GridItem[] =>
  layout.map(({ i, x, y, w, h, minW, maxW, minH, maxH, static: fixed, isDraggable, isResizable }) => ({
    id: i, x, y, w, h, minW, maxW, minH, maxH, static: fixed, draggable: isDraggable, resizable: isResizable,
  }));
```

Remove `undefined` fields before storing if you compare layouts as JSON.

## Grid props

| react-grid-layout | l8grid |
| --- | --- |
| `<GridLayout>` + `WidthProvider` | `<Grid>` (measures itself) |
| children with `key` | `renderItem={(id) => …}` |
| `layout`, `onLayoutChange(layout)` | `layout`, `onLayoutChange(layout, change)`; called once per drop or key press, not on every render |
| `cols`, `rowHeight`, `maxRows` | same (`cols` defaults to 24) |
| `margin={[x, y]}` | `gap` (one value for both axes) |
| `containerPadding` | CSS `padding` on `.l8-grid` |
| `compactType="vertical"` / `null` | `compaction="vertical"` / `"none"` |
| `compactType="horizontal"` | not supported |
| `isDraggable`, `isResizable` | `draggable`, `resizable` |
| `resizeHandles` | `resizeHandles` |
| `draggableHandle=".handle"` | `handle` + `data-l8-handle` on the handle element |
| `draggableCancel=".no-drag"` | `data-l8-nodrag` on the element (inputs, buttons and links never start a drag) |
| `preventCollision`, `allowOverlap` | same |
| `onDragStart`, `onResizeStart` | `onInteractionStart(change)`, `change.kind` is `"move"` or `"resize"` |
| `onDrag`, `onResize` | `onPreviewChange(layout, change)` |
| `onDragStop`, `onResizeStop` | `onInteractionEnd(change, committed)` |
| `isDroppable`, `droppingItem`, `onDrop(layout, item, event)` | `onDrop(layout, item, event)` enables dropping; `droppingItem` takes `id` instead of `i` |
| `transformScale` | automatic |
| `useCSSTransforms` | always on |

## Responsive layouts

| react-grid-layout | l8grid |
| --- | --- |
| `<Responsive>` + `WidthProvider` | `<ResponsiveGrid>` |
| `layouts`, `breakpoints`, `cols` | same shape (default columns are `{ lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }`) |
| `onLayoutChange(current, all)` | `onLayoutsChange(all, change)`; `change.breakpoint` names the breakpoint |
| `onBreakpointChange(breakpoint, cols)` | same |

Missing breakpoints are derived from the nearest breakpoint that has a layout, with columns scaled.

## Styling

RGL's `.react-grid-item`, `.react-grid-placeholder` and `.react-resizable-handle` correspond to `.l8-item`, `.l8-placeholder` and `.l8-resize`. No stylesheet import is needed in the browser; the base styles are injected and use zero specificity for visual defaults. For server rendering import `l8grid/styles.css`.
