import test from 'node:test'
import assert from 'node:assert/strict'
import { metricRangeStart } from '../src/metrics-range.js'

test('the all range starts at the Unix epoch so storage retention defines its extent', () => {
  assert.equal(metricRangeStart('all').getTime(), 0)
})

test('bounded metric ranges use the requested duration', () => {
  const now = 1_800_000_000_000
  assert.equal(metricRangeStart('1h', now).getTime(), now - 3_600_000)
  assert.equal(metricRangeStart('30d', now).getTime(), now - 30 * 86_400_000)
})

test('unknown metric ranges are rejected', () => {
  assert.equal(metricRangeStart('forever', 1_800_000_000_000), null)
})
