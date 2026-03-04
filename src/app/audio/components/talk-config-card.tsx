import { Mic } from 'lucide-react'
import type { TalkConfigPayload } from '../types'

type Props = {
  readonly talk: TalkConfigPayload | null
  readonly seamColor: string | null
}

export function TalkConfigCard({ talk, seamColor }: Props) {
  const hasConfig = talk !== null && Object.keys(talk).length > 0

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-emerald-400" />
        <p className="text-sm font-semibold">Talk Mode</p>
        <span className="text-xs text-muted-foreground">(macOS · iOS · Android)</span>
      </div>

      {hasConfig ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ConfigField label="Voice ID" value={talk?.voiceId ?? '—'} />
            <ConfigField label="Model" value={talk?.modelId ?? '—'} />
            <ConfigField label="Output Format" value={talk?.outputFormat ?? '—'} />
            <ConfigField
              label="Interrupt on Speech"
              value={talk?.interruptOnSpeech === false ? 'Disabled' : 'Enabled'}
            />
            {seamColor && <ConfigField label="Seam Color" value={seamColor} />}
          </div>

          {talk?.voiceAliases && Object.keys(talk.voiceAliases).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Voice Aliases
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(talk.voiceAliases).map(([alias, id]) => (
                  <span
                    key={alias}
                    title={id}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground mb-1">How Talk Mode works</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: '🎤', label: 'Listen', desc: 'Detects speech' },
                { icon: '📝', label: 'Transcribe', desc: 'Speech → text' },
                { icon: '🧠', label: 'Think', desc: 'Agent responds' },
                { icon: '🔊', label: 'Speak', desc: 'ElevenLabs TTS' },
              ].map((step) => (
                <div key={step.label} className="text-center">
                  <span className="text-sm">{step.icon}</span>
                  <p className="text-xs font-medium text-foreground/70 mt-0.5">{step.label}</p>
                  <p className="text-xs text-muted-foreground/60">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center space-y-1">
          <Mic className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Talk Mode is not configured</p>
          <p className="text-xs text-muted-foreground/60">
            Add a <code className="rounded bg-muted px-1 py-px">talk</code> section with{' '}
            <code className="rounded bg-muted px-1 py-px">voiceId</code> and{' '}
            <code className="rounded bg-muted px-1 py-px">apiKey</code> to enable voice conversation.
          </p>
          <a
            href="https://docs.openclaw.ai/nodes/talk#talk-mode"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs text-primary hover:underline"
          >
            View Talk Mode docs →
          </a>
        </div>
      )}
    </div>
  )
}

function ConfigField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className="mt-0.5 text-sm font-mono text-foreground/80 truncate" title={value}>
        {value}
      </p>
    </div>
  )
}
