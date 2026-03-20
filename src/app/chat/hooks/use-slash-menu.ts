import { useCallback, useRef, useState } from 'react'
import { filterSlashCommands, type SlashCommandDef } from '../lib/slash-commands'

type SlashMenuState = {
  open: boolean
  items: SlashCommandDef[]
  activeIndex: number
  mode: 'command' | 'args'
  argCommand: SlashCommandDef | null
  argItems: string[]
}

const INITIAL: SlashMenuState = {
  open: false,
  items: [],
  activeIndex: 0,
  mode: 'command',
  argCommand: null,
  argItems: [],
}

export function useSlashMenu() {
  const [state, setState] = useState<SlashMenuState>(INITIAL)
  const stateRef = useRef(state)
  stateRef.current = state

  const close = useCallback(() => setState(INITIAL), [])

  const update = useCallback((value: string) => {
    // Arg mode: /command <partial>
    const argMatch = /^\/(\S+)\s(.*)$/.exec(value)
    if (argMatch) {
      const cmdName = argMatch[1].toLowerCase()
      const filter = argMatch[2].toLowerCase()
      const cmd = filterSlashCommands(cmdName).find((c) => c.name === cmdName)
      if (cmd?.argOptions?.length) {
        const filtered = filter ? cmd.argOptions.filter((o) => o.toLowerCase().startsWith(filter)) : cmd.argOptions
        if (filtered.length > 0) {
          setState({ open: true, items: [], activeIndex: 0, mode: 'args', argCommand: cmd, argItems: filtered })
          return
        }
      }
      setState(INITIAL)
      return
    }

    // Command mode: /partial
    const match = /^\/(\S*)$/.exec(value)
    if (match) {
      const items = filterSlashCommands(match[1])
      setState({ open: items.length > 0, items, activeIndex: 0, mode: 'command', argCommand: null, argItems: [] })
    } else {
      setState(INITIAL)
    }
  }, [])

  const moveUp = useCallback(() => {
    setState((s) => {
      const total = s.mode === 'args' ? s.argItems.length : s.items.length
      if (total === 0) return s
      return { ...s, activeIndex: (s.activeIndex - 1 + total) % total }
    })
  }, [])

  const moveDown = useCallback(() => {
    setState((s) => {
      const total = s.mode === 'args' ? s.argItems.length : s.items.length
      if (total === 0) return s
      return { ...s, activeIndex: (s.activeIndex + 1) % total }
    })
  }, [])

  const setHover = useCallback((index: number) => {
    setState((s) => ({ ...s, activeIndex: index }))
  }, [])

  /** Get active item. Returns command def or arg string. */
  const getActive = useCallback((): SlashCommandDef | string | null => {
    const s = stateRef.current
    if (s.mode === 'args') return s.argItems[s.activeIndex] ?? null
    return s.items[s.activeIndex] ?? null
  }, [])

  return { state, update, close, moveUp, moveDown, setHover, getActive }
}
