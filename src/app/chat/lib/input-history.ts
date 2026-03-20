// Input history — navigate with ↑↓ like a terminal

const MAX = 50

export class InputHistory {
  private readonly items: string[] = []
  private cursor = -1

  push(text: string) {
    const t = text.trim()
    if (!t || this.items.at(-1) === t) return
    this.items.push(t)
    if (this.items.length > MAX) this.items.shift()
    this.cursor = -1
  }

  up(): string | null {
    if (this.items.length === 0) return null
    if (this.cursor < 0) this.cursor = this.items.length - 1
    else if (this.cursor > 0) this.cursor--
    return this.items[this.cursor] ?? null
  }

  down(): string | null {
    if (this.cursor < 0) return null
    this.cursor++
    if (this.cursor >= this.items.length) {
      this.cursor = -1
      return null
    }
    return this.items[this.cursor] ?? null
  }

  reset() {
    this.cursor = -1
  }
}
