import { describe, it, expect } from 'vitest'
import { buildTimeline } from '../timelineModel.js'
import { buildMontage, soundMs, clipByKey, groupBefore, TAIL_MIN_MS } from './montageModel.js'
import { nowAt, stepClip } from './montageNow.js'
import { montageEvents } from './montageFixture.js'
import { realEvents } from '../timelineFixtureReal.js'
import { longFixture } from '../timelineFixture.js'
import { visible, windowOf, labelMode, clampScale, scrollAfterZoom, spanScale, miniRect, scrollFromMini, fitScale, MAX_SCALE, CLIP_TEXT_PX, CLIP_DUR_PX } from '../timelineView.js'

const mont = (events = montageEvents(), thr) => buildMontage(buildTimeline(events), thr)
const keys = m => m.clips.map(c => c.key)

describe('монтаж: клипы — сколько реально звучало аудио', () => {
  it('клип = длина озвучки (ms из line-start), но не больше отрезка «начало — конец»; хвост — от конца звука до события конца', () => {
    const m = mont(), a = clipByKey(m, 'pit:a#1')
    expect(a).toMatchObject({ who: 'pit', id: 'a', text: 'А', t: 1000, end: 3050, sound: 2000, tail: 50, silent: false, sid: 'sprint' })
    expect(a.tail).toBeGreaterThanOrEqual(TAIL_MIN_MS)
    expect(clipByKey(m, 'dictor:w1#1')).toMatchObject({ sound: 1000, tail: 0 })
    expect(soundMs({ t: 0, end: 700, ms: 2000 })).toBe(700)  // реплику оборвали — звучало меньше буфера
    expect(soundMs({ t: 0, end: 900, ms: 0 })).toBe(900)     // длина неизвестна — весь отрезок
  })

  it('ключ клипа — «кто:id#N»: вторая такая же реплика получает #2 (правка находит свой клип и в другой игре)', () => {
    expect(keys(mont())).toEqual(['pit:a#1', 'dictor:w1#1', 'pit:b#1', 'mia:m#1', 'pit:a#2', 'pit:c#1'])
  })

  it('тишина перед клипом считается от конца предыдущего звука ЛЮБОГО говорящего', () => {
    const m = mont()
    expect(m.clips.map(c => [c.prev, c.gap])).toEqual([[null, 1000], ['pit:a#1', 3000], ['dictor:w1#1', 2650], ['pit:b#1', 500], ['mia:m#1', 500], ['pit:a#2', 500]])
    expect(m.clips.every(c => !c.over && !c.clash)).toBe(true)
  })

  it('настоящая игра владельца: длина каждого клипа — буфер озвучки, расхождение с отрезком «начало — конец» не больше 82 мс', () => {
    const tl = buildTimeline(realEvents()), m = buildMontage(tl)
    expect(m.clips.length).toBeGreaterThan(30)
    for (const c of m.clips) {
      expect(Math.abs(c.sound - c.ref.ms), c.key).toBeLessThanOrEqual(1) // звук = длина буфера (у Мии конец приходит на 1 мс раньше — округление)
      expect(c.tail, c.key).toBeGreaterThanOrEqual(0); expect(c.tail, c.key).toBeLessThanOrEqual(82)
      if (c.ref.played != null) expect(Math.abs(c.end - c.t - c.ref.played), c.key).toBeLessThanOrEqual(1) // played из cat-speak-end = отрезок на столе
    }
    expect(new Set(m.clips.map(c => c.who))).toEqual(new Set(['pit', 'dictor', 'mia']))
    expect(m.gaps.some(g => g.kind === 'anim' && g.sid === 'catch-rev')).toBe(true) // разворот конвейера — анимация без речи, а не «игра молчит»
  })
})

describe('монтаж: зазоры — измеримая тишина между звуками', () => {
  it('куски тишины с причинами: игра молчит (долгая — красная), ждём игрока; сумма кусков промежутка = тишине перед клипом', () => {
    const m = mont()
    expect(m.gaps.map(g => [g.t, g.end, g.kind, g.long])).toEqual([
      [0, 1000, 'dead', false], [3050, 6050, 'dead', true], [7050, 7100, 'dead', false], [7100, 9100, 'player', false], [9100, 9700, 'dead', false],
      [11200, 11700, 'dead', false], [12700, 13200, 'dead', false], [14000, 14500, 'dead', false], [15000, 16000, 'dead', false],
    ])
    const g = groupBefore(m, clipByKey(m, 'pit:b#1'))
    expect(g).toMatchObject({ t: 7050, end: 9700, ms: 2650, flex: 650, locked: 2000 }); expect(g.pieces.map(p => p.kind)).toEqual(['dead', 'player', 'dead'])
    for (const c of m.clips) expect(groupBefore(m, c)?.ms ?? 0, c.key).toBe(c.gap)
    expect(mont(montageEvents(), 5000).gaps.some(x => x.long)).toBe(false) // порог «долгой» — параметр
  })

  it('стадия-анимация: тишина внутри неё — «анимация без речи» (жёлтая), её тоже можно сокращать', () => {
    const ev = montageEvents().map(e => (e.k === 'stage-in' ? { ...e, sid: 'catch-rev', act: 'catch', type: 'announce' } : e))
    const m = mont(ev)
    expect(m.gaps.find(g => g.t === 3050)).toMatchObject({ kind: 'anim', long: false, stage: 'Разворот конвейера' })
    expect(groupBefore(m, clipByKey(m, 'dictor:w1#1'))).toMatchObject({ flex: 3000, locked: 0 })
  })

  it('дорожки: этапы с названием для админа, пилюли с исходом, ответы, ноты', () => {
    const m = mont()
    expect(m.stages).toHaveLength(1); expect(m.stages[0]).toMatchObject({ t: 0, end: 16000, sid: 'sprint', title: 'Конвейер слов — круг', anim: false })
    expect(m.pills.map(p => [p.t, p.end, p.word, p.res])).toEqual([[7100, 9200, 'w1', 'win']])
    expect(m.answers.map(a => [a.t, a.res])).toEqual([[9200, 'win']]); expect(m.notes).toHaveLength(1); expect(m.dur).toBe(16000)
  })
})

describe('монтаж: указатель и «в этот момент»', () => {
  it('кто говорит, какая тишина идёт и сколько, какая пилюля на экране', () => {
    const m = mont()
    expect(nowAt(m, 2000)).toMatchObject({ stageMs: 2000, gap: null }); expect(nowAt(m, 2000).speaking.map(c => c.key)).toEqual(['pit:a#1'])
    const quiet = nowAt(m, 8000)
    expect(quiet.speaking).toEqual([]); expect(quiet.gap).toMatchObject({ kind: 'player', ms: 2000 }); expect(quiet.gapMs).toBe(900); expect(quiet.group.ms).toBe(2650)
    expect(quiet.pills.map(p => p.word)).toEqual(['w1']); expect(quiet.before.key).toBe('dictor:w1#1'); expect(quiet.after.key).toBe('pit:b#1')
    expect(nowAt(m, 4000).gap).toMatchObject({ kind: 'dead', long: true })
  })

  it('← → прыгают по началам клипов, дальше клипов нет — начало / конец игры', () => {
    const m = mont()
    expect(stepClip(m, 0, 1)).toBe(1000); expect(stepClip(m, 1000, 1)).toBe(6050); expect(stepClip(m, 14500, 1)).toBe(16000)
    expect(stepClip(m, 6050, -1)).toBe(1000); expect(stepClip(m, 1000, -1)).toBe(0)
  })
})

describe('геометрия монтажа (timelineView)', () => {
  it('подпись клипа по ширине: текст + длительность, только длительность, ничего', () => {
    expect(labelMode(CLIP_TEXT_PX)).toBe('text'); expect(labelMode(CLIP_TEXT_PX - 1)).toBe('dur'); expect(labelMode(CLIP_DUR_PX)).toBe('dur'); expect(labelMode(CLIP_DUR_PX - 1)).toBe('none')
    expect(labelMode(1800 * 0.05)).toBe('text') // реплика 1,8 с при 50 px/с — 90 px: текст виден
  })

  it('масштаб вокруг момента: момент остаётся на том же месте экрана; пределы масштаба; «этап во всю ширину»', () => {
    const scale = 0.05, t = 20000, left = 600, x = t * scale - left // момент стоит в 400 px от края дорожек
    const next = 0.1, left2 = scrollAfterZoom(t, x, next)
    expect(t * next - left2).toBe(x)
    expect(scrollAfterZoom(100, 400, 0.1)).toBe(0) // левее начала прокрутить нельзя
    const fit = fitScale(120000, 1200)
    expect(clampScale(0.000001, fit)).toBe(fit); expect(clampScale(9, fit)).toBe(MAX_SCALE)
    expect(spanScale({ t: 10000, end: 30000 }, 1000, fit)).toBeCloseTo(0.045, 5) // 20 с на 90 % ширины
  })

  it('мини-карта: прямоугольник окна и обратный переход', () => {
    expect(miniRect(0, 1000, 0.05, 100000, 500)).toEqual({ x: 0, w: 100 })       // видно 20 с из 100 — пятая часть карты
    expect(miniRect(2500, 1000, 0.05, 100000, 500)).toEqual({ x: 250, w: 100 })
    expect(miniRect(0, 1000, 0.0001, 100000, 500).w).toBe(500)                   // окно не шире карты
    expect(scrollFromMini(250, 500, 100000, 0.05, 1000)).toBe(2000)              // центр окна — на середине игры
  })

  it('длинная игра: в окне — только видимые клипы и зазоры (не тысячи узлов)', () => {
    const m = mont(longFixture())
    expect(m.clips.length).toBeGreaterThan(700)
    const scale = 0.05, win = windowOf(40000, 1300, scale)
    const seen = visible(m.clips, win, scale).length + visible(m.gaps, win, scale, 3, g => g.long).length + visible(m.pills, win, scale).length
    expect(seen).toBeGreaterThan(5); expect(seen).toBeLessThan(140)
    const whole = fitScale(m.dur, 1300), all = visible(m.clips.filter(c => c.who === 'pit'), windowOf(0, 1300, whole), whole)
    expect(all.length).toBeLessThan(700) // «вся игра»: узкие клипы слиты в блоки ×N
  })
})
