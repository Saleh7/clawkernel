// Browser-native STT (SpeechRecognition) & TTS (SpeechSynthesis)

// ─── STT ───

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
}

function getSttCtor(): (new () => SpeechRecognitionInstance) | null {
  const w = globalThis as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as never
}

export function isSttSupported() {
  return getSttCtor() !== null
}

type SttCallbacks = {
  onTranscript: (text: string, isFinal: boolean) => void
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: string) => void
}

let activeRec: SpeechRecognitionInstance | null = null
let activeListeners: Array<{ event: string; handler: EventListener }> = []

export function startStt(cb: SttCallbacks): boolean {
  const Ctor = getSttCtor()
  if (!Ctor) {
    cb.onError?.('Speech recognition not supported')
    return false
  }
  stopStt()

  const rec = new Ctor()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = navigator.language || 'en-US'

  const onStart = () => cb.onStart?.()
  const onResult = (e: Event) => {
    const evt = e as Event & { results: SpeechRecognitionResultList; resultIndex: number }
    let interim = '',
      final = ''
    for (let i = evt.resultIndex; i < evt.results.length; i++) {
      const r = evt.results[i]
      if (!r?.[0]) continue
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    if (final) cb.onTranscript(final, true)
    else if (interim) cb.onTranscript(interim, false)
  }
  const onError = (e: Event) => {
    const err = (e as Event & { error: string }).error
    if (err !== 'aborted' && err !== 'no-speech') cb.onError?.(err)
  }
  const onEnd = () => {
    if (activeRec === rec) activeRec = null
    cb.onEnd?.()
  }

  const listeners: typeof activeListeners = [
    { event: 'start', handler: onStart },
    { event: 'result', handler: onResult },
    { event: 'error', handler: onError as EventListener },
    { event: 'end', handler: onEnd },
  ]
  for (const { event, handler } of listeners) rec.addEventListener(event, handler)
  activeListeners = listeners

  activeRec = rec
  rec.start()
  return true
}

export function stopStt() {
  if (activeRec) {
    const r = activeRec
    const listeners = activeListeners
    activeRec = null
    activeListeners = []
    for (const { event, handler } of listeners) r.removeEventListener(event, handler)
    try {
      r.stop()
    } catch {
      /* fire-and-forget: recognition may already be stopped */
    }
  }
}

export function isSttActive() {
  return activeRec !== null
}

// ─── TTS ───

export function isTtsSupported() {
  return 'speechSynthesis' in globalThis
}

let currentUtterance: SpeechSynthesisUtterance | null = null

export function speakText(text: string, opts?: { onEnd?: () => void; onError?: (e: string) => void }): boolean {
  if (!isTtsSupported()) {
    opts?.onError?.('TTS not supported')
    return false
  }
  stopTts()

  const cleaned = stripMarkdown(text)
  if (!cleaned.trim()) return false

  const utt = new SpeechSynthesisUtterance(cleaned)
  utt.rate = 1
  utt.addEventListener('end', () => {
    if (currentUtterance === utt) currentUtterance = null
    opts?.onEnd?.()
  })
  utt.addEventListener('error', (e) => {
    if (currentUtterance === utt) currentUtterance = null
    if (e.error !== 'canceled' && e.error !== 'interrupted') opts?.onError?.(e.error)
  })

  currentUtterance = utt
  speechSynthesis.speak(utt)
  return true
}

export function stopTts() {
  currentUtterance = null
  if (isTtsSupported()) speechSynthesis.cancel()
}

export function isTtsSpeaking() {
  return isTtsSupported() && speechSynthesis.speaking
}

function stripMarkdown(text: string): string {
  return text
    .replaceAll(/```[\s\S]*?```/g, '')
    .replaceAll(/`[^`]+`/g, '')
    .replaceAll(/!\[.*?\]\(.*?\)/g, '')
    .replaceAll(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replaceAll(/^#{1,6}\s+/gm, '')
    .replaceAll(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    .replaceAll(/_{1,3}(.*?)_{1,3}/g, '$1')
    .replaceAll(/^>\s?/gm, '')
    .replaceAll(/^[-*_]{3,}\s*$/gm, '')
    .replaceAll(/^\s*[-*+]\s+/gm, '')
    .replaceAll(/^\s*\d+\.\s+/gm, '')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}
