import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Panel } from '../components/ui'

export default function NotFound() {
  return (
    <Panel title="Página não encontrada" sub="Este endereço não corresponde a uma tela do NexForge.">
      <div style={{ display: 'grid', justifyItems: 'start', gap: 16, padding: '18px 0' }}>
        <div style={{ fontSize: 40, lineHeight: 1, fontWeight: 800, color: 'var(--blue)' }}>404</div>
        <p style={{ margin: 0, color: 'var(--muted)' }}>Confira o endereço ou volte à visão geral.</p>
        <Link to="/" className="link teal"><Home size={16} aria-hidden="true" /> Voltar ao início</Link>
      </div>
    </Panel>
  )
}
