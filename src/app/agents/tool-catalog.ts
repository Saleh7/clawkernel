// ---------------------------------------------------------------------------
//  Tool Catalog — static fallback data for agent-tools.tsx
// ---------------------------------------------------------------------------

import {
  Brain,
  Calendar,
  Code,
  Cpu,
  FileText,
  GitBranch,
  Globe,
  Image,
  Layers,
  Mail,
  MessageSquare,
  Monitor,
  PenTool,
  Radio,
  Search,
  Send,
  Shield,
  Terminal,
  Users,
  Zap,
} from 'lucide-react'
import type { ToolCatalogGroup } from '@/lib/gateway/types'

// ---------------------------------------------------------------------------
//  Profile helper
// ---------------------------------------------------------------------------

type ProfileId = 'minimal' | 'coding' | 'messaging' | 'full'
const p = (...ids: ProfileId[]) => ids

// ---------------------------------------------------------------------------
//  Fallback catalog — used when tools.catalog request fails
// ---------------------------------------------------------------------------

export const FALLBACK_SECTIONS: ToolCatalogGroup[] = [
  {
    id: 'fs',
    label: 'Files',
    source: 'core' as const,
    tools: [
      {
        id: 'read',
        label: 'read',
        description: 'Read file contents',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'write',
        label: 'write',
        description: 'Create or overwrite files',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'edit',
        label: 'edit',
        description: 'Make precise edits',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'apply_patch',
        label: 'apply_patch',
        description: 'Patch files (OpenAI)',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
    ],
  },
  {
    id: 'runtime',
    label: 'Runtime',
    source: 'core' as const,
    tools: [
      {
        id: 'exec',
        label: 'exec',
        description: 'Run shell commands',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'process',
        label: 'process',
        description: 'Manage background processes',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
    ],
  },
  {
    id: 'web',
    label: 'Web',
    source: 'core' as const,
    tools: [
      {
        id: 'web_search',
        label: 'web_search',
        description: 'Search the web',
        source: 'core' as const,
        defaultProfiles: p(),
      },
      {
        id: 'web_fetch',
        label: 'web_fetch',
        description: 'Fetch web content',
        source: 'core' as const,
        defaultProfiles: p(),
      },
    ],
  },
  {
    id: 'memory',
    label: 'Memory',
    source: 'core' as const,
    tools: [
      {
        id: 'memory_search',
        label: 'memory_search',
        description: 'Semantic search',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'memory_get',
        label: 'memory_get',
        description: 'Read memory files',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
    ],
  },
  {
    id: 'sessions',
    label: 'Sessions',
    source: 'core' as const,
    tools: [
      {
        id: 'sessions_list',
        label: 'sessions_list',
        description: 'List sessions',
        source: 'core' as const,
        defaultProfiles: p('coding', 'messaging'),
      },
      {
        id: 'sessions_history',
        label: 'sessions_history',
        description: 'Session history',
        source: 'core' as const,
        defaultProfiles: p('coding', 'messaging'),
      },
      {
        id: 'sessions_send',
        label: 'sessions_send',
        description: 'Send to session',
        source: 'core' as const,
        defaultProfiles: p('coding', 'messaging'),
      },
      {
        id: 'sessions_spawn',
        label: 'sessions_spawn',
        description: 'Spawn sub-agent',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'subagents',
        label: 'subagents',
        description: 'Manage sub-agents',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'session_status',
        label: 'session_status',
        description: 'Session status',
        source: 'core' as const,
        defaultProfiles: p('minimal', 'coding', 'messaging'),
      },
    ],
  },
  {
    id: 'ui',
    label: 'UI',
    source: 'core' as const,
    tools: [
      {
        id: 'browser',
        label: 'browser',
        description: 'Control web browser',
        source: 'core' as const,
        defaultProfiles: p(),
      },
      {
        id: 'canvas',
        label: 'canvas',
        description: 'Control canvases',
        source: 'core' as const,
        defaultProfiles: p(),
      },
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging',
    source: 'core' as const,
    tools: [
      {
        id: 'message',
        label: 'message',
        description: 'Send messages',
        source: 'core' as const,
        defaultProfiles: p('messaging'),
      },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    source: 'core' as const,
    tools: [
      {
        id: 'cron',
        label: 'cron',
        description: 'Schedule tasks',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'gateway',
        label: 'gateway',
        description: 'Gateway control',
        source: 'core' as const,
        defaultProfiles: p(),
      },
    ],
  },
  {
    id: 'nodes',
    label: 'Nodes',
    source: 'core' as const,
    tools: [
      {
        id: 'nodes',
        label: 'nodes',
        description: 'Nodes + devices',
        source: 'core' as const,
        defaultProfiles: p(),
      },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    source: 'core' as const,
    tools: [
      {
        id: 'agents_list',
        label: 'agents_list',
        description: 'List agents',
        source: 'core' as const,
        defaultProfiles: p(),
      },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    source: 'core' as const,
    tools: [
      {
        id: 'image',
        label: 'image',
        description: 'Image understanding',
        source: 'core' as const,
        defaultProfiles: p('coding'),
      },
      {
        id: 'tts',
        label: 'tts',
        description: 'Text-to-speech',
        source: 'core' as const,
        defaultProfiles: p(),
      },
    ],
  },
]

export const FALLBACK_PROFILES = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'coding', label: 'Coding' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'full', label: 'Full' },
]

// ---------------------------------------------------------------------------
//  Icon map
// ---------------------------------------------------------------------------

export const TOOL_ICONS: Record<string, typeof FileText> = {
  read: FileText,
  write: PenTool,
  edit: PenTool,
  apply_patch: GitBranch,
  exec: Terminal,
  process: Terminal,
  web_search: Search,
  web_fetch: Globe,
  memory_search: Brain,
  memory_get: Brain,
  sessions_list: Layers,
  sessions_history: Layers,
  sessions_send: Send,
  sessions_spawn: Users,
  subagents: Users,
  session_status: Cpu,
  browser: Monitor,
  canvas: Monitor,
  message: MessageSquare,
  cron: Calendar,
  gateway: Radio,
  nodes: Users,
  agents_list: Users,
  image: Image,
  tts: MessageSquare,
}

export const PRESET_ICONS: Record<string, typeof Shield> = {
  minimal: Shield,
  coding: Code,
  messaging: Mail,
  full: Zap,
}
