// LRU session cache — avoids re-fetching recent session histories

const MAX = 20

export function getOrCreate<T>(map: Map<string, T>, key: string, create: () => T): T {
  if (map.has(key)) {
    const v = map.get(key) as T
    map.delete(key)
    map.set(key, v) // refresh insertion order
    return v
  }
  const v = create()
  map.set(key, v)
  while (map.size > MAX) {
    const oldest = map.keys().next().value
    if (typeof oldest === 'string') map.delete(oldest)
    else break
  }
  return v
}
