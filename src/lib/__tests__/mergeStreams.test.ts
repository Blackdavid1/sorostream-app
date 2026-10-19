import { describe, it, expect } from "vitest";
import { mergeById } from "../mergeStreams";

describe("mergeById", () => {
  it("returns the previous array when nothing changed", () => {
    const prev = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
    expect(mergeById(prev, [{ id: "a", n: 1 }, { id: "b", n: 2 }])).toBe(prev);
  });

  it("keeps references of unchanged items and replaces changed ones", () => {
    const prev = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
    const out = mergeById(prev, [{ id: "a", n: 1 }, { id: "b", n: 3 }]);
    expect(out).not.toBe(prev);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).toEqual({ id: "b", n: 3 });
  });

  it("handles added and removed items", () => {
    const prev = [{ id: "a", n: 1 }];
    expect(mergeById(prev, [{ id: "a", n: 1 }, { id: "c", n: 9 }])).toHaveLength(2);
    expect(mergeById(prev, [])).toEqual([]);
  });
});

describe("mergeById with Date fields (#712)", () => {
  it("treats items that differ only by Date instance (same timestamp) as unchanged", () => {
    const prev = [
      { id: "a", endTime: new Date("2026-01-01T00:00:00Z") },
      { id: "b", endTime: new Date("2026-02-01T00:00:00Z") },
    ];
    const next = [
      { id: "a", endTime: new Date("2026-01-01T00:00:00Z") },
      { id: "b", endTime: new Date("2026-02-01T00:00:00Z") },
    ];
    expect(next[0].endTime).not.toBe(prev[0].endTime);
    expect(mergeById(prev, next)).toBe(prev);
  });

  it("still detects a genuinely different Date value", () => {
    const prev = [
      { id: "a", endTime: new Date("2026-01-01T00:00:00Z") },
      { id: "b", endTime: new Date("2026-02-01T00:00:00Z") },
    ];
    const next = [
      { id: "a", endTime: new Date("2026-01-01T00:00:00Z") },
      { id: "b", endTime: new Date("2026-03-01T00:00:00Z") },
    ];
    const out = mergeById(prev, next);
    expect(out).not.toBe(prev);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).toBe(next[1]);
  });

  it("does not treat a Date and a non-Date as equal", () => {
    const ts = new Date("2026-01-01T00:00:00Z");
    const prev = [{ id: "a", endTime: ts as Date | number }];
    const next = [{ id: "a", endTime: ts.getTime() as Date | number }];
    expect(mergeById(prev, next)[0]).toBe(next[0]);
  });
});
