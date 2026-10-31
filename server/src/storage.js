import pg from 'pg'

const { Pool } = pg

export function createStorage({ connectionString, retentionDays = 30 }) {
  if (!connectionString) return null

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  })
  const retention = Math.max(1, Math.min(Number(retentionDays) || 30, 3650))

  return {
    async close() { await pool.end() },

    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nexforge_events (
          id BIGSERIAL PRIMARY KEY,
          occurred_at TIMESTAMPTZ NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('ok', 'bad')),
          message TEXT NOT NULL,
          source TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS nexforge_events_time_idx ON nexforge_events (occurred_at DESC);

        CREATE TABLE IF NOT EXISTS nexforge_metric_samples (
          sampled_at TIMESTAMPTZ PRIMARY KEY,
          cpu DOUBLE PRECISION NOT NULL,
          ram DOUBLE PRECISION NOT NULL,
          disk DOUBLE PRECISION NOT NULL,
          net DOUBLE PRECISION NOT NULL
        );

        CREATE TABLE IF NOT EXISTS nexforge_backup_schedule (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          freq TEXT NOT NULL,
          time TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      await pool.query('DELETE FROM nexforge_metric_samples WHERE sampled_at < NOW() - make_interval(days => $1::int)', [retention])
    },

    async health() {
      await pool.query('SELECT 1')
      return true
    },

    async loadEvents(limit = 200) {
      const { rows } = await pool.query(
        'SELECT occurred_at, level, message, source FROM nexforge_events ORDER BY occurred_at DESC, id DESC LIMIT $1',
        [limit],
      )
      return rows.map((row) => ({
        ts: new Date(row.occurred_at).getTime(), level: row.level, msg: row.message, source: row.source,
      }))
    },

    async saveEvent(event) {
      await pool.query(
        'INSERT INTO nexforge_events (occurred_at, level, message, source) VALUES ($1, $2, $3, $4)',
        [new Date(event.ts), event.level, event.msg, event.source],
      )
      await pool.query(`
        DELETE FROM nexforge_events
        WHERE id NOT IN (SELECT id FROM nexforge_events ORDER BY occurred_at DESC, id DESC LIMIT 200)
      `)
    },

    async loadMetrics(limit = 30) {
      const { rows } = await pool.query(
        'SELECT sampled_at, cpu, ram, disk, net FROM nexforge_metric_samples ORDER BY sampled_at DESC LIMIT $1',
        [limit],
      )
      return rows.reverse()
    },

    async loadMetricsRange(from, maxPoints = 240) {
      const durationSeconds = Math.max(60, (Date.now() - from.getTime()) / 1000)
      const bucketSeconds = Math.max(60, Math.ceil(durationSeconds / maxPoints / 60) * 60)
      const { rows } = await pool.query(`
        SELECT to_timestamp(floor(extract(epoch FROM sampled_at) / $2) * $2) AS sampled_at,
               AVG(cpu) AS cpu, AVG(ram) AS ram, AVG(disk) AS disk, AVG(net) AS net
        FROM nexforge_metric_samples
        WHERE sampled_at >= $1
        GROUP BY floor(extract(epoch FROM sampled_at) / $2)
        ORDER BY sampled_at ASC
      `, [from, bucketSeconds])
      return rows.map((row) => ({
        ts: new Date(row.sampled_at).getTime(), cpu: Number(row.cpu), ram: Number(row.ram),
        disk: Number(row.disk), net: Number(row.net),
      }))
    },

    async saveMetrics(sample) {
      await pool.query(`
        INSERT INTO nexforge_metric_samples (sampled_at, cpu, ram, disk, net)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (sampled_at) DO UPDATE
        SET cpu = EXCLUDED.cpu, ram = EXCLUDED.ram, disk = EXCLUDED.disk, net = EXCLUDED.net
      `, [new Date(sample.ts), sample.cpu, sample.ram, sample.disk, sample.net])
      await pool.query(
        'DELETE FROM nexforge_metric_samples WHERE sampled_at < NOW() - make_interval(days => $1::int)',
        [retention],
      )
    },

    async loadSchedule() {
      const { rows } = await pool.query('SELECT freq, time FROM nexforge_backup_schedule WHERE id = 1')
      return rows[0] ?? null
    },

    async saveSchedule(schedule) {
      await pool.query(`
        INSERT INTO nexforge_backup_schedule (id, freq, time, updated_at)
        VALUES (1, $1, $2, NOW())
        ON CONFLICT (id) DO UPDATE
        SET freq = EXCLUDED.freq, time = EXCLUDED.time, updated_at = NOW()
      `, [schedule.freq, schedule.time])
    },
  }
}
