// File: src/main/services/smart-query.ts
//
// #308 E-84 — Beets-style smart-collection query language. Parses a
// query string into a SQL WHERE clause + bind params. Used by smart
// playlists, virtual libraries, and search bar advanced mode.
//
// Grammar (left-to-right, ambiguity resolved by precedence):
//
//   QUERY      = TERM (LOGIC TERM)*
//   LOGIC      = "AND" | "OR" | "NOT" | implicit AND
//   TERM       = "(" QUERY ")" | NEGATION? FIELD_TERM | LITERAL_TERM
//   NEGATION   = "-" | "NOT"
//   FIELD_TERM = FIELD ":" OPERATOR? VALUE
//   FIELD      = identifier (rating, duration, tag, studio, ...)
//   OPERATOR   = ">" | ">=" | "<" | "<=" | "=" | "~" (regex)
//   VALUE      = bare-word | quoted string | number
//   LITERAL    = bare-word → matches title/filename via LIKE %word%
//
// Examples:
//   rating:>=4 tag:milf NOT tag:asian
//   studio:"Vixen" duration:<1200 rating:>3
//   bukkake performer:"Riley Reid"
//   tag:~"big.*tits" OR tag:bbw

export interface QueryResult {
  sql: string                // WHERE clause body (no leading WHERE)
  params: any[]
  joinedClauses: string[]    // any extra JOINs the WHERE references
}

// Compile a free-form query into a WHERE clause + params suitable
// for joining into the main library query. The caller is responsible
// for wrapping with `WHERE (...)` and adding the SELECT.
//
// Returns an empty WHERE (`1=1`) for the empty query.
export function compileQuery(input: string): QueryResult {
  const trimmed = input.trim()
  if (!trimmed) return { sql: '1=1', params: [], joinedClauses: [] }
  const tokens = tokenize(trimmed)
  const parser = new Parser(tokens)
  const ast = parser.parseQuery()
  const ctx: CompileCtx = { params: [], joins: new Set() }
  const sql = compileAst(ast, ctx)
  return { sql, params: ctx.params, joinedClauses: [...ctx.joins] }
}

// ─── tokenizer ────────────────────────────────────────────────────────

type TokenKind = 'word' | 'string' | 'lparen' | 'rparen' | 'and' | 'or' | 'not' | 'minus' | 'colon' | 'op' | 'eof'
interface Token { kind: TokenKind; value: string }

function tokenize(input: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '(') { out.push({ kind: 'lparen', value: '(' }); i++; continue }
    if (c === ')') { out.push({ kind: 'rparen', value: ')' }); i++; continue }
    if (c === ':') { out.push({ kind: 'colon', value: ':' }); i++; continue }
    if (c === '-' && (i === 0 || /[\s(]/.test(input[i - 1]))) { out.push({ kind: 'minus', value: '-' }); i++; continue }
    if (c === '>' || c === '<' || c === '=' || c === '~') {
      const next = input[i + 1]
      if ((c === '>' || c === '<') && next === '=') { out.push({ kind: 'op', value: c + '=' }); i += 2; continue }
      out.push({ kind: 'op', value: c }); i++; continue
    }
    if (c === '"' || c === '\'') {
      // Quoted string — read until matching quote.
      const quote = c
      i++
      let val = ''
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) { val += input[i + 1]; i += 2; continue }
        val += input[i]; i++
      }
      i++ // skip closing quote
      out.push({ kind: 'string', value: val })
      continue
    }
    // bare word — keep going until whitespace, paren, colon, or op
    let word = ''
    while (i < input.length && !/[\s():<>=~]/.test(input[i])) { word += input[i]; i++ }
    if (!word) { i++; continue }
    const lower = word.toLowerCase()
    if (lower === 'and') out.push({ kind: 'and', value: 'AND' })
    else if (lower === 'or') out.push({ kind: 'or', value: 'OR' })
    else if (lower === 'not') out.push({ kind: 'not', value: 'NOT' })
    else out.push({ kind: 'word', value: word })
  }
  out.push({ kind: 'eof', value: '' })
  return out
}

// ─── parser (recursive descent) ───────────────────────────────────────

type Ast =
  | { kind: 'and' | 'or'; left: Ast; right: Ast }
  | { kind: 'not'; child: Ast }
  | { kind: 'field'; field: string; op: string; value: string | number }
  | { kind: 'literal'; value: string }

class Parser {
  i = 0
  constructor(public tokens: Token[]) {}
  peek(): Token { return this.tokens[this.i] }
  consume(): Token { return this.tokens[this.i++] }
  expect(kind: TokenKind): Token {
    const t = this.consume()
    if (t.kind !== kind) throw new Error(`Expected ${kind}, got ${t.kind}=${t.value}`)
    return t
  }
  parseQuery(): Ast { return this.parseOr() }
  parseOr(): Ast {
    let left = this.parseAnd()
    while (this.peek().kind === 'or') {
      this.consume()
      left = { kind: 'or', left, right: this.parseAnd() }
    }
    return left
  }
  parseAnd(): Ast {
    let left = this.parseUnary()
    while (true) {
      const k = this.peek().kind
      if (k === 'and') { this.consume(); left = { kind: 'and', left, right: this.parseUnary() }; continue }
      // Implicit AND between adjacent terms.
      if (k === 'word' || k === 'string' || k === 'lparen' || k === 'minus' || k === 'not') {
        left = { kind: 'and', left, right: this.parseUnary() }
        continue
      }
      break
    }
    return left
  }
  parseUnary(): Ast {
    const t = this.peek()
    if (t.kind === 'minus' || t.kind === 'not') { this.consume(); return { kind: 'not', child: this.parseUnary() } }
    return this.parsePrimary()
  }
  parsePrimary(): Ast {
    const t = this.peek()
    if (t.kind === 'lparen') {
      this.consume()
      const inner = this.parseQuery()
      this.expect('rparen')
      return inner
    }
    if (t.kind === 'word' || t.kind === 'string') {
      // Maybe field:value, otherwise literal
      const first = this.consume()
      if (this.peek().kind === 'colon') {
        this.consume()
        let op = '='
        if (this.peek().kind === 'op') op = this.consume().value
        const valTok = this.consume()
        const rawValue = valTok.value
        const num = Number(rawValue)
        const value = Number.isFinite(num) && rawValue.match(/^-?\d+(\.\d+)?$/) ? num : rawValue
        return { kind: 'field', field: first.value.toLowerCase(), op, value }
      }
      return { kind: 'literal', value: first.value }
    }
    throw new Error(`Unexpected token ${t.kind}=${t.value}`)
  }
}

// ─── AST → SQL ────────────────────────────────────────────────────────

interface CompileCtx {
  params: any[]
  joins: Set<string>
}

const FIELD_MAP: Record<string, { column: string; join?: string; type: 'number' | 'string' | 'tag' }> = {
  // Direct media columns
  filename:   { column: 'm.filename',   type: 'string' },
  title:      { column: 'm.title',      type: 'string' },
  ext:        { column: 'm.ext',        type: 'string' },
  type:       { column: 'm.type',       type: 'string' },
  duration:   { column: 'm.durationSec', type: 'number' },
  width:      { column: 'm.width',      type: 'number' },
  height:     { column: 'm.height',     type: 'number' },
  size:       { column: 'm.size',       type: 'number' },
  added:      { column: 'm.addedAt',    type: 'number' },
  // media_stats joined
  rating:     { column: 's.rating',     type: 'number', join: 'LEFT JOIN media_stats s ON s.mediaId = m.id' },
  views:      { column: 's.views',      type: 'number', join: 'LEFT JOIN media_stats s ON s.mediaId = m.id' },
  ocount:     { column: 's.oCount',     type: 'number', join: 'LEFT JOIN media_stats s ON s.mediaId = m.id' },
  lastviewed: { column: 's.lastViewedAt', type: 'number', join: 'LEFT JOIN media_stats s ON s.mediaId = m.id' },
  // Tag-bucket fields — use tag-membership semantics
  tag:        { column: '_tag_',        type: 'tag' },
  performer:  { column: '_tag_',        type: 'tag' },
  studio:     { column: '_tag_',        type: 'tag' },
  platform:   { column: '_tag_',        type: 'tag' },
}

function compileAst(ast: Ast, ctx: CompileCtx): string {
  if (ast.kind === 'and') return `(${compileAst(ast.left, ctx)} AND ${compileAst(ast.right, ctx)})`
  if (ast.kind === 'or')  return `(${compileAst(ast.left, ctx)} OR ${compileAst(ast.right, ctx)})`
  if (ast.kind === 'not') return `NOT (${compileAst(ast.child, ctx)})`
  if (ast.kind === 'literal') {
    // Match against filename or title via LIKE %word%
    ctx.params.push(`%${ast.value}%`, `%${ast.value}%`)
    return `(m.filename LIKE ? OR m.title LIKE ?)`
  }
  if (ast.kind !== 'field') return '1=1'  // unreachable, but narrows for TS
  // field-term
  const meta = FIELD_MAP[ast.field]
  if (!meta) {
    // Unknown field — treat the whole "field:value" string as a literal match.
    ctx.params.push(`%${ast.field}:${String(ast.value)}%`)
    return `(m.filename LIKE ?)`
  }
  if (meta.type === 'tag') {
    // Tag membership via EXISTS subquery; prefix the tag with the
    // field name (performer:NAME, studio:NAME, etc) unless field is 'tag'.
    const prefix = ast.field === 'tag' ? '' : `${ast.field}:`
    const value = String(ast.value).toLowerCase()
    const tagName = ast.op === '~' ? value : prefix + value
    if (ast.op === '~') {
      ctx.params.push(tagName)
      return `EXISTS (SELECT 1 FROM media_tags mt JOIN tags t ON t.id = mt.tagId WHERE mt.mediaId = m.id AND lower(t.name) REGEXP ?)`
    }
    ctx.params.push(tagName)
    return `EXISTS (SELECT 1 FROM media_tags mt JOIN tags t ON t.id = mt.tagId WHERE mt.mediaId = m.id AND lower(t.name) = ?)`
  }
  if (meta.join) ctx.joins.add(meta.join)
  const op = ['>', '>=', '<', '<=', '=', '~'].includes(ast.op) ? ast.op : '='
  if (op === '~') {
    ctx.params.push(String(ast.value))
    return `${meta.column} REGEXP ?`
  }
  if (meta.type === 'number') {
    ctx.params.push(Number(ast.value))
    return `${meta.column} ${op === '=' ? '=' : op} ?`
  }
  // String column with LIKE for '=' (substring match — beets behavior).
  if (op === '=') {
    ctx.params.push(`%${String(ast.value)}%`)
    return `${meta.column} LIKE ?`
  }
  ctx.params.push(String(ast.value))
  return `${meta.column} ${op} ?`
}
