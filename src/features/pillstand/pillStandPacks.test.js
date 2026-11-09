import { describe, it, expect } from 'vitest'
import { buildPack, readPackJson, JSON_MARK } from './pillStandReport.js'
import { packEvents, normTopics, journalFor } from './pillStandPacks.js'
import { fixtureEvents, fixtureFrames, fixtureJournal, JOURNAL_T0 } from './pillStandPackFixture.js'

// Пакеты тем «📤 Отправить»: каждый содержит нужное и НЕ содержит лишнего (CONCEPT_PILLSTAND.md, «Отправка по теме»)
const NOW = new Date(2026, 10, 9, 14, 3, 27)
const meta = { version: '3.3.179', device: 'iPhone iOS 18.1 375×812 @3', seed: 'abc', mode: 'words', lang: 'en', len: 'any', auto: true, autoMs: 1200 }
const pack = (topics, extra = {}) => buildPack({ topics, span: { kind: 'session' }, at: 9500, comment: 'заливка дёрнулась на «meet»', marks: [{ t: 1500, i: 30 }], meta, events: fixtureEvents(), frames: fixtureFrames(), journal: { lines: fixtureJournal(), t0abs: JOURNAL_T0, dropped: 0 }, now: NOW, ...extra })
const readable = p => p.text.split(`\n${JSON_MARK}\n`)[0]

describe('отправка по теме: выбор тем', () => {
  it('«Всё» поглощает остальные, порядок — как в списке тем', () => {
    expect(normTopics(['ear', 'anim'])).toEqual(['anim', 'ear'])
    expect(normTopics(['ear', 'all'])).toEqual(['all'])
  })
  it('объединение тем: сырой черновик «Распознавания» главнее сокращённого «heard» «Анимации»', () => {
    const ev = fixtureEvents()
    expect(packEvents(['anim'], ev).find(e => e.t === 1300)).toEqual({ t: 1300, k: 'heard', src: 'черновик', text: 'nice', fresh: ['nice'] })
    expect(packEvents(['anim', 'ear'], ev).find(e => e.t === 1300).raw).toEqual({ partial: 'nice' })
  })
})

describe('отправка по теме: Анимация', () => {
  const p = pack(['anim']), txt = readable(p), j = readPackJson(p.text)
  it('кадры, заливка, «[fill]», reach, пилюля, моменты слов Vosk словами, метрики задержек и рывков', () => {
    expect(txt).toContain('-- кадры (')
    expect(txt).toContain('Nice (to 0,20) ░ ░')
    expect(txt).toContain('nudge')
    expect(txt).toContain('вспышка×1')
    expect(txt).toContain('Vosk черновик: «nice» (новые слова: nice)')
    expect(txt).toContain('Vosk итог: «nice to meet you»')
    expect(txt).toContain('[fill] неверное слово «the», ждём «to»')
    expect(txt).toContain('заливка дошла: «nice» за 80 мс')
    expect(txt).toContain('пилюля: win')
    expect(txt).toContain('-- Анимация: метрики --')
    expect(txt).toContain('слово → заливка дошла (по трассе): «nice» 70 мс')
    expect(txt).toMatch(/рывки экрана ≥ 0,08 за кадр: \d+/)
    expect(j.frames.length).toBeGreaterThan(200)
  })
  it('без сырого JSON Vosk, rms и затвора; кадры — без rms', () => {
    expect(txt).not.toContain('"partial"')
    expect(txt).not.toContain('"conf"')
    expect(txt).not.toMatch(/\brms\b/)
    expect(txt).not.toContain('затвор')
    expect(txt).not.toContain('[phrase-ear]')
    expect(j.events.some(e => e.raw || e.k === 'level' || e.k === 'gate' || e.k === 'vosk-partial' || e.k === 'same')).toBe(false)
    expect(j.frames.every(f => f.e.rms === undefined && f.e.gate === undefined)).toBe(true)
    expect(p.text).not.toContain('"rms"')
  })
  it('журнал: только строки «[fill]» игры (не «[stand]», не чужие теги)', () => {
    expect(j.journal.map(l => l.text)).toEqual(['[fill] +1300 мс: слово 1 «nice» черновик → цель 0,25, экран 0,05'])
  })
})

describe('отправка по теме: Распознавание', () => {
  const p = pack(['ear']), txt = readable(p), j = readPackJson(p.text)
  it('сырые черновики и итоги с conf, кто закрыл, словарь, затвор, rms с переходами порога, [phrase-ear], задержка голос → черновик', () => {
    expect(txt).toContain('черновик {"partial":"nice"}')
    expect(txt).toContain('"conf":0.8')
    expect(txt).toContain('закрыл: движок сам')
    expect(txt).toContain('словарь Vosk: ["nice","to","meet","you","[unk]"]')
    expect(txt).toContain('затвор открыт (rms 0,2000)')
    expect(txt).toContain('rms 0,2000 ▲ голос')
    expect(txt).toContain('rms 0,0010 ▽ тишина')
    expect(txt).toContain('[phrase-ear] черновик «nice to meet»')
    expect(txt).toContain('голос → первый черновик 300 мс')
    expect(txt).toContain('перестроек 1 — +1600 «nice the» → «nice to meet»')
    expect(txt).toContain('повторов того же текста 1')
    expect(txt).toContain('кто закрыл заходы: движок сам ×1')
    const levels = j.events.filter(e => e.k === 'level')
    expect(levels.length).toBeLessThan(fixtureEvents().filter(e => e.k === 'level').length / 3) // прорежено
    expect(levels.some(e => e.t === 1000 && e.voice)).toBe(true) // переход порога — всегда
  })
  it('без кадров и заливки; журнал — [phrase-ear] без повторов трассы', () => {
    expect(txt).not.toContain('-- кадры')
    expect(txt).not.toContain('заливка:')
    expect(j.frames).toEqual([])
    expect(p.text).not.toContain('"mask"')
    expect(j.journal.map(l => l.text)).toEqual(['[phrase-ear] итог «nice to meet you» (движок сам) +905 мс'])
  })
})

describe('отправка по теме: Зачёт и логика', () => {
  const p = pack(['logic']), txt = readable(p)
  it('решения слушателей, слова и откаты, зачёт, неверные слова, тексты итогов для контекста', () => {
    expect(txt).toContain('слово 1 «nice» засчитано черновиком')
    expect(txt).toContain('слушатель слов: partial')
    expect(txt).toContain('слушатель: listening, seq [0]')
    expect(txt).toContain('[phrase-ear] кандидаты')
    expect(txt).toContain('[fill] неверное слово «the», ждём «to»')
    expect(txt).toContain('фраза: ratio 1,00')
    expect(txt).toContain('зачёт ✓ ratio 1,00, чисто')
    expect(txt).toContain('Vosk итог: «nice to meet you»')
    expect(txt).toContain('-- Зачёт и логика: метрики --')
    expect(txt).toContain('неверные слова: «the» вместо «to»')
  })
  it('без rms, сырого JSON Vosk, кадров и заливки', () => {
    expect(txt).not.toMatch(/\brms\b/)
    expect(txt).not.toContain('"partial"')
    expect(txt).not.toContain('-- кадры')
    expect(txt).not.toContain('заливка:')
  })
})

describe('отправка по теме: Честность', () => {
  const p = pack(['honesty']), txt = readable(p), j = readPackJson(p.text)
  it('метрики честности и события-доказательства ±300 мс вокруг ложных и «додуманных»', () => {
    expect(txt).toContain('ложные срабатывания: 2 — +4900 слово без голоса «you»')
    expect(txt).toContain('затвор закрыт')
    expect(txt).toContain('додумано Vosk: «the» черн.×1')
    expect(txt).toContain('слово 4 «you» засчитано итогом') // доказательство (5000 мс)
    expect(txt).toContain('черновик {"partial":"nice the"}') // доказательство «додуманного» (1600 мс)
    expect(j.honesty).toMatchObject({ falses: 2, extra: 1 })
  })
  it('вне окон — ничего: ни зачёта (2300), ни неверного слова (2000), ни кадров, ни rms-событий', () => {
    expect(j.events.some(e => e.t === 2300 || e.t === 2000)).toBe(false)
    expect(j.events.some(e => e.k === 'level' || e.k === 'fill')).toBe(false)
    expect(txt).not.toContain('-- кадры')
  })
})

describe('отправка по теме: Всё', () => {
  const p = pack(['all']), txt = readable(p), j = readPackJson(p.text)
  it('полная трасса, все кадры (с панелью Vosk) и весь журнал за сессию', () => {
    expect(j.events).toHaveLength(fixtureEvents().length)
    expect(j.frames).toHaveLength(fixtureFrames().length)
    expect(j.frames[0].e.rms).toBe(0.2)
    expect(j.journal.map(l => l.text)).toContain('[stand] fill {"goal":0.25}')
    expect(j.journal.map(l => l.text)).toContain('[audio] unlock')
    expect(j.journal.map(l => l.text)).not.toContain('[audio] до стенда') // до старта трассы — вне сессии
    for (const s of ['-- Анимация: метрики --', '-- Распознавание (Vosk): метрики --', '-- Зачёт и логика: метрики --', '-- Честность (ложные срабатывания): метрики --', '-- кадры (']) expect(txt).toContain(s)
  })
  it('журнал по теме для прочих тем — без «[stand]»', () => {
    const lines = fixtureJournal().map(l => ({ text: l.replace(/^\s*\S+ \S+ /, '') }))
    expect(journalFor(['ear', 'logic'], lines).map(l => l.text)).toEqual(['[phrase-ear] черновик «nice to meet» +430 мс', '[phrase-ear] итог «nice to meet you» (движок сам) +905 мс', '[phrases] круг 2 «Скажи»: цель «cat»'])
  })
})
