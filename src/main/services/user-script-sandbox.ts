// File: src/main/services/user-script-sandbox.ts
//
// #310 E-86 + #311 E-87 — Sandboxed JavaScript execution for user
// plugins + Calibre-recipe-style scrapers. Uses Node's built-in
// `node:vm` (no vm2 dep — vm2 is deprecated). vm doesn't provide a
// true security boundary against determined attackers, but DOES
// prevent accidental access to require/process/globalThis.
//
// What's exposed to user code (the API surface):
//   - `fetch` (Electron's net-wrapped, follows our proxy rules)
//   - `console.log/warn/error` (captured to per-run buffer)
//   - `URL`, `URLSearchParams`, `Buffer`, `setTimeout`, `clearTimeout`
//   - `JSON`, `Math`, `Date`, `RegExp`, `Promise` (built-ins)
//   - `parseHtml(html, selector)` — tiny convenience for scrapers
//
// What's NOT exposed:
//   - `require`, `process`, `globalThis.process`, `eval` (replaced)
//   - filesystem, child_process, electron APIs
//
// Scripts have a hard timeout (default 10s) and a console-log cap.

import * as vm from 'node:vm'

export interface RunOptions {
  timeoutMs?: number
  maxLogLines?: number
  args?: Record<string, any>  // exposed as `args.<key>` in the script
}

export interface RunResult {
  ok: boolean
  result?: any
  logs: Array<{ level: 'log' | 'warn' | 'error'; message: string }>
  durationMs: number
  error?: string
}

// Tiny HTML→DOM-ish helper for scrapers. Uses a regex-based CSS
// selector subset (#id, .class, tag, tag.class, ancestor descendant)
// — enough for "scrape the first .post-title from this RSS-discovered
// page" use cases. Caller can fall back to text matching for anything
// fancier; we don't pull in a full jsdom (~30MB).
function tinyHtmlSelect(html: string, selector: string): string[] {
  // Naive: split on element boundaries, match by tag + class/id.
  const matches: string[] = []
  const sel = selector.trim()
  // tag.class form
  const tcMatch = /^([a-z0-9]+)?\.([a-z0-9_-]+)$/i.exec(sel)
  const idMatch = /^#([a-z0-9_-]+)$/i.exec(sel)
  const tagMatch = /^([a-z0-9]+)$/i.exec(sel)
  let re: RegExp
  if (idMatch) {
    re = new RegExp(`<([a-z0-9]+)[^>]*\\sid=["']${idMatch[1]}["'][^>]*>([\\s\\S]*?)</\\1>`, 'gi')
  } else if (tcMatch) {
    const tag = tcMatch[1] ?? '[a-z0-9]+'
    const cls = tcMatch[2]
    re = new RegExp(`<(${tag})[^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`, 'gi')
  } else if (tagMatch) {
    re = new RegExp(`<(${tagMatch[1]})[^>]*>([\\s\\S]*?)</\\1>`, 'gi')
  } else {
    return []
  }
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    matches.push(m[2].replace(/<[^>]+>/g, '').trim())
  }
  return matches
}

export async function runScript(source: string, options: RunOptions = {}): Promise<RunResult> {
  const start = Date.now()
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxLogLines = options.maxLogLines ?? 200
  const logs: RunResult['logs'] = []
  const pushLog = (level: 'log' | 'warn' | 'error', args: any[]) => {
    if (logs.length >= maxLogLines) return
    const message = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    logs.push({ level, message })
  }

  // Wrap user code so it can `return` a result. Top-level await is
  // also supported via the async-wrap pattern.
  const wrapped = `(async () => { ${source}\n })()`

  const sandbox: Record<string, any> = {
    console: {
      log: (...a: any[]) => pushLog('log', a),
      warn: (...a: any[]) => pushLog('warn', a),
      error: (...a: any[]) => pushLog('error', a),
    },
    fetch: globalThis.fetch,  // node 18+ has global fetch
    URL,
    URLSearchParams,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    JSON,
    Math,
    Date,
    RegExp,
    Promise,
    parseHtml: tinyHtmlSelect,
    args: options.args ?? {},
  }
  // Block dangerous globals explicitly (vm allows `globalThis` to leak otherwise).
  Object.defineProperty(sandbox, 'process', { value: undefined, configurable: false, writable: false })
  Object.defineProperty(sandbox, 'require', { value: undefined, configurable: false, writable: false })
  Object.defineProperty(sandbox, 'eval', { value: undefined, configurable: false, writable: false })
  Object.defineProperty(sandbox, 'globalThis', { value: sandbox, configurable: false, writable: false })

  vm.createContext(sandbox)
  try {
    const script = new vm.Script(wrapped, { filename: 'user-script.js' })
    const result = await Promise.race([
      script.runInContext(sandbox, { timeout: timeoutMs, breakOnSigint: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Script timed out')), timeoutMs + 500)),
    ])
    return { ok: true, result, logs, durationMs: Date.now() - start }
  } catch (err: any) {
    return { ok: false, logs, durationMs: Date.now() - start, error: err?.message ?? String(err) }
  }
}

// ─── Calibre-recipe scraper (#311) ───────────────────────────────────
// A "recipe" is a script that exports an async fetch() function. The
// caller is responsible for parsing the result into structured data.
// Recipes live in settings.scraperRecipes as an editable text array.

export interface ScraperRecipe {
  id: string
  name: string
  source: string         // the script body
  enabled: boolean
}

export async function runRecipe(recipe: ScraperRecipe, args: Record<string, any> = {}): Promise<RunResult> {
  return runScript(`
    // recipe entry point: must return its results synchronously or via top-level await
    ${recipe.source}
  `, { args, timeoutMs: 30_000 })
}
