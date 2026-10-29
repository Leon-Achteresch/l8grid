// Real-browser differential test: the same mouse and keyboard input on 0.2.1 and on the current version must lead
// to identical commits and identical tile geometry.
import { expect, test, type Page } from "@playwright/test";

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

async function state(page: Page) {
  await page.waitForTimeout(450);
  return page.evaluate(() => ({
    changes: window.l8.changes,
    tiles: [...document.querySelectorAll<HTMLElement>("[data-l8-id]")].map((node) => [node.dataset.l8Id, node.style.transform, node.style.width, node.style.height]),
    height: document.querySelector<HTMLElement>(".l8-grid")!.style.height,
  }));
}

// Waits until the grid has painted the latest pointer position: a release before that commits the previous frame's
// preview (in both versions), which would make the comparison depend on the browser's frame timing.
const settle = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function play(page: Page, version: "old" | "new", seed: number) {
  // tall enough that pointers never come near the edges, where time-based auto-scrolling would kick in
  await page.setViewportSize({ width: 1280, height: 2400 });
  await page.goto(`/?mode=compat&v=${version}&seed=${seed}`);
  await page.waitForSelector("[data-l8-id]");
  const trace: unknown[] = [];
  const next = random(seed * 7919);
  for (let step = 0; step < 6; step++) {
    const tiles = page.locator(".l8-item:not([data-l8-static])");
    const count = await tiles.count();
    if (!count) break;
    const tile = tiles.nth(Math.floor(next() * count));
    const action = next();
    if (action < 0.6) {
      const box = (await tile.boundingBox())!;
      const resize = action > 0.45 && (await tile.locator(".l8-resize").count()) > 0;
      const handle = resize ? tile.locator(".l8-resize").nth(Math.floor(next() * (await tile.locator(".l8-resize").count()))) : tile;
      const from = resize ? (await handle.boundingBox())! : box;
      let x = from.x + from.width * (0.2 + next() * 0.6);
      let y = from.y + from.height * (0.2 + next() * 0.6);
      await page.mouse.move(x, y);
      await page.mouse.down();
      const moves = 3 + Math.floor(next() * 8);
      for (let m = 0; m < moves; m++) {
        x += (next() - 0.5) * 300;
        y += (next() - 0.5) * 200;
        y = Math.max(120, y);
        await page.mouse.move(x, y, { steps: 1 + Math.floor(next() * 4) });
        await settle(page);
      }
      await page.mouse.up();
    } else {
      await tile.focus();
      const key = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"][Math.floor(next() * 4)]!;
      await page.keyboard.press(next() < 0.3 ? `Shift+${key}` : key);
    }
    trace.push(await state(page));
  }
  return trace;
}

for (let seed = 1; seed <= Number(process.env.E2E_COMPAT_SEEDS ?? 12); seed++) {
  test(`seed ${seed}: same result as 0.2.1`, async ({ page }) => {
    const before = await play(page, "old", seed);
    const after = await play(page, "new", seed);
    expect(after).toEqual(before);
  });
}
