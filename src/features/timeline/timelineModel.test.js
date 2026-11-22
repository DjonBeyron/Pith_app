import { describe, it, expect } from 'vitest'
import { buildTimeline, stageAt, unionSpans, coverMs } from './timelineModel.js'
import { buildPauses, topDead, playerSpans } from './timelinePauses.js'
import { buildSummary, actsOf } from './timelineSummary.js'
import { reportLines, rows } from './timelineReport.js'
import { fixtureEvents, longFixture } from './timelineFixture.js'
import { stamp, dur, lineText } from './timelineFormat.js'

const m = buildTimeline(fixtureEvents(), { seed: 'r1' })

describe('модель таймлайна: дорожки', () => {
  it('время — от начала прохождения; стадии идут встык, у ступени ученика есть отметка «ход кончен»', () => {
    expect(m.t0).toBe(5000)
    expect(m.stages.map(s => s.sid)).toEqual(['sprint-ann', 'sprint', 'catch-ann', 'catch', 'phrases-ann', 'phrases1', 'summary'])
    m.stages.slice(1).forEach((s, i) => expect(m.stages[i].end).toBe(s.t))
    const s1 = m.stages[1]; expect(s1.out).toBeGreaterThan(s1.t); expect(s1.out).toBeLessThan(s1.end)
    expect(stageAt(m, s1.t + 10).sid).toBe('sprint'); expect(stageAt(m, 0)).toBeNull()
  })

  it('реплики разложены по говорящим, с текстом, длиной и концом по событию line-end', () => {
    const pit = m.lines.filter(l => l.who === 'pit'), mia = m.lines.filter(l => l.who === 'mia'), dic = m.lines.filter(l => l.who === 'dictor')
    expect(pit[0]).toMatchObject({ id: 'race_start', text: 'Встряхнём память, я говорю слова, а ты переводишь вслух', t: 200, end: 3600, why: 'done' })
    expect(mia.map(l => l.id)).toEqual(['mia_enter', 'mia_fast', 'mia_leave']); expect(mia[1].silent).toBe(true); expect(mia[1].end - mia[1].t).toBe(1600)
    expect(dic[0]).toMatchObject({ text: 'встречать', sid: 'sprint' })
    expect(lineText(pit[0])).toBe('Пит: «Встряхнём память, я говорю слова, а ты переводишь вслух» (race_start, 3,4 с)')
  })

  it('реплика без звука (подпись) кончается по своей длине; «без звука» и рот по тексту — одна реплика, а не две', () => {
    const silent = m.lines.find(l => l.id === 'race_phrases_pick'); expect(silent.silent).toBe(true); expect(silent.end - silent.t).toBe(2000)
    const x = buildTimeline([{ t: 0, k: 'line-silent', id: 'a', reason: 'no-synth' }, { t: 5, k: 'line-start', who: 'pit', id: 'a', text: 'привет', ms: 900 }, { t: 6, k: 'line-start', who: 'pit', id: 'a', text: 'привет', ms: 900, silent: true }, { t: 910, k: 'line-end', id: 'a', why: 'done' }, { t: 3000, k: 'end' }])
    expect(x.lines).toHaveLength(1); expect(x.lines[0]).toMatchObject({ silent: true, reason: 'no-synth', text: 'привет', end: 910 })
  })

  it('у реплики нет события конца — кончается по длине с запасом, не позже конца прохождения; пауза игры обрывает реплику', () => {
    const x = buildTimeline([{ t: 0, k: 'line-start', who: 'pit', id: 'a', ms: 1000 }, { t: 9000, k: 'end' }]); expect(x.lines[0].end).toBe(3000)
    const y = buildTimeline([{ t: 0, k: 'line-start', who: 'pit', id: 'a', ms: 5000 }, { t: 1000, k: 'pause', why: 'hidden' }, { t: 4000, k: 'stage-in', sid: 's' }, { t: 5000, k: 'end' }])
    expect(y.lines[0]).toMatchObject({ end: 1000, why: 'pause' }); expect(y.holds[0]).toMatchObject({ t: 1000, end: 4000 })
  })

  it('ходы: пилюля от появления до исхода, промах не закрывает ход слова, смена стадии закрывает без исхода', () => {
    const see = m.turns.find(u => u.word === 'see' && u.sid === 'sprint'); expect(see.res).toBe('fail'); expect(see.end - see.t).toBe(3200)
    expect(m.answers.filter(a => a.word === 'see' && a.sid === 'sprint').map(a => [a.res, a.final])).toEqual([['miss', false], ['fail', true]])
    const meet = m.turns[0]; expect(meet).toMatchObject({ word: 'meet', res: 'win', ms: 1300, lane: 0 }); expect(meet.claimT - meet.t).toBe(1300)
    const ph = m.turns.filter(u => u.phrase); expect(ph.map(u => u.res)).toEqual(['win', 'miss'])
    const x = buildTimeline([{ t: 0, k: 'pill', idx: 0, word: 'a' }, { t: 500, k: 'stage-in', sid: 'b' }, { t: 900, k: 'end' }]); expect(x.turns[0]).toMatchObject({ res: 'none', end: 500 })
  })

  it('события после end не считаются; пустая трасса не падает', () => {
    expect(buildTimeline([{ t: 0, k: 'run' }, { t: 100, k: 'end' }, { t: 9000, k: 'line-start', who: 'pit', id: 'x', ms: 10 }]).lines).toHaveLength(0)
    const e = buildTimeline([]); expect(e.dur).toBe(0); expect(buildPauses(e)).toEqual([]); expect(reportLines(e).join('\n')).toContain('событий сцены нет')
  })

  it('unionSpans / coverMs', () => {
    expect(unionSpans([{ t: 5, end: 9 }, { t: 0, end: 3 }, { t: 2, end: 6 }, { t: 20, end: 20 }])).toEqual([{ t: 0, end: 9 }])
    expect(coverMs([{ t: 0, end: 10 }, { t: 20, end: 30 }], 5, 25)).toBe(10)
  })
})

describe('паузы: «ждём игрока» и «игра молчит»', () => {
  const pauses = buildPauses(m, 1500)
  it('куски пауз не накладываются на речь и друг на друга, идут по времени', () => {
    const speech = unionSpans(m.lines)
    for (const p of pauses) expect(coverMs(speech, p.t, p.end)).toBe(0)
    pauses.slice(1).forEach((p, i) => expect(p.t).toBeGreaterThanOrEqual(pauses[i].end))
  })

  it('пилюля на экране без исхода — «ждём игрока», это не проблема: долгой паузой не считается', () => {
    const bring = m.turns.find(u => u.word === 'bring' && u.sid === 'sprint') // 3,6 с молчания, пока игрок не успел
    const inside = pauses.filter(p => p.t >= bring.t && p.end <= bring.end)
    expect(inside.map(p => p.kind)).toEqual(['player']); expect(inside[0].ms).toBe(3600); expect(inside[0].long).toBe(false)
    expect(playerSpans(m).some(s => s.t === bring.t && s.end === bring.end)).toBe(true)
  })

  it('никто не говорит и игрока не ждём — «игра молчит»; дольше порога — долгая, с «перед / после» (кто и полный текст) и стадией по-человечески', () => {
    const long = pauses.filter(p => p.long)
    expect(long.map(p => p.ms)).toEqual([3350, 1900, 3200])
    expect(long[0]).toMatchObject({ kind: 'dead', sid: 'sprint', act: 'sprint', stage: 'Конвейер слов — круг', before: { who: 'player', text: 'не успел «bring»' }, after: { who: 'pit', id: 'race_catch', text: 'Теперь наоборот, я говорю слово, а ты ловишь перевод', quoted: true } })
    expect(long[0].mid).toEqual(['Плашка: Конвейер слов (реверс)']) // плашка следующего круга вышла внутри паузы
    expect(long[2]).toMatchObject({ before: { who: 'dictor', text: 'See you later', id: '' }, after: { who: 'pit', id: 'race_phrases_pick', note: 'без озвучки — подпись' }, sid: 'phrases1', stage: 'Фразы — круг 1 «Пойми»' })
  })

  it('порог — параметр: 1 с находит больше долгих пауз, 2 с — меньше; топ — самые длинные первыми', () => {
    const n = thr => buildPauses(m, thr).filter(p => p.long).length
    expect(n(500)).toBeGreaterThan(n(1500)); expect(n(1000)).toBeGreaterThanOrEqual(n(1500)); expect(n(2000)).toBe(2)
    expect(topDead(pauses).map(p => p.ms)).toEqual([3350, 3200, 1900])
    expect(topDead(buildPauses(buildTimeline(longFixture(200)), 1000))).toHaveLength(10)
  })

  it('отсчёт нотами, ожидание техники и пауза игры — не «игра молчит»', () => {
    const kinds = new Set(pauses.map(p => p.kind)); for (const k of ['count', 'wait', 'paused', 'player', 'dead']) expect(kinds.has(k), k).toBe(true)
    const hold = m.holds[0]; expect(pauses.filter(p => p.kind === 'dead' && p.t < hold.end && p.end > hold.t)).toEqual([])
    expect(pauses.find(p => p.kind === 'count').ms).toBe(2500)
  })

  it('стадия ученика без пилюль («Вершина») — весь ход «ждём игрока»', () => {
    const x = buildTimeline([{ t: 0, k: 'stage-in', sid: 'climb1', type: 'student' }, { t: 4000, k: 'stage-out', sid: 'climb1' }, { t: 4000, k: 'end' }])
    expect(buildPauses(x).map(p => [p.kind, p.ms])).toEqual([['player', 4000]])
  })
})

describe('сводка и текстовый отчёт', () => {
  const pauses = buildPauses(m), sum = buildSummary(m, pauses)
  it('сводка: длительность, речь каждого, тишина и долгие паузы — всего и по этапам', () => {
    expect(sum.dur).toBe(m.dur); expect(sum.longCount).toBe(3); expect(sum.deadLong).toBe(3350 + 1900 + 3200)
    expect(sum.speak.mia).toBe(7000); expect(sum.speak.pit).toBeGreaterThan(20000)
    expect(actsOf(m).map(a => [a.act, a.stages])).toEqual([['sprint', 2], ['catch', 2], ['phrases', 2], ['summary', 1]])
    expect(sum.acts.map(a => a.longCount)).toEqual([1, 1, 1, 0]); expect(sum.acts[1].speak.mia).toBe(7000); expect(sum.acts[0].title).toBe('Конвейер слов')
  })

  it('отчёт: хронология «+время  кто: «текст» (id, длина)», долгие паузы с ⚠, список пауз и этапы', () => {
    const text = reportLines(m, { threshold: 1500 })
    expect(text[0]).toBe('== ТАЙМЛАЙН ИГРЫ ==')
    expect(text).toContain('   +12,860 с  Пит: «отличное произношение» (race_good_1, 1,5 с)')
    expect(text).toContain('   +52,120 с  Мия: «Быстро, быстро» (mia_fast, 1,6 с, без озвучки — подпись)')
    expect(text).toContain('   +81,900 с  ⚠ пауза 3,2 с — игра молчит: перед: Диктор: «See you later»; после: Пит: «я описываю ситуацию, а ты тапни фразу, которая подходит» (без озвучки — подпись) [race_phrases_pick]; этап: Фразы — круг 1 «Пойми»')
    expect(text.slice(text.indexOf('1. 3,4 с на 0:31 (+31,300 с) — этап: Конвейер слов — круг [sprint]')).slice(1, 5)).toEqual(['   перед:  игрок: не успел «bring»', '           последняя реплика: Диктор: «приносить» — 3,7 с до паузы', '   после:  Пит: «Теперь наоборот, я говорю слово, а ты ловишь перевод» [race_catch]', '   внутри: началась стадия «Плашка: Конвейер слов (реверс)»'])
    expect(text.some(l => l.includes('Конвейер слов — реверс [catch]: 37,0 с; Пит 6,8 с, Мия 7,0 с'))).toBe(true)
    expect(reportLines(m, { dropped: 40 })[3]).toContain('начало трассы вытеснено (40 событий)')
    const order = rows(m, pauses).map(r => r.t); expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('числа по-русски: запятая, «мс» для коротких, минуты для длинных', () => {
    expect(stamp(12340)).toBe('+12,340 с'); expect(dur(1840)).toBe('1,8 с'); expect(dur(80)).toBe('80 мс'); expect(dur(0)).toBe('0 с'); expect(dur(1590100)).toBe('26 мин 30 с')
  })
})
