import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export default function RowActions({ label = 'Ações', items = [] }) {
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!position) return undefined
    const closeOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setPosition(null)
    }
    const closeOnEscape = (event) => { if (event.key === 'Escape') setPosition(null) }
    const closeOnLayout = () => setPosition(null)
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnLayout)
    window.addEventListener('scroll', closeOnLayout, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnLayout)
      window.removeEventListener('scroll', closeOnLayout, true)
    }
  }, [position])

  const toggle = () => {
    if (position) { setPosition(null); return }
    const rect = buttonRef.current.getBoundingClientRect()
    const width = 220
    const height = items.length * 40 + 12
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const below = rect.bottom + 5
    const top = below + height < window.innerHeight ? below : Math.max(8, rect.top - height - 5)
    setPosition({ left, top })
  }

  return (
    <>
      <button ref={buttonRef} type="button" className="row-action-trigger" aria-label={label} aria-haspopup="menu"
        aria-expanded={Boolean(position)} onClick={toggle}>
        <MoreVertical size={17} aria-hidden="true" />
      </button>
      {position && createPortal(
        <div ref={menuRef} className="row-action-menu" role="menu" style={position}>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.label} type="button" role="menuitem" disabled={item.disabled} className={item.danger ? 'danger' : ''}
                onClick={() => { setPosition(null); item.onSelect?.() }}>
                {Icon && <Icon size={15} aria-hidden="true" />}<span>{item.label}</span>
              </button>
            )
          })}
        </div>, document.body,
      )}
    </>
  )
}
