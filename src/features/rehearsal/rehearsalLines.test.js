import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { REHEARSAL_LINES, REHEARSAL_LINE_IDS, fillLine, pickLine, sessionLine, lineVariants, baseLineId } from './rehearsalLines.js'
import { rngFor, mulberry32 } from './rehearsalSeed.js'
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

// Варианты реплик (CONCEPT_REHEARSAL.md §8): у ключа 2–3 текста одного смысла, выбор по семени, повтор подряд запрещён
describe('варианты реплик Пита', () => {
  const WITH_VARIANTS = ['rh_start', 'rh_warmup', 'rh_warmup_miss', 'rh_read_why', 'rh_build', 'rh_clear', 'rh_normal', 'rh_blind', 'rh_take', 'rh_mirror', 'rh_done']
  it('у одиннадцати ключей — три варианта (основной, _b, _c); у rh_blind_hint с {word} и rh_discern — без вариантов', () => {
    for (const b of WITH_VARIANTS) expect(lineVariants(b), b).toEqual([b, `${b}_b`, `${b}_c`])
    for (const b of ['rh_blind_hint', 'rh_discern']) expect(lineVariants(b)).toEqual([b])
    expect(REHEARSAL_LINES).toHaveLength(WITH_VARIANTS.length * 3 + 2)
    for (const id of REHEARSAL_LINE_IDS) expect(lineVariants(baseLineId(id))).toContain(id)
    expect(LINE_IDS).toEqual(expect.arrayContaining(['rh_done_b', 'rh_done_c', 'rh_normal_c'])) // варианты — обычные ключи каталога: озвучка, редактор ноды, слоты
  })
  it('основной вариант — прежний текст; тексты разные, до 120 знаков, без оборота «фраза твоя»; пример rh_done из задания', () => {
    const t = Object.fromEntries(REHEARSAL_LINES.map(l => [l.id, l.text]))
    expect(t.rh_done).toBe('Отлично, получилось! Ещё одну?'); expect(t.rh_done_b).toBe('Готово. Берём ещё одну?'); expect(t.rh_done_c).toBe('Звучит! Повторим с другой?')
    expect(new Set(Object.values(t)).size).toBe(REHEARSAL_LINES.length)
    for (const l of REHEARSAL_LINES) { expect(l.text.length, l.id).toBeLessThanOrEqual(MAX_LINE_CHARS); expect(l.text.toLowerCase(), l.id).not.toContain('фраза твоя'); expect(l.when, l.id).toBeTruthy() }
    expect(normalizeLines(null).rh_done_c.text).toBe('Звучит! Повторим с другой?')
  })
  it('pickLine: повтор подряд запрещён (по сессии), выбираются все варианты, без вариантов — тот же ключ', () => {
    for (const base of WITH_VARIANTS) {
      const rng = mulberry32(7), last = {}
      let prev = null
      const seen = new Set()
      for (let i = 0; i < 60; i++) { const id = pickLine(base, rng, last); expect(id, `${base} #${i}`).not.toBe(prev); expect(lineVariants(base)).toContain(id); prev = id; seen.add(id) }
      expect(seen.size).toBe(3)
    }
    expect(pickLine('rh_blind_hint', mulberry32(1), {})).toBe('rh_blind_hint'); expect(pickLine('rh_blind_hint', mulberry32(1), {})).toBe('rh_blind_hint')
    const last = {}; pickLine('rh_done', mulberry32(3), last); expect(last.rh_done).toMatch(/^rh_done/)
  })
  it('pickLine с first: «И ещё раз, обычно.» не выбирается, когда «обычно» идёт первым', () => {
    for (let i = 0; i < 80; i++) expect(pickLine('rh_normal', rngFor(`s${i}`), {}, { first: true })).not.toBe('rh_normal')
    expect(new Set(Array.from({ length: 80 }, (_, i) => pickLine('rh_normal', rngFor(`s${i}`), {}))).size).toBe(3)
  })
  it('sessionLine: одно семя плана — тот же вариант; разные семена — разные варианты', () => {
    expect(sessionLine({ seed: 'z' }, 'rh_done')).toBe(sessionLine({ seed: 'z' }, 'rh_done'))
    expect(new Set(Array.from({ length: 40 }, (_, i) => sessionLine({ seed: `z${i}` }, 'rh_done'))).size).toBe(3)
  })
  it('озвучка по ключу: вариант — отдельная реплика с url, остальные варианты без озвучки', () => {
    const l = normalizeLines({ lines: { rh_done_b: { text: 'Готово. Берём ещё одну?', url: 'u', duration: 1 } } })
    expect(linesItems(l)).toEqual([{ key: lineKey('rh_done_b'), url: 'u' }]); expect(missingPitLines(l).map(m => m.id)).toContain('rh_done_c'); expect(missingPitLines(l).map(m => m.id)).not.toContain('rh_done_b')
  })
})
