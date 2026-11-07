import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { validateBackupDirectory } from '../src/backup-path.js'

test('backup directory accepts an absolute temporary path with spaces in tests', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge backup path '))
  try {
    const configured = path.join(temp, 'nested backup', 'nexforge')
    assert.equal(validateBackupDirectory(configured, { allowTemp: true, tempRoot: temp }), configured)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('backup directory rejects relative, traversal, root, and system paths', () => {
  for (const value of ['relative/backups', path.join(os.tmpdir(), '..', 'etc'), path.parse(os.tmpdir()).root, '/etc/nexforge', '/usr/local/share/nexforge']) {
    assert.throws(() => validateBackupDirectory(value, { allowTemp: true }), { message: 'invalid_backup_path' })
  }
})

test('backup directory rejects symlinks that escape every permitted root', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge backup symlink permitted '))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge backup symlink outside '))
  try {
    const link = path.join(temp, 'escape')
    try { fs.symlinkSync(outside, link, 'dir') } catch { t.skip('symlink creation unavailable'); return }
    assert.throws(() => validateBackupDirectory(link, { allowTemp: true, tempRoot: temp }), { message: 'invalid_backup_path' })
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})
