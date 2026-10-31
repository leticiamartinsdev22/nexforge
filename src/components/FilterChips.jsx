import { useEffect, useId, useRef, useState } from 'react'
import { Calendar, Globe, ChevronDown, Check } from 'lucide-react'
import { useData, WINDOW_LABELS, ENV_LABELS } from '../store-utils'

function FilterMenu({ icon: Icon, label, value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const menuId = useId()
  const selectedIndex = Math.max(0, options.findIndex(([optionValue]) => optionValue === value))
  const selectedLabel = options[selectedIndex]?.[1] ?? label

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    optionRefs.current[selectedIndex]?.focus()
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, selectedIndex])

  const showMenu = (index = selectedIndex) => {
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }
  const choose = (optionValue) => {
    onChange(optionValue)
    setOpen(false)
    triggerRef.current?.focus()
  }
  const moveFocus = (event, index) => {
    let nextIndex = index
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
    else if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = options.length - 1
    else return
    event.preventDefault()
    optionRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="filter-select-wrap" ref={rootRef} onBlur={(event) => {
      if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button
        className="chip filter-select-trigger"
        type="button"
        ref={triggerRef}
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => open ? setOpen(false) : showMenu()}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault()
            showMenu()
          }
        }}
      >
        <Icon size={15} aria-hidden="true" />
        <span>{selectedLabel}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="filter-menu" id={menuId} role="menu" aria-label={label}>
          {options.map(([optionValue, optionLabel], index) => (
            <button
              key={optionValue}
              className="filter-menu-option"
              type="button"
              role="menuitemradio"
              aria-checked={optionValue === value}
              ref={(element) => { optionRefs.current[index] = element }}
              onClick={() => choose(optionValue)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              <span>{optionLabel}</span>
              {optionValue === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilterChips() {
  const { filters, setFilters } = useData()
  return (
    <div className="chips">
      <FilterMenu icon={Calendar} label="Período" value={filters.window} options={WINDOW_LABELS} onChange={(window) => setFilters({ ...filters, window })} />
      <FilterMenu icon={Globe} label="Serviços" value={filters.env} options={ENV_LABELS} onChange={(env) => setFilters({ ...filters, env })} />
    </div>
  )
}
