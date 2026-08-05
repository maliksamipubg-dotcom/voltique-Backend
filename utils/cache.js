// Tiny in-memory TTL cache used to serve frequently requested catalog data
// (product list, category list) without hitting MongoDB on every request.
//
// Products and categories change rarely (only through admin mutations), so a
// short-lived cache dramatically reduces response time while invalidation
// keeps the data fresh.
const cache = new Map()

const DEFAULT_TTL_MS = 60 * 1000

// Hard cap so an instance that sees many unique keys never grows unbounded.
const MAX_ENTRIES = 100

const get = (key) => {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

const set = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

const invalidate = (key) => {
  cache.delete(key)
}

const invalidateByPrefix = (prefix) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

const clear = () => cache.clear()

export default { get, set, invalidate, invalidateByPrefix, clear }
