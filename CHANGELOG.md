# Changelog

All notable changes to this project are documented here. The project follows [semantic versioning](https://semver.org).

## 0.3.0

Everything in this release is opt-in. Code written for 0.2 runs unchanged, layouts are stored in the same format in both directions, and a differential test checks that the grid behaves exactly like 0.2.1 when only 0.2 props are used.

### Added

- `ResponsiveGrid`: layouts and columns per breakpoint, switched by container width. Missing breakpoints are derived from the nearest one. Helpers `getBreakpoint` and `layoutForBreakpoint`.
- Dropping from outside: `onDrop` and `droppingItem` accept HTML drag-and-drop sources (e.g. a widget palette) with a live preview.
- Interaction events: `onInteractionStart`, `onPreviewChange`, `onInteractionEnd`.
- `maxRows`, `preventCollision` and `allowOverlap`.
- `direction="rtl"` for right-to-left grids.
- Keyboard grab mode (`keyboard="grab"`): Space/Enter picks up and drops, arrows preview, Escape cancels, with announcements. New optional `GridMessages`: `grabInstructions`, `grabbed`, `dropped`, `cancelled`, `blocked`.
- `useGridItem()`: the tile's position and size inside `renderItem`, re-rendering only that tile.
- `useLayoutHistory()`: undo and redo.
- `useGrid()`: headless hook for custom markup. `GridController` gained `getLayout`, `getItem`, `subscribe` and an optional third constructor argument for event hooks.
- Server rendering: initial positions are rendered as CSS custom properties and laid out by the stylesheet before mount. The stylesheet is exported as `l8grid/styles.css` and as the `gridStyles` string. `useLayoutEffect` is no longer called on the server.
- `rootRef` prop.

### Infrastructure

- GitHub Actions CI: typecheck, lint (oxlint), unit tests, the differential test against 0.2.1, build, bundle size limit and Playwright browser tests, with React 18 and 19.
- Playwright tests in Chromium (Firefox and WebKit in a separate, informational job), including a real-browser comparison with 0.2.1.
- Demo deployment of the playground to GitHub Pages, and npm publishing with provenance on GitHub releases.

## 0.2.1

- Dragging reaches the grid edges and sorts rows like a list; see the release commit for details.

## 0.2.0

- Initial public release.
