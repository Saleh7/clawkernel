import { Plus, Radio, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  readonly triggers: string[]
  readonly saving: boolean
  readonly onSave: (triggers: string[]) => void
}

export function WakeWordCard({ triggers, saving, onSave }: Props) {
  const [draft, setDraft] = useState<string[]>(triggers)
  const [inputValue, setInputValue] = useState('')

  // Track the previous triggers so we can detect whether draft was clean when
  // triggers change (e.g. after Refresh). Using a ref avoids the stale-closure
  // problem and keeps draft out of the effect's dependency array.
  const prevTriggersRef = useRef(triggers)
  useEffect(() => {
    const oldTriggers = prevTriggersRef.current
    prevTriggersRef.current = triggers
    // Functional setter: receives the live draft without adding it as a dep.
    setDraft((currentDraft) => {
      // Only sync if draft was clean relative to the OLD triggers.
      if (JSON.stringify(currentDraft) === JSON.stringify(oldTriggers)) {
        return triggers
      }
      return currentDraft
    })
  }, [triggers])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(triggers)

  const handleAdd = () => {
    const word = inputValue.trim()
    if (!word || draft.includes(word)) return
    setDraft((prev) => [...prev, word])
    setInputValue('')
  }

  const handleRemove = (word: string) => {
    setDraft((prev) => prev.filter((w) => w !== word))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  const handleSave = () => {
    onSave(draft)
  }

  const handleDiscard = () => {
    setDraft(triggers)
    setInputValue('')
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-sky-400" />
        <p className="text-sm font-semibold">Wake Word</p>
      </div>

      {/* Current triggers */}
      <div>
        {draft.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {draft.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 pl-2.5 pr-1.5 py-0.5 text-xs text-sky-400"
              >
                {word}
                <button
                  type="button"
                  onClick={() => handleRemove(word)}
                  className="ml-0.5 rounded p-0.5 hover:bg-sky-500/20 transition-colors"
                  aria-label={`Remove trigger "${word}"`}
                  disabled={saving}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No wake word triggers configured.</p>
        )}
      </div>

      {/* Add new trigger */}
      <div className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a trigger phrase…"
          className="flex-1"
          disabled={saving}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={saving || !inputValue.trim()}
          aria-label="Add trigger"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Save / Discard */}
      {isDirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Triggers'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
            Discard
          </Button>
        </div>
      )}
    </div>
  )
}
