import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { GridItem } from "../src";

test("an external element can be dropped onto the grid", async ({ page }) => {
  await page.goto("/?mode=features");
  await page.locator(".palette").dragTo(page.locator('[data-l8-id="c"]'), { targetPosition: { x: 30, y: 30 } });
  await expect.poll(() => page.evaluate(() => (window.l8.events as [string][]).filter(([type]) => type === "drop").length)).toBe(1);
  await expect(page.locator(".l8-item")).toHaveCount(4);
  await expect(page.locator(".l8-placeholder")).not.toHaveAttribute("data-l8-visible");
});

test("keyboard grab mode moves only on drop", async ({ page }) => {
  await page.goto("/?mode=features&keyboard=grab");
  const a = page.locator('[data-l8-id="a"]');
  await a.focus();
  await page.keyboard.press("Space");
  await expect(a).toHaveAttribute("data-l8-grabbed");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.l8.changes.length)).toBe(0);
  await page.keyboard.press("Enter");
  const changes = await page.evaluate(() => window.l8.changes as [unknown, GridItem[]][]);
  expect(changes).toHaveLength(1);
  expect(changes[0]![1].find((item) => item.id === "a")).toMatchObject({ x: 4, y: 0 });
  await expect(page.locator(".l8-sr")).toHaveText(/dropped/);
});

test("rtl mirrors positions and pointer dragging", async ({ page }) => {
  await page.goto("/?mode=features&dir=rtl");
  const grid = (await page.locator(".l8-grid").boundingBox())!;
  const a = page.locator('[data-l8-id="a"]');
  const box = (await a.boundingBox())!;
  expect(Math.round(box.x + box.width)).toBe(Math.round(grid.x + grid.width));
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 20 - box.width - 20, box.y + 20, { steps: 10 });
  await page.mouse.up();
  const changes = await page.evaluate(() => window.l8.changes as [unknown, GridItem[]][]);
  expect(changes.at(-1)![1].find((item) => item.id === "a")).toMatchObject({ x: 4, y: 0 });
});

test("ResponsiveGrid switches breakpoints with the width", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("/?mode=responsive");
  const a = page.locator('[data-l8-id="a"]');
  const wide = (await a.boundingBox())!;
  await page.setViewportSize({ width: 700, height: 800 });
  await expect.poll(() => page.evaluate(() => window.l8.events.at(-1))).toEqual(["breakpoint", "xs", 8]);
  const narrow = (await a.boundingBox())!;
  expect(narrow.width).toBeLessThan(wide.width);
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect.poll(() => page.evaluate(() => window.l8.events.at(-1))).toEqual(["breakpoint", "lg", 24]);
  expect((await a.boundingBox())!.x).toBeCloseTo(wide.x, 0);
});

test("server-rendered markup is laid out before any script runs", async ({ page }) => {
  // the built package, as a server would load it (run `npm run build` first)
  const { Grid, gridStyles } = (await import("../dist/index.mjs" as string)) as typeof import("../src");
  const layout: GridItem[] = [
    { id: "a", x: 0, y: 0, w: 4, h: 2 },
    { id: "b", x: 4, y: 0, w: 8, h: 3 },
    { id: "c", x: 2, y: Infinity, w: 3, h: 1 },
  ];
  const html = renderToString(createElement(Grid, { layout, cols: 12, rowHeight: 40, gap: 10, renderItem: (id: string) => id, onLayoutChange: () => {} }));
  await page.setContent(`<style>body{margin:0}${gridStyles}</style><div style="width:1210px">${html}</div>`);
  const step = (1210 - 11 * 10) / 12 + 10;
  const expectBox = async (id: string, expected: { x: number; y: number; width: number; height: number }) => {
    const actual = (await page.locator(`[data-l8-id="${id}"]`).boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const) expect(actual[key]).toBeCloseTo(expected[key], 1);
  };
  await expectBox("a", { x: 0, y: 0, width: 4 * step - 10, height: 90 });
  await expectBox("b", { x: 4 * step, y: 0, width: 8 * step - 10, height: 140 });
  await expectBox("c", { x: 2 * step, y: 150, width: 3 * step - 10, height: 40 });
  expect((await page.locator(".l8-grid").boundingBox())!.height).toBe(190);
});
