import { Monitor, Moon, Sun } from 'lucide-react'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useTheme } from '@/hooks/use-theme'

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const labels = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

export function ThemeToggleButton() {
  const { theme, cycle } = useTheme()
  const Icon = icons[theme]

  return (
    <SidebarMenuButton tooltip={`Theme: ${labels[theme]}`} onClick={cycle}>
      <Icon />
      <span>{labels[theme]} Mode</span>
    </SidebarMenuButton>
  )
}
