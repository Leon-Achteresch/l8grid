// Base styles. The first block is unchanged since 0.2; rules for newer, opt-in features only match attributes
// that older setups never set (data-l8-ready is missing only before mount, e.g. in server-rendered HTML).
export const STYLES = `
.l8-grid{position:relative;box-sizing:content-box;--l8-handle:16px}
.l8-item{position:absolute;top:0;left:0;box-sizing:border-box;container-type:size;touch-action:manipulation;-webkit-touch-callout:none}
:where(.l8-grid:not([data-l8-handle-mode])>.l8-item:not([data-l8-static],[data-l8-nodrag])),:where(.l8-grid[data-l8-handle-mode]>.l8-item:not([data-l8-nodrag]) [data-l8-handle]){cursor:grab}
.l8-grid[data-l8-handle-mode] [data-l8-handle],.l8-grid [data-l8-resize]{touch-action:none}
.l8-grid[data-l8-animate] .l8-item,.l8-grid[data-l8-animate] .l8-placeholder{transition:transform .22s cubic-bezier(.2,.8,.2,1),width .22s cubic-bezier(.2,.8,.2,1),height .22s cubic-bezier(.2,.8,.2,1)}
.l8-grid .l8-item[data-l8-active]{transition:none;z-index:3;will-change:transform;-webkit-user-select:none;user-select:none}
:where(.l8-grid .l8-item[data-l8-active=move]){cursor:grabbing}
.l8-resize[data-l8-resize=n],.l8-resize[data-l8-resize=s],.l8-item[data-l8-edge=n],.l8-item[data-l8-edge=s]{cursor:ns-resize}
.l8-resize[data-l8-resize=e],.l8-resize[data-l8-resize=w],.l8-item[data-l8-edge=e],.l8-item[data-l8-edge=w]{cursor:ew-resize}
.l8-resize[data-l8-resize=ne],.l8-resize[data-l8-resize=sw],.l8-item[data-l8-edge=ne],.l8-item[data-l8-edge=sw]{cursor:nesw-resize}
.l8-resize[data-l8-resize=nw],.l8-resize[data-l8-resize=se],.l8-item[data-l8-edge=nw],.l8-item[data-l8-edge=se]{cursor:nwse-resize}
.l8-item[data-l8-settling]{z-index:2}
.l8-placeholder{position:absolute;top:0;left:0;box-sizing:border-box;pointer-events:none;display:none}
:where(.l8-placeholder){border-radius:6px;background:rgb(128 128 128/.18)}
.l8-placeholder[data-l8-visible]{display:block}
.l8-resize{position:absolute;width:var(--l8-handle);height:var(--l8-handle)}
.l8-resize:is([data-l8-resize=n],[data-l8-resize=s]){left:var(--l8-handle);right:var(--l8-handle);width:auto;height:calc(var(--l8-handle)/2)}
.l8-resize:is([data-l8-resize=e],[data-l8-resize=w]){top:var(--l8-handle);bottom:var(--l8-handle);width:calc(var(--l8-handle)/2);height:auto}
.l8-resize:is([data-l8-resize=n],[data-l8-resize=ne],[data-l8-resize=nw]){top:0}
.l8-resize:is([data-l8-resize=s],[data-l8-resize=se],[data-l8-resize=sw]){bottom:0}
.l8-resize:is([data-l8-resize=e],[data-l8-resize=ne],[data-l8-resize=se]){right:0}
.l8-resize:is([data-l8-resize=w],[data-l8-resize=nw],[data-l8-resize=sw]){left:0}
@media (pointer:coarse){.l8-grid{--l8-handle:28px}}
.l8-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.l8-grid .l8-item,.l8-grid .l8-placeholder{transition:none}}
.l8-grid:not([data-l8-ready]){height:calc(var(--l8-rows,0)*(var(--l8-row-height,24px) + var(--l8-gap,12px)) - var(--l8-gap,12px))}
.l8-grid:not([data-l8-ready])>.l8-item{--l8-cw:calc((100% - (var(--l8-cols,24) - 1)*var(--l8-gap,12px))/var(--l8-cols,24));left:calc(var(--l8-x)*(var(--l8-cw) + var(--l8-gap,12px)));top:calc(var(--l8-y)*(var(--l8-row-height,24px) + var(--l8-gap,12px)));width:calc(var(--l8-w)*var(--l8-cw) + (var(--l8-w) - 1)*var(--l8-gap,12px));height:calc(var(--l8-h)*var(--l8-row-height,24px) + (var(--l8-h) - 1)*var(--l8-gap,12px))}
.l8-grid[data-l8-rtl]:not([data-l8-ready])>.l8-item{right:calc(var(--l8-x)*(var(--l8-cw) + var(--l8-gap,12px)));left:auto}
.l8-grid .l8-item[data-l8-grabbed]{z-index:3}
:where(.l8-grid .l8-item[data-l8-grabbed]){outline:2px dashed currentColor;outline-offset:2px}
`;
