import type { TalkConfigPayload, TtsProvider, TtsStatus } from '@/lib/gateway/types'

// Re-export for convenience inside the audio feature
export type { TalkConfigPayload, TtsProvider, TtsStatus } from '@/lib/gateway/types'

// Derived UI state (loaded from tts.status + tts.providers + talk.config + voicewake.get)
export type AudioState = {
  status: TtsStatus
  providers: TtsProvider[]
  activeProvider: string
  talk: TalkConfigPayload | null
  seamColor: string | null
  wakeTriggers: string[]
}

// Result shown after tts.convert
export type TtsTestResult = {
  audioPath: string
  provider: string
  outputFormat: string
  voiceCompatible: boolean
}
