import { describe, expect, it } from "vitest";
import { resizeItems, rowsForAspectRatio, rowsForContent } from "./sizing";

describe("content sizing", () => {
  it("includes gaps between rows and never clips a fractional row", () => {
    expect(rowsForContent(60, 24, 12)).toBe(2);
    expect(rowsForContent(60.1, 24, 12)).toBe(3);
    expect(rowsForContent(0, 24, 12)).toBe(1);
    expect(rowsForAspectRatio(320, 16 / 9, 24, 12)).toBe(6);
  });

  it("rejects invalid dimensions instead of returning an unusable layout", () => {
    expect(() => rowsForContent(NaN, 24)).toThrow(RangeError);
    expect(() => rowsForContent(100, 0)).toThrow(RangeError);
    expect(() => rowsForContent(100, 24, -1)).toThrow(RangeError);
    expect(() => rowsForAspectRatio(100, Infinity, 24)).toThrow(RangeError);
  });
});

describe("explicit shared sizes", () => {
  it("respects per-item constraints, fixed items and immutability", () => {
    const layout = [
      { id: "a", x: 0, y: 0, w: 2, h: 2, maxW: 3 },
      { id: "b", x: 4, y: 0, w: 2, h: 2, static: true },
      { id: "c", x: 8, y: 0, w: 2, h: 2, resizable: false },
    ];
    const result = resizeItems(layout, ["a", "b", "c"], { w: 4, h: 3 }, { cols: 12, compaction: "none" });
    expect(result.find(i => i.id === "a")).toMatchObject({ w: 3, h: 3 });
    expect(result.find(i => i.id === "b")).toMatchObject({ w: 2, h: 2 });
    expect(result.find(i => i.id === "c")).toMatchObject({ w: 2, h: 2 });
    expect(layout[0]).toMatchObject({ w: 2, h: 2 });
  });

  it("resolves overlaps after changing multiple sizes", () => {
    const result = resizeItems([{ id: "a", x: 0, y: 0, w: 2, h: 2 }, { id: "b", x: 2, y: 0, w: 2, h: 2 }], ["a", "b"], { w: 4, h: 3 }, { cols: 8, compaction: "none" });
    const [a, b] = result;
    expect(a!.x + a!.w <= b!.x || b!.x + b!.w <= a!.x || a!.y + a!.h <= b!.y || b!.y + b!.h <= a!.y).toBe(true);
  });
});
