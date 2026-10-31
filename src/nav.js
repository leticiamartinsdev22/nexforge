import {
  LayoutGrid, Server, Boxes, Globe, Database, Archive, Activity,
  TriangleAlert, ScrollText, Shield, Share2, Settings,
} from 'lucide-react'

export const NAV = [
  {
    section: 'Painel',
    items: [{ to: '/', label: 'Visão Geral', icon: LayoutGrid }],
  },
  {
    section: 'Infraestrutura',
    items: [
      { to: '/servidores', label: 'Servidores', icon: Server },
      { to: '/aplicacoes', label: 'Aplicações', icon: Boxes },
      { to: '/dominios', label: 'Domínios', icon: Globe },
      { to: '/bancos', label: 'Bancos de Dados', icon: Database },
      { to: '/backups', label: 'Backups', icon: Archive },
      { to: '/monitoramento', label: 'Monitoramento', icon: Activity },
    ],
  },
  {
    section: 'Operações',
    items: [
      { to: '/alertas', label: 'Alertas', icon: TriangleAlert },
      { to: '/logs', label: 'Logs', icon: ScrollText },
      { to: '/seguranca', label: 'Segurança', icon: Shield },
      { to: '/topologia', label: 'Topologia', icon: Share2 },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]
