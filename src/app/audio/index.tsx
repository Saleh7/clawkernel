import { ChevronDown, ChevronUp, Globe, Mic, RefreshCw, Speaker, Volume2, Waves, Zap } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AudioStatusCard } from './components/audio-status-card'
import { ProviderCard } from './components/provider-card'
import { TalkConfigCard } from './components/talk-config-card'
import { TtsSettingsCard } from './components/tts-settings-card'
import { TtsTestPanel } from './components/tts-test-panel'
import { WakeWordCard } from './components/wake-word-card'
import { useAudio } from './hooks/use-audio'

export default function AudioPage() {
  const {
    state,
    storeConfig,
    loading,
    saving,
    converting,
    refresh,
    handleToggleEnabled,
    handleSetProvider,
    handleConvert,
    handleSetWakeTriggers,
    handleUpdateTtsConfig,
  } = useAudio()

  const [slashOpen, setSlashOpen] = useState(false)

  let pageContent: React.ReactNode
  if (loading) {
    pageContent = (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }, (_unused, n) => `audio-skeleton-${n + 1}`).map((id) => (
          <div key={id} className="h-36 animate-pulse rounded-xl bg-muted/30" />
        ))}
      </div>
    )
  } else if (state == null) {
    pageContent = (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 gap-3 text-center">
        <Volume2 className="h-8 w-8 text-muted-foreground/20" />
        <p className="text-sm font-medium text-muted-foreground">Failed to load audio configuration</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    )
  } else {
    pageContent = (
      <div className="flex flex-col gap-4">
        {/* Current Configuration summary */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Current Configuration
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              icon={<Waves className="h-3.5 w-3.5 text-primary shrink-0" />}
              label="Auto-TTS"
              value={state.status.auto === 'off' ? 'Off' : state.status.auto}
            />
            <SummaryTile
              icon={<Speaker className="h-3.5 w-3.5 text-primary shrink-0" />}
              label="Provider"
              value={state.activeProvider || state.status.provider || 'none'}
            />
            <SummaryTile
              icon={<Mic className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
              label="Talk Mode"
              value={state.talk !== null && Object.keys(state.talk).length > 0 ? 'Configured' : 'Not configured'}
            />
            <SummaryTile
              icon={<Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
              label="Providers"
              value={`${state.providers.filter((p) => p.configured).length} configured`}
            />
          </div>
        </div>

        {/* TTS Status */}
        <AudioStatusCard
          status={state.status}
          saving={saving}
          onToggle={(enabled) => void handleToggleEnabled(enabled)}
        />

        {/* TTS Providers */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">TTS Providers</h2>
          <div className="flex flex-col gap-2">
            {state.providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                isActive={state.activeProvider === p.id}
                saving={saving}
                onSetActive={() => void handleSetProvider(p.id)}
              />
            ))}
            {state.providers.length === 0 && (
              <p className="text-sm text-muted-foreground px-1">No providers available.</p>
            )}
          </div>
        </div>

        {/* TTS Test */}
        <TtsTestPanel
          providers={state.providers}
          activeProvider={state.activeProvider}
          saving={saving}
          converting={converting}
          onSetProvider={handleSetProvider}
          onConvert={handleConvert}
        />

        {/* TTS Settings */}
        <TtsSettingsCard storeConfig={storeConfig} saving={saving} onUpdate={handleUpdateTtsConfig} />

        {/* Wake Word */}
        <WakeWordCard
          triggers={state.wakeTriggers}
          saving={saving}
          onSave={(triggers) => void handleSetWakeTriggers(triggers)}
        />

        {/* Talk Config */}
        <TalkConfigCard talk={state.talk} seamColor={state.seamColor} />

        {/* Slash commands reference */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
            onClick={() => setSlashOpen(!slashOpen)}
          >
            <span>Available Slash Commands</span>
            {slashOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {slashOpen && (
            <div className="border-t px-4 py-3 space-y-2 text-xs">
              <CommandItem cmd="/talk" desc="Enable audio chat mode" />
              <CommandItem cmd="/mute" desc="Disable all TTS output" />
              <CommandItem cmd="/voice <id>" desc="Set voice for current TTS provider" />
              <CommandItem cmd="/voices" desc="List available voices for active provider" />
              <CommandItem cmd="/wake <word>" desc="Set wake word trigger" />
            </div>
          )}
        </div>

        {/* Roadmap hint */}
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <Zap className="inline h-3 w-3 mr-1 text-primary" />
            Browser audio playback + waveform UI require Phase 7 backend endpoints.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <PageHeader
        icon={Volume2}
        title="Audio"
        description="Text-to-speech settings, voice configuration, and wake word management"
      >
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </PageHeader>

      {pageContent}
    </div>
  )
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  readonly icon: React.ReactNode
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground/80">{label}</p>
        <p className="text-xs font-medium text-foreground/90 capitalize">{value}</p>
      </div>
    </div>
  )
}

function CommandItem({ cmd, desc }: { readonly cmd: string; readonly desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
      <code className="text-[11px] text-foreground">{cmd}</code>
      <span className="text-[11px] text-muted-foreground">{desc}</span>
    </div>
  )
}
