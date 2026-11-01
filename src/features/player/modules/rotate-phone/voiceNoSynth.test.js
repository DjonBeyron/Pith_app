import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'

// Голоса системы (speechSynthesis) в игре «Повтори за диктором» и в репетиции НЕТ: на iPhone синтез захватывает аудиосессию — дорожка микрофона заглушается iOS на ~12 с, первое слово ученика не распознаётся,
// AudioContext «interrupted», а сама речь стартует с задержкой или обрывается («canceled»). Сторож идёт по графу импортов игры и репетиции и ищет speechSynthesis / SpeechSynthesisUtterance в коде (комментарии не в счёт).
const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../../..')
const ENTRIES = [
  'features/player/modules/rotate-phone/RotatePhoneModule.jsx',
  'features/player/modules/rotate-phone/wordLaneStart.js',
  'features/player/modules/rotate-phone/wordLaneWarm.js',
  'features/rehearsal/rehearsalMirror.js',
  'features/rehearsal/mirror/libraryRms.js',
]
// Явно разрешено: наблюдатель отладки. Он только оборачивает speechSynthesis.speak, чтобы записать в журнал «синтез заговорил» (доказательство, что его в игре нет); сам не говорит.
const ALLOWED = new Set(['features/player/modules/rotate-phone/wordLaneDebugProbe.js'])
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g

function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec)
  for (const p of [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js')]) if (/\.(jsx?)$/.test(p) && existsSync(p)) return p
  return null
}

function graph(entries) {
  const seen = new Map()
  const todo = entries.map(e => resolve(src, e))
  while (todo.length) {
    const file = todo.pop()
    if (seen.has(file)) continue
    const text = readFileSync(file, 'utf8')
    seen.set(file, text)
    for (const m of strip(text).matchAll(IMPORT)) {
      const next = resolveImport(file, m[1] ?? m[2] ?? m[3])
      if (next && !/\.test\./.test(next)) todo.push(next)
    }
  }
  return new Map([...seen].map(([f, t]) => [relative(src, f).replaceAll('\\', '/'), t]))
}

describe('в игре и репетиции нет голоса системы', () => {
  const files = graph(ENTRIES)
  it('граф импортов собран (иначе сторож зелёный впустую): игра, диктор, кот, зеркало', () => {
    expect(files.size).toBeGreaterThan(60)
    for (const f of ['features/player/modules/rotate-phone/wordLaneVoice.js', 'features/player/modules/rotate-phone/wordLaneCatSay.js', 'features/player/modules/rotate-phone/useCatLines.js', 'features/rehearsal/mirror/libraryRms.js', 'features/rehearsal/rehearsalMirror.js']) expect(files.has(f)).toBe(true)
  })
  it('ни в одном модуле графа нет speechSynthesis / SpeechSynthesisUtterance (кроме наблюдателя отладки)', () => {
    const bad = [...files].filter(([f, t]) => !ALLOWED.has(f) && /speechSynthesis|SpeechSynthesisUtterance/.test(strip(t))).map(([f]) => f)
    expect(bad).toEqual([])
  })
  it('наблюдатель отладки сам не говорит: нет new SpeechSynthesisUtterance и вызова speechSynthesis.speak(', () => {
    const probe = strip(files.get([...ALLOWED][0]))
    expect(probe).not.toMatch(/new SpeechSynthesisUtterance/)
    expect(probe).not.toMatch(/\bspeechSynthesis\.speak\(/)
  })
  it('запасных путей через голос системы нет: speakText и unlockVoice удалены, прогрев не будит синтезатор', () => {
    const voice = strip(files.get('features/player/modules/rotate-phone/wordLaneVoice.js'))
    expect(voice).not.toMatch(/speakText|unlockVoice/)
    const start = strip(files.get('features/player/modules/rotate-phone/wordLaneStart.js'))
    expect(start).not.toMatch(/unlockVoice/)
  })
})

describe('куски диктора без озвучки', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); vi.doUnmock('../../../../shared/lib/debug.js'); vi.doUnmock('../../../../shared/lib/wordAudio/wordAudioApi.js') })

  it('speakWord: слова нет в библиотеке — тишина (null), синтезатор не трогается, в журнал плеера строка про синтез', async () => {
    const speak = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(t) { this.text = t } })
    const logs = []
    vi.doMock('../../../../shared/lib/debug.js', () => ({ pLog: m => logs.push(m), dbg: () => {} }))
    vi.doMock('../../../../shared/lib/wordAudio/wordAudioApi.js', () => ({ cachedWordAudio: () => new Map() }))
    const { speakWord } = await import('./wordLaneVoice.js')
    expect(speakWord('trying')).toBeNull()
    expect(speak).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('без озвучки') && l.includes('синтез речи запрещён'))).toBe(true)
  })
})
