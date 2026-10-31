import { useEffect, useState } from 'react'
import { ThemeContext } from './theme-context'
const THEMES = ['system', 'light', 'dark']

function readTheme() {
  try {
    const saved = localStorage.getItem('nexforge_theme')
    return THEMES.includes(saved) ? saved : 'dark'
  } catch { return 'dark' }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    const persist = () => {
      try { localStorage.setItem('nexforge_theme', theme) } catch { /* armazenamento opcional */ }
    }
    apply()
    persist()
    if (theme !== 'system') return undefined
    media.addEventListener?.('change', apply)
    return () => media.removeEventListener?.('change', apply)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

