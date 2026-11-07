import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SYSTEM_ROOTS = ['/etc', '/usr', '/var', '/proc', '/sys', '/dev', '/run', '/boot', '/root', '/bin', '/sbin', '/lib', '/lib64']

function resolveExistingPrefix(value) {
  let current = path.resolve(value)
  const tail = []
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) throw new Error('invalid_backup_path')
    tail.unshift(path.basename(current))
    current = parent
  }
  return path.resolve(fs.realpathSync(current), ...tail)
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

export function validateBackupDirectory(value, { projectRoot, allowTemp = false, tempRoot } = {}) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) throw new Error('invalid_backup_path')
  if (value.split(/[\\/]+/).includes('..')) throw new Error('invalid_backup_path')
  const normalized = path.resolve(value)
  const root = path.parse(normalized).root
  if (normalized === root) throw new Error('invalid_backup_path')

  for (const systemRoot of SYSTEM_ROOTS) {
    const systemPath = path.resolve(systemRoot)
    if (isWithin(normalized, systemPath)) throw new Error('invalid_backup_path')
  }

  const allowedRoots = [path.resolve('/backups')]
  if (projectRoot) allowedRoots.push(path.resolve(projectRoot, '..', 'backups'))
  if (allowTemp) allowedRoots.push(path.resolve(tempRoot || os.tmpdir()))

  const candidate = resolveExistingPrefix(normalized)
  const resolvedAllowedRoots = allowedRoots.map((allowed) => resolveExistingPrefix(allowed))
  if (!resolvedAllowedRoots.some((allowed) => isWithin(candidate, allowed))) throw new Error('invalid_backup_path')
  return candidate
}
