const emptyServer = {
  name: 'Aguardando agente', id: 'sem-dados', region: 'Não informado', provider: 'Não informado', ip: 'Aguardando dados',
  os: 'Aguardando dados', cpu: 0, ram: 0, disk: 0, vcpu: 0, load: 0, uptimeDays: 0, netMBs: 0,
  ramUsed: '0', ramTotal: '0', diskUsed: '0', diskTotal: '0', uptime: 'Aguardando dados', uptimeFull: 'Aguardando dados',
  pendingReboot: false,
}

export const server = { ...emptyServer }
export const apps = []
export const domains = []
export const dbs = []
export const backups = []
export const alerts = []
export const events = []
export const hardening = []
export const logSources = []
export const security = { packages: null, rebootPending: false, lastBoot: 'Aguardando dados', publicPorts: 0, checksOk: 0, checksTotal: 0 }
export const offsite = { destination: 'Aguardando configuração', lastSync: 'Sem sincronização', encryption: 'Não informado' }
export const backup = { enabled: false, running: false, schedule: { freq: 'Diária', time: '03:15' }, next: null }

export const emptySnapshot = { server, apps, domains, dbs, backups, alerts, events, hardening, security, offsite, logSources, backup }
