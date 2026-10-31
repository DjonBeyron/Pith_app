import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { REHEARSAL_LINES, REHEARSAL_LINE_IDS, fillLine, pickLine, sessionLine, lineVariants, baseLineId } from './rehearsalLines.js'
import { mulberry32 } from './rehearsalSeed.js'
import { CAT_LINES, LINE_IDS, normalizeLines, linesItems, lineKey, lineMs, MAX_LINE_CHARS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { startCatLine } from '../player/modules/rotate-phone/wordLaneCatSay.js'
import { missingPitLines, pitVoiceCount, voiceMissingPitLines } from './rehearsalVoice.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { fixturePlan } from './rehearsalFixtures.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Реплики Пита-тренера (CONCEPT_REHEARSAL.md §2): тот же механизм, что у реплик кота игры — каталог, настройки, озвучка из библиотеки, подпись без озвучки
describe('каталог реплик Пита', () => {
  it('ключи таблицы §2: старт, разминка и промах, читка (зачем), сборка, чётко / обычно, без текста и подсказка, дубль, итог', () => {
    for (const id of ['rh_start', 'rh_start_b', 'rh_warmup', 'rh_warmup_miss', 'rh_read_why', 'rh_build', 'rh_clear', 'rh_normal', 'rh_blind', 'rh_blind_hint', 'rh_blind_hint_pre', 'rh_take', 'rh_mirror', 'rh_done', 'rh_done_b']) expect(REHEARSAL_LINE_IDS).toContain(id)
    const t = Object.fromEntries(REHEARSAL_LINES.map(l => [l.id, l.text]))
    expect(t.rh_start).toBe('Повторим то, что учили, и прокачаем произношение'); expect(t.rh_start_b).toBe('Окей, возвращаемся к знакомым словам и улучшим произношение')
    expect(t.rh_warmup).toBe('давай разомнёмся, я показываю перевод, а ты говоришь слово по-английски'); expect(t.rh_warmup_miss).toBe('Опа, кажется, слово немного забылось, повторим завтра')
    expect(t.rh_read_why).toBe('Сейчас скажу фразу целиком, следи за подсветкой и повтори в том же ритме') // решения владельца (2026-10-31)
    expect(t.rh_clear).toBe('А теперь чётко, как для последнего ряда'); expect(t.rh_normal).toBe('И ещё раз, только расслабленно, будто болтаешь с другом')
    expect(t.rh_blind).toBe('Ну-ка, по памяти, я подскажу, если застрянешь'); expect(t.rh_blind_hint).toBe('Начни с {word}'); expect(t.rh_blind_hint_pre).toBe('Начни с')
    expect(t.rh_take).toBe('поехали'); expect(t.rh_mirror).toBe('Послушаем по очереди и сравним произношение, сначала я, потом ты')
    expect(t.rh_done).toBe('Рад, что мы потренировались вместе, хочешь ещё?'); expect(t.rh_done_b).toBe('Здорово получилось, с каждым разом всё увереннее')
    expect(REHEARSAL_LINES.every(l => l.text.length <= MAX_LINE_CHARS && l.when)).toBe(true)
  })
  it('входят в общий каталог CAT_LINES после реплик игры, ключи уникальны; редактор ноды и настройки видят их сами', () => {
    expect(LINE_IDS).toEqual(expect.arrayContaining(REHEARSAL_LINE_IDS))
    expect(new Set(LINE_IDS).size).toBe(LINE_IDS.length)
    expect(CAT_LINES[0].id).toBe('split_words')
    expect(Object.keys(normalizeLines(null))).toEqual(LINE_IDS)
    expect(normalizeLines(null).rh_warmup.text).toBe('давай разомнёмся, я показываю перевод, а ты говоришь слово по-английски')
  })
  it('озвучка из библиотеки, как у остальных реплик: настройки с url → слоты тапа «Начать» (linesItems), длительность по озвучке', () => {
    const l = normalizeLines({ lines: { rh_warmup: { text: 'давай разомнёмся, я показываю перевод, а ты говоришь слово по-английски', url: 'u', duration: 3 } } })
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
    const base = { text: 'Начни с {word}', url: 'u', duration: 2, words: [{ w: 'x' }] }
    expect(fillLine(base, { word: "I'm" })).toEqual({ text: "Начни с I'm", url: null, duration: null, words: null })
    expect(fillLine(base, null)).toBe(base)
  })
  it('caption: подпись длиннее озвучки («Начни с слово» при голосе «Начни с») — озвучка и текст остаются', () => {
    const pre = { text: 'Начни с', url: 'u', duration: 1, words: null }
    expect(fillLine(pre, { caption: "Начни с I'm" })).toEqual({ ...pre, caption: "Начни с I'm" })
    expect(read('../player/modules/rotate-phone/useCatLines.js')).toContain('setText(line.caption ?? line.text)')
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

// Варианты реплик (CONCEPT_REHEARSAL.md §8 и решения владельца 2026-10-31): два текста только у старта и итога (по номеру запуска), у сборки (rh_build, rh_clear) остались прежние по три, у остальных один
describe('варианты реплик Пита', () => {
  const RANDOM = ['rh_build', 'rh_clear']
  const ONE = ['rh_warmup', 'rh_warmup_miss', 'rh_read_why', 'rh_normal', 'rh_blind', 'rh_blind_hint', 'rh_blind_hint_pre', 'rh_discern', 'rh_take', 'rh_mirror']
  it('rh_start и rh_done — два ключа (основной, _b); rh_build и rh_clear — по три; остальные — один', () => {
    for (const b of ['rh_start', 'rh_done']) expect(lineVariants(b), b).toEqual([b, `${b}_b`])
    for (const b of RANDOM) expect(lineVariants(b), b).toEqual([b, `${b}_b`, `${b}_c`])
    for (const b of ONE) expect(lineVariants(b), b).toEqual([b])
    expect(REHEARSAL_LINES).toHaveLength(2 * 2 + RANDOM.length * 3 + ONE.length)
    for (const id of REHEARSAL_LINE_IDS) expect(lineVariants(baseLineId(id))).toContain(id)
    expect(baseLineId('rh_blind_hint_pre')).toBe('rh_blind_hint_pre'); expect(baseLineId('rh_start_b')).toBe('rh_start')
    expect(LINE_IDS).toEqual(expect.arrayContaining(['rh_done_b', 'rh_start_b', 'rh_blind_hint_pre'])) // варианты — обычные ключи каталога: озвучка, редактор ноды, слоты
  })
  it('тексты для озвучки ElevenLabs: нет . … ! — –, нет «фраза твоя», длина до MAX_LINE_CHARS, тексты разные', () => {
    const t = Object.fromEntries(REHEARSAL_LINES.map(l => [l.id, l.text]))
    expect(new Set(Object.values(t)).size).toBe(REHEARSAL_LINES.length)
    for (const l of REHEARSAL_LINES) { expect(l.text.length, l.id).toBeLessThanOrEqual(MAX_LINE_CHARS); expect(l.text.toLowerCase(), l.id).not.toContain('фраза твоя'); expect(l.when, l.id).toBeTruthy(); expect(l.text, l.id).not.toMatch(/[.…!—–]/) }
    expect(normalizeLines(null).rh_done_b.text).toBe('Здорово получилось, с каждым разом всё увереннее')
  })
  it('pickLine: повтор подряд запрещён (по сессии), выбираются все варианты, без вариантов — тот же ключ', () => {
    for (const base of RANDOM) {
      const rng = mulberry32(7), last = {}
      let prev = null
      const seen = new Set()
      for (let i = 0; i < 60; i++) { const id = pickLine(base, rng, last); expect(id, `${base} #${i}`).not.toBe(prev); expect(lineVariants(base)).toContain(id); prev = id; seen.add(id) }
      expect(seen.size).toBe(3)
    }
    expect(pickLine('rh_blind_hint', mulberry32(1), {})).toBe('rh_blind_hint'); expect(pickLine('rh_normal', mulberry32(1), {})).toBe('rh_normal')
  })
  it('sessionLine: старт и итог — по номеру запуска (plan.run), не по семени; остальные — одно семя, тот же вариант', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      expect(sessionLine({ seed }, 'rh_start')).toBe('rh_start'); expect(sessionLine({ seed, run: 0 }, 'rh_done')).toBe('rh_done')
      expect(sessionLine({ seed, run: 1 }, 'rh_start')).toBe('rh_start_b'); expect(sessionLine({ seed, run: 1 }, 'rh_done')).toBe('rh_done_b')
      expect(sessionLine({ seed, run: 5 }, 'rh_start')).toBe('rh_start_b'); expect(sessionLine({ seed, run: 5 }, 'rh_done')).toBe('rh_done_b') // «второй и далее»
    }
    expect(sessionLine(null, 'rh_start')).toBe('rh_start'); expect(sessionLine({ run: 'x' }, 'rh_done')).toBe('rh_done')
    expect(sessionLine({ seed: 'z' }, 'rh_clear')).toBe(sessionLine({ seed: 'z' }, 'rh_clear'))
    expect(new Set(Array.from({ length: 40 }, (_, i) => sessionLine({ seed: `z${i}` }, 'rh_clear'))).size).toBe(3)
    expect(sessionLine({ seed: 'q', run: 1 }, 'rh_normal')).toBe('rh_normal')
  })
  it('озвучка по ключу: вариант — отдельная реплика с url, остальные варианты без озвучки', () => {
    const l = normalizeLines({ lines: { rh_done_b: { text: 'Здорово получилось, с каждым разом всё увереннее', url: 'u', duration: 1 } } })
    expect(linesItems(l)).toEqual([{ key: lineKey('rh_done_b'), url: 'u' }]); expect(missingPitLines(l).map(m => m.id)).toContain('rh_done'); expect(missingPitLines(l).map(m => m.id)).not.toContain('rh_done_b')
    expect(missingPitLines({}).map(m => m.id)).toContain('rh_blind_hint_pre') // «Начни с» озвучивается, шаблон с {word} — нет
  })
})
