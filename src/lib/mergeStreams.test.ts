import { describe, it, expect } from 'vitest';
import { mergeById } from './mergeStreams';

type Item = { id: string; value: number; label: string };

describe('mergeById', () => {
  it('returns prev itself when a fetch returns structurally identical data', () => {
    const prev: Item[] = [
      { id: 'a', value: 1, label: 'Alpha' },
      { id: 'b', value: 2, label: 'Beta' },
      { id: 'c', value: 3, label: 'Gamma' },
    ];

    // Newly-constructed, structurally identical instances (distinct references).
    const next: Item[] = [
      { id: 'a', value: 1, label: 'Alpha' },
      { id: 'b', value: 2, label: 'Beta' },
      { id: 'c', value: 3, label: 'Gamma' },
    ];

    const result = mergeById(prev, next);

    // The no-op case must preserve the exact prev array reference.
    expect(result).toBe(prev);
    // And each unchanged item reference must be preserved.
    expect(result[0]).toBe(prev[0]);
    expect(result[1]).toBe(prev[1]);
    expect(result[2]).toBe(prev[2]);
  });

  it('updates only the reference of the item that changed', () => {
    const prev: Item[] = [
      { id: 'a', value: 1, label: 'Alpha' },
      { id: 'b', value: 2, label: 'Beta' },
      { id: 'c', value: 3, label: 'Gamma' },
    ];

    const next: Item[] = [
      { id: 'a', value: 1, label: 'Alpha' },
      { id: 'b', value: 99, label: 'Beta' },
      { id: 'c', value: 3, label: 'Gamma' },
    ];

    const result = mergeById(prev, next);

    // Unchanged items keep their original references.
    expect(result[0]).toBe(prev[0]);
    expect(result[2]).toBe(prev[2]);
    // The changed item gets a new reference reflecting the updated data.
    expect(result[1]).not.toBe(prev[1]);
    expect(result[1]).toEqual(next[1]);
  });
});
