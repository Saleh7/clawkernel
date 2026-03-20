// Pinned messages — persisted to localStorage per session

const PREFIX = 'clawkernel:pinned:'

export class PinnedMessages {
  private readonly key: string
  private _set = new Set<string>()

  constructor(sessionKey: string) {
    this.key = PREFIX + sessionKey
    this.load()
  }

  get keys(): Set<string> {
    return this._set
  }
  has(key: string) {
    return this._set.has(key)
  }
  toggle(key: string) {
    this._set.has(key) ? this._set.delete(key) : this._set.add(key)
    this.save()
  }
  clear() {
    this._set.clear()
    this.save()
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.key)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) this._set = new Set(arr.filter((s): s is string => typeof s === 'string'))
      }
    } catch {
      /* localStorage unavailable in private browsing */
    }
  }

  private save() {
    try {
      localStorage.setItem(this.key, JSON.stringify([...this._set]))
    } catch {
      /* localStorage unavailable in private browsing */
    }
  }
}
