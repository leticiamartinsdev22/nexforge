const RANGES = Object.freeze({ '1h': 3600e3, '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, all: null })

export function metricRangeStart(range, now = Date.now()) {
  if (!Object.hasOwn(RANGES, range)) return null
  return RANGES[range] === null ? new Date(0) : new Date(now - RANGES[range])
}
