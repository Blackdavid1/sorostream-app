/**
 * Client-side tag storage backed by localStorage.
 * Tags are stored as a JSON object keyed by stream ID.
 *
 * Shape: { [streamId: string]: string[] }
 */

const STORAGE_KEY = "sorostream-stream-tags";

type TagMap = Record<string, string[]>;

function load(): TagMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as TagMap;
    }
  } catch {}
  return {};
}

function save(map: TagMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/** Return all tags for a given stream (empty array if none). */
export function getTagsForStream(streamId: string): string[] {
  const map = load();
  return map[streamId] ?? [];
}

/** Replace the entire tag list for a stream. */
export function setTagsForStream(streamId: string, tags: string[]): void {
  const map = load();
  if (tags.length === 0) {
    delete map[streamId];
  } else {
    map[streamId] = tags;
  }
  save(map);
}

/** Add a single tag to a stream (no-op if already present). */
export function addTagToStream(streamId: string, tag: string): void {
  const trimmed = tag.trim();
  if (!trimmed) return;
  const map = load();
  const existing = map[streamId] ?? [];
  if (existing.includes(trimmed)) return;
  map[streamId] = [...existing, trimmed];
  save(map);
}

/** Remove a single tag from a stream. */
export function removeTagFromStream(streamId: string, tag: string): void {
  const map = load();
  const existing = map[streamId] ?? [];
  const updated = existing.filter((t) => t !== tag);
  if (updated.length === 0) {
    delete map[streamId];
  } else {
    map[streamId] = updated;
  }
  save(map);
}

/** Return every unique tag used across all streams. */
export function getAllTags(): string[] {
  const map = load();
  const set = new Set<string>();
  Object.values(map).forEach((tags) => tags.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

/**
 * Rename a tag across every stream. If a stream already has `newName`,
 * the two tags are merged so no stream ends up with a duplicate.
 */
export function renameTag(oldName: string, newName: string): void {
  const to = newName.trim();
  if (!to || oldName === to) return;
  const map = load();
  for (const [streamId, tags] of Object.entries(map)) {
    if (!tags.includes(oldName)) continue;
    map[streamId] = Array.from(
      new Set(tags.map((t) => (t === oldName ? to : t))),
    );
  }
  save(map);
}

/** Return the entire tag map. */
export function getTagMap(): TagMap {
  return load();
}
