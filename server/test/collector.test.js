import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeEvents, summarizeSecurityChecks, summarizeStats } from '../src/collector.js'

const event = (ts, msg, source = 'nexforge') => ({ ts, level: 'bad', msg, source })

test('mergeEvents removes records duplicated between the JSON file and PostgreSQL', () => {
  const older = event(1000, 'service stopped')
  const newer = event(2000, 'service restarted')
  const merged = mergeEvents([older, newer, newer], [older, newer])
  assert.deepEqual(merged, [newer, older])
})

test('mergeEvents keeps distinct events and returns only the latest 200', () => {
  const events = Array.from({ length: 220 }, (_, index) => event(index, `event ${index}`))
  const merged = mergeEvents(events)
  assert.equal(merged.length, 200)
  assert.equal(merged[0].ts, 219)
  assert.equal(merged.at(-1).ts, 20)
})

test('container CPU usage accounts for the number of available cores', () => {
  const stats = (cores) => ({
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
    cpu_stats: {
      cpu_usage: { total_usage: 200 }, system_cpu_usage: 1100,
      online_cpus: cores,
    },
    memory_stats: { usage: 0 },
  })
  assert.equal(summarizeStats(stats(1)).cpu, 100)
  assert.equal(summarizeStats(stats(8)).cpu, 800)
})

test('container CPU usage falls back to the per-CPU usage count', () => {
  const stats = {
    precpu_stats: { cpu_usage: { total_usage: 10 }, system_cpu_usage: 100 },
    cpu_stats: {
      cpu_usage: { total_usage: 20, percpu_usage: [1, 1, 1, 1] }, system_cpu_usage: 110,
    },
    memory_stats: { usage: 0 },
  }
  assert.equal(summarizeStats(stats).cpu, 400)
})

test('security checks omit certificates when no domains are configured', () => {
  assert.deepEqual(summarizeSecurityChecks({ dockerOk: true, disk: 50, ram: 60 }), { checksOk: 3, checksTotal: 3 })
})

test('security checks apply configured host thresholds and validate configured certificates', () => {
  const healthy = summarizeSecurityChecks({
    dockerOk: true, disk: 84, ram: 70, diskThreshold: 85, ramThreshold: 90,
    domains: [{ ssl: 15 }],
  })
  const failing = summarizeSecurityChecks({
    dockerOk: true, disk: 86, ram: 70, diskThreshold: 85, ramThreshold: 90,
    domains: [{ ssl: 14 }],
  })
  assert.deepEqual(healthy, { checksOk: 4, checksTotal: 4 })
  assert.deepEqual(failing, { checksOk: 2, checksTotal: 4 })
})
