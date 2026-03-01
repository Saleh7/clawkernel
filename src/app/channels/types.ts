export type DevicePendingRequest = {
  requestId: string
  deviceId: string
  publicKey: string
  displayName?: string
  platform?: string
  clientId?: string
  clientMode?: string
  role?: string
  roles?: string[]
  scopes?: string[]
  ts: number
}

export type DeviceTokenSummary = {
  role: string
  scopes: string[]
  createdAtMs: number
  rotatedAtMs?: number
  revokedAtMs?: number
  lastUsedAtMs?: number
}

export type PairedDevice = {
  deviceId: string
  publicKey: string
  displayName?: string
  platform?: string
  clientId?: string
  clientMode?: string
  role?: string
  roles?: string[]
  scopes?: string[]
  tokens?: Record<string, DeviceTokenSummary>
  createdAtMs: number
  approvedAtMs: number
}

export type DevicePairingList = {
  pending: DevicePendingRequest[]
  paired: PairedDevice[]
}

export type TokenRotateResult = {
  deviceId: string
  role: string
  token: string
  scopes: string[]
  rotatedAtMs: number
}

export type QrLoginStartResult = {
  qrDataUrl?: string
  status?: string
  message?: string
}

export type QrLoginWaitResult = {
  connected: boolean
  status?: string
  message?: string
}

export type ChannelSetupType = 'qr' | 'token'

export type ChannelKnownMeta = {
  icon: string
  setupType: ChannelSetupType
  docsUrl: string
  setupHint: string
  tokenFields?: { key: string; label: string; placeholder: string }[]
  postSetup: string[]
}

export const CHANNEL_SETUP_TYPE: Record<string, ChannelSetupType> = {
  telegram: 'token',
  discord: 'token',
  slack: 'token',
  whatsapp: 'qr',
  signal: 'qr',
}

export const CHANNEL_ICONS: Record<string, string> = {
  telegram: '💬',
  whatsapp: '📱',
  discord: '🎮',
  slack: '💼',
  signal: '🔐',
}

export const CHANNEL_META: Record<string, ChannelKnownMeta> = {
  telegram: {
    icon: '💬',
    setupType: 'token',
    docsUrl: 'https://docs.openclaw.ai/channels/telegram',
    setupHint: 'Create a bot via @BotFather on Telegram and paste the token below.',
    tokenFields: [{ key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF...' }],
    postSetup: [
      'The gateway restarts automatically on config changes.',
      'Open Telegram and send a message to your bot.',
      'If DM policy is "pairing", new contacts appear in the Pending section for approval.',
    ],
  },
  discord: {
    icon: '🎮',
    setupType: 'token',
    docsUrl: 'https://docs.openclaw.ai/channels/discord',
    setupHint: 'Create an app at discord.com/developers, enable Message Content Intent, and paste the bot token.',
    tokenFields: [{ key: 'botToken', label: 'Bot Token', placeholder: 'MTIz...' }],
    postSetup: [
      'Invite the bot to your server with message permissions.',
      'The gateway restarts automatically on config changes.',
      'Send a DM to the bot or message it in a server channel.',
    ],
  },
  slack: {
    icon: '💼',
    setupType: 'token',
    docsUrl: 'https://docs.openclaw.ai/channels/slack',
    setupHint: 'Create an app at api.slack.com/apps, enable Socket Mode, and paste both tokens.',
    tokenFields: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...' },
      { key: 'appToken', label: 'App Token', placeholder: 'xapp-...' },
    ],
    postSetup: [
      'Confirm the Slack app is installed to your workspace.',
      'Invite the bot to a channel or DM it directly.',
      'The gateway restarts automatically on config changes.',
    ],
  },
  whatsapp: {
    icon: '📱',
    setupType: 'qr',
    docsUrl: 'https://docs.openclaw.ai/channels/whatsapp',
    setupHint: 'Click "Connect via QR" and scan the code with your WhatsApp app.',
    postSetup: [
      'After QR linking, the gateway stays running automatically.',
      'Message the linked WhatsApp number from an allowed contact.',
      'For stable ops, use a dedicated WhatsApp number.',
    ],
  },
  signal: {
    icon: '🔐',
    setupType: 'qr',
    docsUrl: 'https://docs.openclaw.ai/channels/signal',
    setupHint: 'Click "Connect via QR" and scan the code with your Signal app.',
    postSetup: [
      'After QR linking, the gateway stays running automatically.',
      'Send a message from an allowed Signal contact.',
    ],
  },
}
