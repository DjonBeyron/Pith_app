import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { REHEARSAL_LINES, REHEARSAL_LINE_IDS, fillLine } from './rehearsalLines.js'
import { CAT_LINES, LINE_IDS, normalizeLines, linesItems, lineKey, lineMs, MAX_LINE_CHARS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { startCatLine } from '../player/modules/rotate-phone/wordLaneCatSay.js'
import { missingPitLines, pitVoiceCount, voiceMissingPitLines } from './rehearsalVoice.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { fixturePlan } from './rehearsalFixtures.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Реплики Пита-тренера (CONCEPT_REHEARSAL.md §2): тот же механизм, что у реплик кота игры — каталог, настройки, озвучка из библиотеки, подпись без озвучки
describe('каталог реплик Пита', () => {
  it('ключи таблицы §2: старт, разминка и промах, читка (зачем), сборка, чётко / обычно, без текста и подсказка, дубль, итог', () => {
    for (const id of ['rh_start', 'rh_warmup', 'rh_warmup_miss', 'rh_read_why', 'rh_build', 'rh_clear', 'rh_normal', 'rh_blind', 'rh_blind_hint', 'rh_take', 'rh_done']) expect(REHEARSAL_LINE_IDS).toContain(id)
    const t = Object.fromEntries(REHEARSAL_LINES.map(l => [l.id, l.text]))
    expect(t.rh_read_why).toContain('Слушай ритм, не слова — так фраза звучит по-настоящему') // решение владельца §6 п. 2
    expect(t.rh_clear).toBe('А теперь чётко — как для последнего ряда.'); expect(t.rh_normal).toBe('И ещё раз, обычно.')
    expect(t.rh_done).toBe('Отлично, получилось! Ещё одну?') // решение владельца: сказать проще
    expect(t.rh_blind_hint).toContain('{word}'); expect(t.rh_take).toBe('Дубль. Три, два, один…')
    expect(REHEARSAL_LINES.every(l => l.text.length <= MAX_LINE_CHARS && l.when)).toBe(true)
  })
  it('входят в общий каталог CAT_LINES после реплик игры, ключи уникальны; редактор ноды и настройки видят их сами', () => {
    expect(LINE_IDS).toEqual(expect.arrayContaining(REHEARSAL_LINE_IDS))
    expect(new Set(LINE_IDS).size).toBe(LINE_IDS.length)
    expect(CAT_LINES[0].id).toBe('split_words')
    expect(Object.keys(normalizeLines(null))).toEqual(LINE_IDS)
    expect(normalizeLines(null).rh_warmup.text).toBe('Разминка. Я показываю перевод — ты говоришь слово.')
  })
  it('озвучка из библиотеки, как у остальных реплик: настройки с url → слоты тапа «Начать» (linesItems), длительность по озвучке', () => {
    const l = normalizeLines({ lines: { rh_warmup: { text: 'Разминка. Я показываю перевод — ты говоришь слово.', url: 'u', duration: 3 } } })
    expect(linesItems(l)).toEqual([{ key: lineKey('rh_warmup'), url: 'u' }])
    expect(lineMs(l.rh_warmup)).toBe(3000)
  })
  it('нет озвучки — реплика только подписью, звука нет (cat-line-silent), рот не двигается', () => {
    const log = vi.fn()
    const r = startCatLine({ id: 'rh_start', line: normalizeLines(null).rh_start, log, catApi: { current: { peek: vi.fn() } } })
    expect(r.voiced).toBe(false)
    expect(log).toHaveBeenCalledWith('cat-line-silent', { id: 'rh_start', reason: 'no-url' })
  })
})

describe('{word} в реплике', () => {
  it('подставляется слово, озвучка шаблона сбрасывается (Пит произносит само слово из библиотеки)', () => {
    const base = { text: 'Начинается с «{word}».', url: 'u', duration: 2, words: [{ w: 'x' }] }
    expect(fillLine(base, { word: "I'm" })).toEqual({ text: "Начинается с «I'm».", url: null, duration: null, words: null })
    expect(fillLine(base, null)).toBe(base)
  })
  it('обычная реплика без {word} — та же, с озвучкой', () => {
    const base = { text: 'Отлично!', url: 'u', duration: 1, words: null }
    expect(fillLine(base, { word: 'x' })).toBe(base)
    expect(fillLine(undefined, { word: 'x' })).toBeUndefined()
  })
  it('useCatLines.sayLine(id, vars) подставляет слово; busyLeft() сообщает, сколько Пит ещё занят', () => {
    const src = read('../player/modules/rotate-phone/useCatLines.js')
    expect(src).toContain('const sayLine = (id, vars = null) => {')
    expect(src).toContain('const line = fillLine(lines?.[id], vars)')
    expect(src).toContain('const busyLeft = () => Math.max(0, busyRef.current - Date.now())')
    expect(src).toContain('return { text, sayLine, stop, busyLeft }')
  })
})

describe('реплики на стадиях', () => {
  it('каждая реплика стадии есть в каталоге; {word}-реплика озвучке не подлежит', () => {
    for (const id of ['three', 'two', 'one', 'none']) {
      const { stages } = buildRehearsalStages({ plan: fixturePlan(id), lib: () => null })
      for (const s of stages) if (s.line) expect(LINE_IDS).toContain(s.line)
      expect(stages.find(s => s.hintWord)).toBeTruthy()
    }
    expect(missingPitLines({}).map(l => l.id)).not.toContain('rh_blind_hint')
  })
})

describe('озвучка реплик Пита из «Теста игры»', () => {
  it('missingPitLines / pitVoiceCount: считают только озвучиваемые реплики (без {word})', () => {
    const total = REHEARSAL_LINES.filter(l => !l.text.includes('{')).length
    expect(missingPitLines({})).toHaveLength(total)
    expect(pitVoiceCount(null)).toEqual({ done: 0, total })
    const lines = normalizeLines({ lines: { rh_start: { text: REHEARSAL_LINES[0].text, url: 'u', duration: 1 } } })
    expect(pitVoiceCount(lines)).toEqual({ done: 1, total }); expect(missingPitLines(lines)).toHaveLength(total - 1)
  })
  it('voiceMissingPitLines: ElevenLabs → R2 → настройки приложения (как редактор ноды); озвученное не трогает', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const saved = []
    const done = await voiceMissingPitLines({
      load: async () => ({ lines: { rh_start: { text: REHEARSAL_LINES[0].text, url: 'old', duration: 2 } } }),
      speak: async text => ({ file: { text }, wordTimings: [{ w: 'a', t: 0, e: 1 }] }), upload: async f => `r2://${f.text.length}`, probe: async () => 1.5,
      save: async v => { saved.push(v) }, onStep() {},
    })
    vi.restoreAllMocks()
    const total = REHEARSAL_LINES.filter(l => !l.text.includes('{')).length
    expect(done).toBe(total - 1)
    expect(saved).toHaveLength(1)
    expect(saved[0].lines.rh_start.url).toBe('old')
    expect(saved[0].lines.rh_take).toMatchObject({ duration: 1.5, url: expect.stringMatching(/^r2:/) })
    expect(saved[0].lines.rh_blind_hint).toBeUndefined()
  })
  it('всё озвучено — в настройки ничего не пишем', async () => {
    const lines = {}
    for (const l of REHEARSAL_LINES) if (!l.text.includes('{')) lines[l.id] = { text: l.text, url: 'u', duration: 1 }
    const save = vi.fn()
    expect(await voiceMissingPitLines({ load: async () => ({ lines }), save, speak: vi.fn() })).toBe(0)
    expect(save).not.toHaveBeenCalled()
  })
})
