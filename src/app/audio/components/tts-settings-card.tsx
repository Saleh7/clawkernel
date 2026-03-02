import { Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ConfigSnapshot } from '@/lib/gateway/types'

// Must match DEFAULT_MAX_TEXT_LENGTH in OpenClaw src/tts/tts.ts:48
const DEFAULT_MAX_LENGTH = 4096
const MAX_TEXT_LENGTH_INPUT = 100_000

type TtsConfigSection = { summarize?: boolean; maxTextLength?: number }

function readTtsConfig(storeConfig: ConfigSnapshot | null): TtsConfigSection {
  const cfg = storeConfig?.config
  if (!cfg || typeof cfg !== 'object') return {}
  const messages = (cfg as Record<string, unknown>).messages
  if (!messages || typeof messages !== 'object') return {}
  const tts = (messages as Record<string, unknown>).tts
  if (!tts || typeof tts !== 'object') return {}
  return tts as TtsConfigSection
}

type Props = {
  storeConfig: ConfigSnapshot | null
  saving: boolean
  onUpdate: (patch: { summarize?: boolean; maxTextLength?: number }) => Promise<void>
}

export function TtsSettingsCard({ storeConfig, saving, onUpdate }: Props) {
  const ttsConf = readTtsConfig(storeConfig)

  const [summarize, setSummarize] = useState(ttsConf.summarize !== false)
  const [maxLength, setMaxLength] = useState(String(ttsConf.maxTextLength ?? DEFAULT_MAX_LENGTH))

  // Sync when storeConfig changes (also handles initial null → loaded transition)
  useEffect(() => {
    const conf = readTtsConfig(storeConfig)
    setSummarize(conf.summarize !== false)
    setMaxLength(String(conf.maxTextLength ?? DEFAULT_MAX_LENGTH))
  }, [storeConfig])

  // All hooks called — safe to conditionally render here
  if (!storeConfig) {
    return <div className="h-28 animate-pulse rounded-xl bg-muted/30" />
  }

  const handleSummarizeToggle = async (val: boolean) => {
    setSummarize(val)
    await onUpdate({ summarize: val })
  }

  const handleMaxLengthBlur = async () => {
    const val = parseInt(maxLength, 10)
    if (!Number.isNaN(val) && val > 0 && val <= MAX_TEXT_LENGTH_INPUT) {
      await onUpdate({ maxTextLength: val })
    } else {
      setMaxLength(String(ttsConf.maxTextLength ?? DEFAULT_MAX_LENGTH))
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">TTS Settings</p>
      </div>

      {/* Auto-Summarize */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Auto-Summarize Long Replies</p>
            <p className="text-xs text-muted-foreground">
              Shorten replies that exceed the character limit before speaking them.
            </p>
          </div>
          <Switch
            checked={summarize}
            onCheckedChange={(val) => void handleSummarizeToggle(val)}
            disabled={saving}
            aria-label="Toggle auto-summarize"
          />
        </div>

        {summarize && (
          <div className="flex items-center gap-3">
            <label htmlFor="tts-max-length" className="text-xs text-muted-foreground shrink-0">
              Character limit:
            </label>
            <Input
              id="tts-max-length"
              type="number"
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
              onBlur={() => void handleMaxLengthBlur()}
              className="w-28 text-sm"
              min={100}
              max={MAX_TEXT_LENGTH_INPUT}
              disabled={saving}
            />
            <span className="text-xs text-muted-foreground">chars</span>
            <Button size="sm" variant="outline" onClick={() => void handleMaxLengthBlur()} disabled={saving}>
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Output formats (informational) */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output Formats</p>
        <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
          {[
            { channel: 'Telegram', format: 'Opus voice note — 48 kHz / 64 kbps' },
            { channel: 'Other channels', format: 'MP3 — 44.1 kHz / 128 kbps' },
            { channel: 'Edge TTS', format: 'audio-24khz-48kbitrate-mono-mp3' },
          ].map((row) => (
            <div key={row.channel} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-muted-foreground">{row.channel}</span>
              <span className="font-mono text-foreground/70">{row.format}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
