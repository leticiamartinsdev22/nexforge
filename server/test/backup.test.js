import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBackup } from '../src/backup.js'

test('database schedule stays authoritative if its optional file mirror fails', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge-backup-test-'))
  try {
    const blockedPath = path.join(temp, 'not-a-directory')
    fs.writeFileSync(blockedPath, 'x')
    let saved
    const store = { async saveSchedule(value) { saved = value }, async loadSchedule() { return null } }
    const backup = createBackup({ cfg: { backups: { command: ['/bin/true'] } }, dataDir: blockedPath, store })
    const result = await backup.setSchedule({ freq: 'Semanal', time: '04:20' })
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(saved, { freq: 'Semanal', time: '04:20' })
    assert.deepEqual(backup.state().schedule, saved)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('failed database persistence leaves the active schedule unchanged', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge-backup-test-'))
  try {
    const backup = createBackup({
      cfg: { backups: { command: ['/bin/true'] } }, dataDir: temp,
      store: { async saveSchedule() { throw new Error('database unavailable') } },
    })
    assert.deepEqual(await backup.setSchedule({ freq: 'Diária', time: '05:30' }), { ok: false, reason: 'persistence' })
    assert.notDeepEqual(backup.state().schedule, { freq: 'Diária', time: '05:30' })
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('schedule mirror replaces an existing file atomically', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge-backup-test-'))
  try {
    const file = path.join(temp, 'schedule.json')
    fs.writeFileSync(file, JSON.stringify({ freq: 'Diária', time: '03:15' }))
    const backup = createBackup({ cfg: { backups: { command: ['/bin/true'] } }, dataDir: temp, store: null })
    const result = await backup.setSchedule({ freq: 'Semanal', time: '04:20' })
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { freq: 'Semanal', time: '04:20' })
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})


test('manual backup rejects concurrent runs until the configured command finishes', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge-backup-run-test-'))
  let finish
  const completed = new Promise((resolve) => { finish = resolve })
  const backup = createBackup({
    cfg: { backups: { command: [process.execPath, '-e', 'setTimeout(() => {}, 400)'] } },
    dataDir: temp,
    onResult: finish,
  })
  try {
    assert.deepEqual(backup.run('manual'), { ok: true })
    assert.deepEqual(backup.run('manual'), { ok: false, reason: 'running' })
    const result = await Promise.race([
      completed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('backup command timed out')), 3000)),
    ])
    assert.equal(result.origin, 'manual')
    assert.equal(result.ok, true)
  } finally {
    backup.close()
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
