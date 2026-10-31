import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, TriangleAlert, ShieldCheck } from 'lucide-react'
import { useData } from '../store-utils'
import { LIVE, POLL_MS } from '../config'
import { fetchLogs } from '../api'
import { demoLogs } from '../data'
import { Panel, Stats } from '../components/ui'

const COL = { INFO: '#6b7488', WARN: '#f5a524', ERROR: '#ff5470' }

export default function Logs() {
  const { logSources } = useData()
  const [sel, setSel] = useState('')
  const [lines, setLines] = useState([])
  const [err, setErr] = useState(false)
  const activeSel = logSources.includes(sel) ? sel : logSources[0] ?? ''

  const load = useCallback(async () => {
    if (!LIVE || !activeSel) return
    try {
      const result = await fetchLogs(activeSel)
      setLines(result.lines)
      setErr(false)
    } catch {
      setLines([])
      setErr(true)
    }
  }, [activeSel])

  useEffect(() => {
    if (!LIVE || !activeSel) return undefined
    const initial = setTimeout(() => { void load() }, 0)
    const id = setInterval(() => { void load() }, POLL_MS)
    return () => { clearTimeout(initial); clearInterval(id) }
  }, [activeSel, load])

  const visibleLines = LIVE ? lines : activeSel ? demoLogs(activeSel) : []
  const n = (level) => visibleLines.filter((line) => line.lvl === level).length
  return (
    <div>
      <Stats items={[
        { icon: LayoutGrid, label: 'Linhas carregadas', value: visibleLines.length, sub: activeSel ? `fonte: ${activeSel.toLowerCase()}` : 'nenhuma fonte', tone: 'blue' },
        { icon: TriangleAlert, label: 'Erros na janela', value: n('ERROR'), sub: n('ERROR') ? 'verifique a fonte' : 'Nenhum erro', tone: n('ERROR') ? 'bad' : 'ok' },
        { icon: TriangleAlert, label: 'Avisos', value: n('WARN'), sub: n('WARN') ? 'veja os avisos' : 'Nenhum aviso', tone: n('WARN') ? 'warn' : 'ok' },
        { icon: ShieldCheck, label: 'Correções (FIX)', value: 0, sub: 'Auto-heal do guard', tone: 'ok' },
        { icon: LayoutGrid, label: 'Fontes disponíveis', value: logSources.length, sub: 'Serviços com log exposto', tone: 'warn' },
      ]} />
      <Panel title="Visualizador de logs" sub="últimas 180 linhas por fonte (snapshot)"
        action={<button onClick={() => { void load() }} style={{ background: 'none', border: 0, color: 'var(--teal)', fontWeight: 700, fontSize: 12 }}>Atualizar ›</button>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {logSources.length === 0 && <span style={{ color: 'var(--dimmer)', fontSize: 13 }}>Nenhum container encontrado (Docker indisponível?).</span>}
          {logSources.map((source) => <button key={source} className={`fchip ${activeSel === source ? 'on' : ''}`} onClick={() => setSel(source)}>{source}</button>)}
        </div>
        <div className="logbox">
          {err && <div style={{ color: 'var(--bad)' }}>Falha ao buscar os logs.</div>}
          {!err && visibleLines.length === 0 && <div style={{ fontWeight: 600 }}>-- No entries --</div>}
          {visibleLines.map((line, index) => (
            <div key={index} style={{ padding: '2px 0' }}>
              <span style={{ color: 'var(--dim)' }}>{line.t}</span> <span style={{ color: COL[line.lvl] }}>{line.lvl.padEnd(5)}</span> {line.msg}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
