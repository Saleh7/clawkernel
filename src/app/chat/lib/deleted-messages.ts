// Deleted messages — client-side hide, persisted to localStorage

const PREFIX = 'clawkernel:deleted:'

export class DeletedMessages {
  private readonly key: string
  private _set = new Set<string>()

  constructor(sessionKey: string) {
    this.key = PREFIX + sessionKey
    this.load()
  }

  has(key: string) {
    return this._set.has(key)
  }

  delete(key: string) {
    this._set.add(key)
    this.save()
  }

  restore(key: string) {
    this._set.delete(key)
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
      /* localStorage unavailable in private browsing or corrupt data */
    }
  }

  private save() {
    try {
      localStorage.setItem(this.key, JSON.stringify([...this._set]))
    } catch {
      /* localStorage unavailable in private browsing or quota exceeded */
    }
  }
}
