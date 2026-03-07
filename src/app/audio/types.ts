import type { TalkConfigPayload, TtsProvider, TtsStatus } from '@/lib/gateway/types'

export type { TalkConfigPayload, TtsProvider, TtsStatus } from '@/lib/gateway/types'

export type AudioState = {
  status: TtsStatus
  providers: TtsProvider[]
  activeProvider: string
  talk: TalkConfigPayload | null
  seamColor: string | null
  wakeTriggers: string[]
}
export type TtsTestResult = {
  audioPath: string
  provider: string
  outputFormat: string
  voiceCompatible: boolean
}
