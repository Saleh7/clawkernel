import { CheckCircle2, FileAudio, Headphones, Info, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { TtsProvider, TtsTestResult } from '../types'

const SAMPLE_PRESETS = [
  'Good morning. This is a voice sample for OpenClaw.',
  'Dashboard is online, audio is configured, and responses are ready.',
  'Testing pacing, clarity, and tone. If this sounds natural, this voice is a strong fit.',
]

type Props = {
  readonly providers: TtsProvider[]
  readonly activeProvider: string
  readonly saving: boolean
  readonly converting: boolean
  readonly onSetProvider: (id: string) => Promise<void>
  readonly onConvert: (text: string) => Promise<TtsTestResult | null>
}

function generateButtonLabel(converting: boolean, saving: boolean): string {
  if (converting) return 'Generating…'
  if (saving) return 'Switching provider…'
  return 'Generate Speech'
}

export function TtsTestPanel({ providers, activeProvider, saving, converting, onSetProvider, onConvert }: Props) {
  const [text, setText] = useState(SAMPLE_PRESETS[0] ?? '')
  const [selectedProvider, setSelectedProvider] = useState(activeProvider)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [result, setResult] = useState<TtsTestResult | null>(null)

  // Sync selected provider when active changes (e.g. after refresh)
  useEffect(() => {
    setSelectedProvider(activeProvider)
  }, [activeProvider])

  const configuredProviders = providers.filter((p) => p.configured)
  const currentProviderMeta = providers.find((p) => p.id === selectedProvider) ?? null
  const availableVoices = currentProviderMeta?.voices ?? []
  // Derive effective voice — reset to first available when provider changes
  const effectiveVoice = availableVoices.includes(selectedVoice) ? selectedVoice : (availableVoices[0] ?? '')

  const isBusy = saving || converting

  const handleGenerate = async () => {
    setResult(null)
    if (selectedProvider && selectedProvider !== activeProvider) {
      await onSetProvider(selectedProvider)
    }
    const res = await onConvert(text)
    if (res) setResult(res)
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Headphones className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Voice Sample Lab</p>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {SAMPLE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setText(preset)}
            className={cn(
              'rounded-md border px-2 py-0.5 text-xs leading-snug transition-colors',
              text === preset
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {preset.length > 42 ? `${preset.slice(0, 42)}…` : preset}
          </button>
        ))}
      </div>

      {/* Text input */}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Enter text to convert to speech…"
        className="resize-none"
      />

      {/* Provider + Voice selectors */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Provider */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider</p>
          {configuredProviders.length > 0 ? (
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              disabled={isBusy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {configuredProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === activeProvider ? ' (active)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground italic">No configured providers</p>
          )}
          {selectedProvider !== activeProvider && (
            <p className="text-xs text-amber-500">Selecting this will switch the active provider permanently.</p>
          )}
        </div>

        {/* Voice */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Voice <span className="text-muted-foreground/50 normal-case font-normal">(reference only)</span>
          </p>
          {availableVoices.length > 0 ? (
            <select
              value={effectiveVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            >
              {availableVoices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              No voice options for this provider
            </div>
          )}
          {availableVoices.length > 0 && (
            <p className="text-xs text-muted-foreground/60">
              Voice is set in Gateway config — shown here for reference.
            </p>
          )}
        </div>
      </div>

      {/* Generate button */}
      <Button onClick={() => void handleGenerate()} disabled={isBusy || !text.trim()} className="gap-2">
        <Volume2 className="h-3.5 w-3.5" />
        {generateButtonLabel(converting, saving)}
      </Button>

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Audio generated successfully
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ResultField label="Provider" value={result.provider} />
            <ResultField label="Format" value={result.outputFormat} />
            <ResultField label="Voice Compatible" value={result.voiceCompatible ? 'Yes' : 'No'} />
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <FileAudio className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <code className="text-xs text-muted-foreground break-all">{result.audioPath}</code>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground/70">
            <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
            Audio playback in the browser requires Phase 7 backend (file serving endpoint).
          </p>
        </div>
      )}
    </div>
  )
}

function ResultField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className="mt-0.5 text-sm font-mono text-foreground/80">{value}</p>
    </div>
  )
}
