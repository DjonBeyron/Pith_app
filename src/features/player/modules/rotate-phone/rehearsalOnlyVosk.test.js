import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Страж «в игре и репетиции слушает только Vosk»: ни один модуль, до которого можно дойти по импортам из WordLaneGame.jsx, RotatePhoneModule.jsx и из src/features/rehearsal/**, не использует нативный
// SpeechRecognition / webkitSpeechRecognition (браузерный транскрибатор: на iPhone уходит в облако Apple, ломает аудиосессию и «дует» в режимы микрофона) и не подключает speechController.js / sayVoicePlan.js /
// speechSupport.js (обёртки над ним). sayLevelSource.js допустим: он берёт только уровень голоса. Комментарии не считаются — проверяем строки кода.
const SRC = fileURLToPath(new URL('../../../../', import.meta.url))
const HERE = path.dirname(fileURLToPath(import.meta.url))
const FORBIDDEN_FILES = new Set(['speechController.js', 'sayVoicePlan.js', 'speechSupport.js'])
const FORBIDDEN_CODE = /SpeechRecognition/ // и webkitSpeechRecognition: подстрока та же

/** Исходник без комментариев (// и блочных); строки в кавычках не трогаем — упоминание SpeechRecognition в строке кода тоже нарушение */
function stripComments(code) {
  let out = ''
  let i = 0
  let quote = null
  while (i < code.length) {
    const c = code[i], n = code[i + 1]
    if (quote) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue } if (c === quote) quote = null; i += 1; continue }
    if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') i += 1; continue }
    if (c === '/' && n === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') quote = c
    out += c; i += 1
  }
  return out
}

const walk = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const isSource = f => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f)

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null // пакеты не проверяем
  const base = path.resolve(path.dirname(from), spec)
  for (const cand of [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]) if (existsSync(cand) && statSync(cand).isFile()) return cand
  return null
}

/** Все модули, достижимые из entries: { files: Set, hits: [{ file, why }] } */
function crawl(entries) {
  const seen = new Set()
  const hits = []
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (FORBIDDEN_FILES.has(path.basename(file))) hits.push({ file, why: 'подключён модуль нативного распознавания' })
    const code = stripComments(readFileSync(file, 'utf8'))
    if (FORBIDDEN_CODE.test(code)) hits.push({ file, why: 'в коде SpeechRecognition' })
    for (const m of code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const dep = resolveImport(file, m[1])
      if (dep && isSource(dep)) queue.push(dep)
    }
  }
  return { files: seen, hits }
}

const entries = [path.join(HERE, 'WordLaneGame.jsx'), path.join(HERE, 'RotatePhoneModule.jsx'), ...walk(path.join(SRC, 'features/rehearsal')).filter(isSource)]
const { files, hits } = crawl(entries)
const rel = f => path.relative(SRC, f).split(path.sep).join('/')

describe('игра и репетиция слушают только Vosk', () => {
  it('граф импортов от WordLaneGame / RotatePhoneModule / rehearsal охватывает игру целиком (страж не пустой)', () => {
    const names = [...files].map(rel)
    expect(files.size).toBeGreaterThan(60)
    for (const must of ['features/player/modules/rotate-phone/useWordLaneFlow.js', 'features/player/modules/rotate-phone/wordLaneListen.js', 'features/rehearsal/useRehearsalActs.js', 'features/player/modules/rotate-phone/wordLaneStart.js']) expect(names).toContain(must)
  })

  it('ни один модуль графа не использует SpeechRecognition / webkitSpeechRecognition и не подключает speechController / sayVoicePlan / speechSupport', () => {
    expect(hits.map(h => `${rel(h.file)}: ${h.why}`)).toEqual([])
  })

  it('распознавание в игре — Vosk: слушатель берёт движок Vosk, а sayLevelSource.js (только уровень голоса) допустим', () => {
    const listen = readFileSync(path.join(HERE, 'wordLaneListen.js'), 'utf8')
    expect(listen).toMatch(/vosk/i)
    expect(stripComments(listen)).not.toMatch(FORBIDDEN_CODE)
  })

  it('сам страж ловит нарушение: комментарии игнорируются, код и запрещённый импорт — нет', () => {
    expect(FORBIDDEN_CODE.test(stripComments('// new webkitSpeechRecognition()\n/* SpeechRecognition */ const a = 1'))).toBe(false)
    expect(FORBIDDEN_CODE.test(stripComments('const R = window.webkitSpeechRecognition'))).toBe(true)
    expect(FORBIDDEN_CODE.test(stripComments("const s = 'SpeechRecognition' // x"))).toBe(true)
    expect(resolveImport(path.join(HERE, 'x.js'), 'react')).toBeNull()
  })
})
