import { describe, it, expect } from 'vitest'
import { createLagTrace, createLagMarks, LAG_MS, LAG_WEAK_MS, LAG_QUIET_MS, LAG_BURST_MS, LAG_ITEMS } from './lagTrace.js'
import { sceneLabel, journalLabel, journalLine, lagSummaryLine } from './lagTraceLabels.js'

// Трассер лагов: кольцо меток, свёртка серии длинных кадров в одну строку, что попадает в «что шло», пауза и сводка
function rig({ limit = LAG_MS, events = [], journal = [] } = {}) {
  const out = [], clock = { t: 0 }, marks = createLagMarks({ now: () => clock.t, size: 4 })
  const trace = createLagTrace({ limit, log: l => out.push(l), events: () => events, lines: () => journal, marks })
  let ts = 1000
  const frames = (...gaps) => { for (const g of gaps) { ts += g; trace.frame(ts) } }
  trace.frame(ts) // первый кадр: точка отсчёта
  return { out, trace, marks, clock, frames, now: () => ts }
}
const calm = n => Array(n).fill(16.7)

describe('кольцо меток', () => {
  it('хранит последние size меток, старые вытесняются', () => {
    const clock = { t: 0 }, m = createLagMarks({ now: () => clock.t, size: 3 })
    for (let i = 1; i <= 5; i++) { clock.t = i * 10; m.add(`м${i}`, i) }
    expect(m.list().map(x => x.label).sort()).toEqual(['м3', 'м4', 'м5'])
    expect(m.list().find(x => x.label === 'м5')).toEqual({ t: 50, label: 'м5', ms: 5 })
  })
})

describe('строка одного длинного кадра', () => {
  it('обычные кадры ничего не пишут и ничего не собирают', () => {
    let asked = 0
    const out = [], trace = createLagTrace({ log: l => out.push(l), events: () => { asked++; return [] }, lines: () => { asked++; return [] } })
    for (let ts = 0; ts < 3000; ts += 16.7) trace.frame(ts)
    expect(out).toEqual([]); expect(asked).toBe(0)
  })

  it('кадр длиннее порога — одна строка после тишины: стадия, события окна со сдвигом от начала кадра', () => {
    const events = [{ t: 500, k: 'stage-in', sid: 'boss' }, { t: 900, k: 'answer', res: 'miss' }, { t: 1038, k: 'answer', res: 'win' }, { t: 1053, k: 'line-start', id: 'mia_ok_2' }, { t: 1060, k: 'knob', key: 'x' }, { t: 5000, k: 'pill', idx: 1 }]
    const r = rig({ events })
    r.frames(...calm(3), 83) // длинный кадр начался в 1050,1
    expect(r.out).toEqual([]) // строка — когда серия кончилась
    r.frames(...calm(Math.ceil(LAG_QUIET_MS / 16.7) + 1))
    expect(r.out).toEqual(['[lag] кадр 83 мс · стадия boss · что шло: ответ верный (за 12 мс до кадра), реплика mia_ok_2 старт (+3 мс)'])
  })

  it('метка анимации с длительностью называется и посреди анимации; строки журнала дают итог Vosk', () => {
    const journal = ['    900.0 09:00:00.900 [word-ear] итог «cat»: старое', '   1100.0 09:00:01.100 [word-ear] итог «dog»: dog conf 1', '   1101.0 09:00:01.101 [scene] {"k":"answer"}', '   1102.0 09:00:01.102 [perf] fps=60']
    const r = rig({ journal })
    r.clock.t = 700; r.marks.add('Мия: уход с коробкой', 1300)
    r.clock.t = 100; r.marks.add('давняя метка', 200)
    r.frames(...calm(3), 60)
    expect(r.trace.flush()).toBe('[lag] кадр 60 мс · стадия — · что шло: Мия: уход с коробкой (идёт 350 мс), итог Vosk (+50 мс)')
  })

  it('без событий — «меток нет», в сводке считается отдельно', () => {
    const r = rig()
    r.frames(40)
    expect(r.trace.flush()).toBe('[lag] кадр 40 мс · стадия — · что шло: меток нет')
    expect(r.trace.stats().blank).toBe(1)
  })

  it('виновник от браузера дописывается, если его кадр пересёкся с лагом', () => {
    const r = rig()
    r.trace.long({ start: 100, dur: 60, text: 'мимо' }); r.trace.long({ start: 1010, dur: 70, text: 'скрипт 41 мс' })
    r.frames(70)
    expect(r.trace.flush()).toMatch(/что шло: меток нет · браузер: скрипт 41 мс$/)
  })
})

describe('свёртка серии', () => {
  it('длинные кадры подряд и с промежутком меньше тишины — одна строка «×N»', () => {
    const r = rig({ events: [{ t: 990, k: 'stage-in', sid: 'sprint3-ann' }, { t: 1100, k: 'line-start', id: 'mia_push' }] })
    r.frames(50, 50, ...calm(5), 100, 34)
    r.frames(...calm(40))
    expect(r.out).toHaveLength(1)
    expect(r.out[0]).toBe('[lag] ×4 кадров за 0,3 с, худший 100 мс, лишних 167 мс · стадия sprint3-ann · что шло: стадия → sprint3-ann, реплика mia_push старт')
  })

  it('долгая серия режется по LAG_BURST_MS: не больше строки на этот срок', () => {
    const r = rig()
    r.frames(...Array(100).fill(50)) // 5 секунд сплошных длинных кадров
    r.trace.flush()
    expect(r.out.length).toBe(Math.ceil(5000 / (LAG_BURST_MS + 50)))
    expect(r.out.every(l => /^\[lag\] ×\d+ кадров/.test(l))).toBe(true)
  })

  it('подписей не больше LAG_ITEMS, повтор не дублируется', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({ t: 1001 + i, k: 'pill', idx: i })).concat([{ t: 1002, k: 'pill', idx: 0 }])
    const r = rig({ events })
    r.frames(50, 50)
    const line = r.trace.flush()
    expect(line.match(/пилюля №/g)).toHaveLength(LAG_ITEMS)
    expect(line).toMatch(/…ещё 4$/)
  })
})

describe('пауза, фон и сводка', () => {
  it('на паузе и после неё первый кадр не считается; кадр длиннее 3 с — вкладка была в фоне', () => {
    const r = rig()
    r.trace.pause(true); r.frames(200, 200); r.trace.pause(false); r.frames(900, ...calm(3), 5000)
    expect(r.trace.flush()).toBe(null); expect(r.trace.stats().frames).toBe(0)
  })

  it('пауза дописывает начатую серию', () => {
    const r = rig()
    r.frames(45); r.trace.pause(true)
    expect(r.out).toHaveLength(1)
  })

  it('итог: сколько кадров, мест, время игры и что чаще всего; после итога счёт с нуля', () => {
    const events = [{ t: 1010, k: 'answer', res: 'win' }, { t: 3010, k: 'answer', res: 'win' }, { t: 3015, k: 'pill', idx: 2 }]
    const r = rig({ events })
    r.frames(50, ...calm(120)); r.frames(60, 40, ...calm(60)); r.frames(...calm(3600)) // ещё минута игры
    const line = r.trace.summary()
    expect(line).toBe('[lag] итог: 3 длинных кадров (от 24 мс) в 2 местах за 1:03 игры; худший 60 мс, всего лишних 100 мс; чаще всего: ответ верный ×2, выезд пилюли ×1')
    expect(r.out[r.out.length - 1]).toBe(line)
    expect(r.trace.summary()).toBe(null) // игры после итога не было
  })

  it('чистая игра — «длинных кадров не было»; короче 2 с — итога нет', () => {
    const r = rig(); r.frames(...calm(200))
    expect(r.trace.summary()).toBe('[lag] итог: длинных кадров (от 24 мс) не было за 0:03 игры')
    const q = rig(); q.frames(...calm(10)); expect(q.trace.summary()).toBe(null)
  })

  it('порог: обычный 24 мс (кадр в полтора раза длиннее обычного), слабое устройство 50 мс', () => {
    expect([LAG_MS, LAG_WEAK_MS]).toEqual([24, 50])
    const n = rig(); n.frames(23, 24, 25); expect(n.trace.stats().frames).toBe(2)
    const r = rig({ limit: LAG_WEAK_MS }); r.frames(40, 49, 51); expect(r.trace.stats().frames).toBe(1)
  })
})

describe('подписи', () => {
  it('события сцены', () => {
    expect(sceneLabel({ k: 'answer', res: 'fail' })).toEqual({ key: 'ответ: не успел', text: 'ответ: не успел' })
    expect(sceneLabel({ k: 'line-end', id: 'boss_mia_look' })).toEqual({ key: 'конец реплики', text: 'реплика boss_mia_look конец' })
    expect(sceneLabel({ k: 'line-start', id: 'очень длинный текст слова голосом диктора целиком' }).text).toBe('реплика очень длинный текст слова го… старт')
    expect(sceneLabel({ k: 'knob' })).toBe(null); expect(sceneLabel(null)).toBe(null)
  })
  it('строки журнала', () => {
    expect(journalLine('   716242.0 09:32:47.711 [word-ear] итог «учиться»')).toEqual([716242, '[word-ear] итог «учиться»'])
    expect(journalLine('строк в журнале: 5')).toBe(null)
    expect(journalLabel('[word-ear] итог «учиться»: учиться conf 1')).toBe('итог Vosk')
    expect(journalLabel('[say-vosk] прогрев: загружаем модель в память')).toBe('смена модели Vosk')
    expect(journalLabel('[boss] экзамен: слово 3 — верно; трофеи 73, у Мии 47')).toBe('экзамен: счёт и полёт «+N»')
    expect(journalLabel('[cat] cat-speak {}')).toBe(null)
  })
  it('лаг посреди речи называет идущую реплику (журнал Android 2026-11-26: такие кадры шли «без меток»); договорившая реплика не называется', () => {
    const quiet = Math.ceil(LAG_QUIET_MS / 16.7) + 1
    const a = rig({ events: [{ t: 100, k: 'stage-in', sid: 'boss-ann' }, { t: 300, k: 'line-start', id: 'pit_reply', ms: 3000 }, { t: 800, k: 'knob', key: 'x' }] })
    a.frames(...calm(3), 67, ...calm(quiet)) // длинный кадр начался в 1050,1 — реплика идёт 750 мс
    expect(a.out).toEqual(['[lag] кадр 67 мс · стадия boss-ann · что шло: идёт реплика pit_reply (750 мс)'])
    expect(a.trace.stats().keys.get('идёт реплика')).toBe(1); expect(a.trace.stats().blank).toBe(0)
    const b = rig({ events: [{ t: 100, k: 'stage-in', sid: 'boss-ann' }, { t: 300, k: 'line-start', id: 'pit_reply', ms: 400 }, { t: 700, k: 'line-end', id: 'pit_reply' }] })
    b.frames(...calm(3), 67, ...calm(quiet))
    expect(b.out).toEqual(['[lag] кадр 67 мс · стадия boss-ann · что шло: меток нет'])
    const c = rig({ events: [{ t: 100, k: 'stage-in', sid: 'boss-ann' }, { t: 200, k: 'line-start', id: 'cut', ms: 300 }] }) // оборванная реплика без события конца: не дольше её длины + 0,4 с
    c.frames(...calm(3), 67, ...calm(quiet))
    expect(c.out[0]).toContain('меток нет')
  })
  it('сводка без лагов и с лагами без меток', () => {
    expect(lagSummaryLine({ frames: 2, bursts: 2, worst: 41.2, extra: 40, playMs: 200000, keys: new Map(), blank: 2 }, 24)).toBe('[lag] итог: 2 длинных кадров (от 24 мс) в 2 местах за 3:20 игры; худший 41 мс, всего лишних 40 мс; чаще всего: —; без меток ×2')
  })
})
