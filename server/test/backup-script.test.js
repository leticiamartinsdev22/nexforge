import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('local backup script archives config and data outside the container', { skip: process.platform === 'win32' }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexforge local backup test '))
  try {
    const appDir = path.join(temp, 'server')
    const scriptsDir = path.join(appDir, 'scripts')
    const backupDir = path.join(temp, 'backups with spaces', 'nexforge')
    fs.mkdirSync(path.join(appDir, 'data'), { recursive: true })
    fs.mkdirSync(scriptsDir, { recursive: true })
    fs.writeFileSync(path.join(appDir, 'config.json'), JSON.stringify({ server: { name: 'test' } }))
    fs.writeFileSync(path.join(appDir, 'data', 'health.json'), JSON.stringify({ ok: true }))
    fs.copyFileSync(path.join(agentRoot, 'scripts', 'backup.sh'), path.join(scriptsDir, 'backup.sh'))

    const env = { ...process.env, NEXFORGE_APP_DIR: path.join(temp, 'missing-app'), NEXFORGE_BACKUP_DIR: backupDir }
    for (const key of ['DATABASE_URL', 'RESTIC_REPOSITORY', 'RESTIC_PASSWORD', 'RESTIC_PASSWORD_FILE']) delete env[key]
    const result = spawnSync('sh', [path.join(scriptsDir, 'backup.sh')], { cwd: appDir, env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const archiveName = fs.readdirSync(backupDir).find((name) => /^nexforge-.*\.tar\.gz$/.test(name))
    assert.ok(archiveName, 'backup archive was not created')
    const archive = path.join(backupDir, archiveName)
    const nestedArchive = execFileSync('tar', ['-xOzf', archive, 'agent-state.tar'])
    const contents = execFileSync('tar', ['-tf', '-'], { input: nestedArchive, encoding: 'utf8' })
    assert.match(contents, /^config\.json$/m)
    assert.match(contents, /^data\/health\.json$/m)
    const restore = path.join(temp, 'restore area')
    fs.mkdirSync(restore)
    execFileSync('tar', ['-xf', '-', '-C', restore], { input: nestedArchive })
    const checksum = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    assert.equal(checksum(path.join(restore, 'config.json')), checksum(path.join(appDir, 'config.json')))
    assert.equal(checksum(path.join(restore, 'data', 'health.json')), checksum(path.join(appDir, 'data', 'health.json')))
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
