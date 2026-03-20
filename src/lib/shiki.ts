/**
 * Lazy-loaded Shiki highlighter — web bundle (smaller).
 * Only common languages included to minimize chunk sizes.
 */

type Highlighter = Awaited<ReturnType<typeof import('shiki/core').createHighlighterCore>>

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  const promise = (highlighterPromise ??= (async () => {
    const { createHighlighterCore } = await import('shiki/core')
    const { createOnigurumaEngine } = await import('shiki/engine/oniguruma')

    return createHighlighterCore({
      engine: createOnigurumaEngine(import('shiki/wasm')),
      themes: [import('shiki/themes/vitesse-dark.mjs'), import('shiki/themes/vitesse-light.mjs')],
      langs: [
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/jsx.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/shell.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/sql.mjs'),
      ],
    })
  })())

  return promise
}

/**
 * Highlight code to HTML string. Returns null if language isn't loaded.
 */
export async function highlightCode(code: string, language: string, isDark: boolean): Promise<string | null> {
  try {
    const hl = await getHighlighter()
    const lang = language.toLowerCase() || 'text'
    const loaded = hl.getLoadedLanguages()
    if (!loaded.includes(lang)) return null

    return hl.codeToHtml(code, {
      lang,
      theme: isDark ? 'vitesse-dark' : 'vitesse-light',
    })
  } catch {
    /* expected: highlighter may fail to load in constrained environments */
    return null
  }
}
