import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

function getSystemTheme(): 'light' | 'dark' {
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('clawkernel-theme') as Theme | null
    return stored ?? 'dark'
  })

  const updateTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme)
    localStorage.setItem('clawkernel-theme', nextTheme)
    applyTheme(nextTheme)
  }, [])

  // Apply on mount + listen for system changes
  useEffect(() => {
    applyTheme(theme)
    const mq = globalThis.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme === 'system') applyTheme('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme

  const cycle = useCallback(() => {
    const order: Theme[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(theme) + 1) % order.length]
    updateTheme(next)
  }, [theme, updateTheme])

  return { theme, resolvedTheme, setTheme: updateTheme, cycle }
}
