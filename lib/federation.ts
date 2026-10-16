/**
 * Federation resolution helpers.
 *
 * ## sessionStorage caching convention (shared with `stellarToml.ts`)
 *
 * Both this module and `stellarToml.ts` cache resolved results in
 * `sessionStorage` using the same convention. Any change to the key format or
 * value shape here MUST be mirrored in `stellarToml.ts` (and vice versa), or
 * the two modules will silently stop sharing cached entries.
 *
 * ### Key format
 *
 * Keys are namespaced with a shared prefix followed by the lookup identifier:
 *
 *   `<prefix>:<identifier>`
 *
 * - `<prefix>` is the module-level cache namespace shared by both modules.
 * - `<identifier>` is the normalized lookup key for the request (e.g. the
 *   federation domain / Stellar TOML location being resolved).
 *
 * ### Value shape
 *
 * Values are JSON-serialized cached resolution results. Consumers must treat a
 * missing key, an unparsable value, or a value that fails validation as a cache
 * miss and fall back to a fresh network resolution.
 *
 * ### TTL / invalidation
 *
 * The TTL is **session-scoped only**: entries live for the lifetime of the
 * browser session (i.e. until the tab/session ends) and are not expired by any
 * time-based TTL. There is currently no explicit eviction on a later failed
 * verification — a previously cached successful result is NOT invalidated when
 * a subsequent verification fails. See the related cache-invalidation
 * bugs/enhancements tracked for this convention; keep this documentation in
 * sync with that behavior until those land.
 */

// NOTE: The sessionStorage key convention documented above is shared with
// `stellarToml.ts`. Update both modules together when changing the key format,
// value shape, or invalidation rules.
