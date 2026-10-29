import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FADE_TOP, FADE_BOTTOM, PILL_H, OPEN_Y, LOCK_MS, TRAVEL_MS } from './wordLaneTimeline.js'
import { SNAP_LEAD_MS, POP_MS } from './wordLaneSnap.js'
import { planDictor } from './wordLaneDictor.js'
import { buildRecipe } from './wordLaneRecipe.js'
import { clipsFromFills } from './wordLaneAudio.js'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const readLane = () => read('../../../../styles/player/modules/word-lane.css') + read('../../../../styles/player/modules/word-lane-pill.css') // раскладка и пилюли: одна вёрстка игры в двух файлах
const css = readLane()

// «Ощущение» игры: затемнения сверху/снизу, кот поверх всего, отклик пилюль без опоздания, старт диктора без простоя
describe('затемнения сверху и снизу', () => {
  it('в вёрстке те же высоты, что в константах раскладки; они над пилюлями и не ловят касания', () => {
    expect(css).toMatch(new RegExp(`\\.wlFade--top \\{[^}]*height: ${FADE_TOP}%`))
    expect(css).toMatch(new RegExp(`\\.wlFade--bottom \\{[^}]*height: ${FADE_BOTTOM}%`))
    expect(css).toMatch(/\.wlFade \{[^}]*pointer-events: none/)
    const pills = read('./WordLanePills.jsx')
    expect(pills.indexOf('wlFade--top')).toBeGreaterThan(pills.indexOf('data-pill'))   // в разметке после пилюль — рисуются поверх
    expect(pills.indexOf('wlDots')).toBeGreaterThan(pills.indexOf('wlFade--bottom'))   // а огоньки — поверх затемнения
  })

  it('пилюля становится «полностью открытой» уже после затемнения сверху и ещё до затемнения снизу', () => {
    expect(OPEN_Y - PILL_H / 2).toBeGreaterThanOrEqual(FADE_TOP)
    expect(OPEN_Y + PILL_H / 2).toBeLessThan(100 - FADE_BOTTOM)
  })
})

describe('кот поверх всего интерфейса', () => {
  it('z-index кота выше микрофона, плашек, затемнений и кнопки закрытия; кликов не ловит', () => {
    const z = Number(/\.wlCat\.scn \{[^}]*z-index: (\d+)/.exec(css)?.[1])
    expect(z).toBeGreaterThan(7)                                   // крестик — 7, тап-слой «Порядка» — 5
    for (const m of read('../../../../styles/player/modules/word-lane-mic.css').matchAll(/z-index: (\d+)/g)) expect(z).toBeGreaterThan(Number(m[1]))
    expect(css).toMatch(/\.wlCat\.scn \{[^}]*pointer-events: none/)
  })
})

describe('диктор начинает сразу, как первая пилюля полностью открылась', () => {
  it('и без записи, и с записью первое слово ступени — через время выката до OPEN_Y + запас, без долгого пустого экрана', () => {
    const chunks = ['try']
    const step = buildRecipe(chunks).rounds[0].steps[0]
    const clips = clipsFromFills([{ start: 0.15, end: 0.65 }, { start: 1.0, end: 1.5 }, { start: 1.9, end: 2.4 }])
    for (const c of [null, clips]) {
      const plan = planDictor({ step, chunks, clips: c })
      expect(plan.pills[0].at).toBeGreaterThanOrEqual(TRAVEL_MS)
      expect(plan.pills[0].at).toBeLessThan(TRAVEL_MS + 200)
    }
  })
})

describe('отклик пилюль без опоздания', () => {
  it('диктор: щелчок начинается раньше конца слова так, чтобы пик хлопка пришёлся на конец слова', () => {
    expect(SNAP_LEAD_MS).toBeGreaterThanOrEqual(120)
    expect(Math.abs(SNAP_LEAD_MS - POP_MS * 0.38)).toBeLessThan(80)
    expect(read('./useWordLanePills.js')).toContain('t >= h.p.at + h.p.ms - SNAP_LEAD_MS')
  })

  it('ученик: щелчок — на событии snap (слово принято), а не после заливки; заливка до 100 % быстрая', () => {
    expect(LOCK_MS).toBeLessThanOrEqual(200)
    const eng = read('./useWordLanePills.js')
    expect(eng).toMatch(/e\.type === 'snap'\) \{[^}]*snapPill/)
    expect(eng).not.toMatch(/e\.type === 'win'\) \{[^}]*snapPill/)
    const g = createStudentGame({ step: buildRecipe(['try']).rounds[0].steps[0], chunks: ['try'] })
    let claimAt = null
    const seq = []
    for (let t = 0; t <= 4000; t += 16) {
      if (t >= 2500 && !seq.length) seq.push(0)
      for (const e of stepStudent(g, t, { level: 0.5, seq, misses: 0 })) if (e.type === 'claim') claimAt = t
    }
    expect(claimAt).toBeGreaterThanOrEqual(2500)
    expect(claimAt).toBeLessThan(2500 + 20)                           // отклик в том же кадре, когда распознавание отдало слово
  })

  it('слушатель стартует под плашкой «твоя очередь» (тяжёлый запуск Vosk — не во время хода пилюль), слова до конвейера ученика не считаются', () => {
    expect(read('./wordLaneStages.js')).toContain("if (s.type === 'turn' || isStudentStage(s)) return s.step")
    expect(read('./useWordLanePills.js')).toContain('g.seenSeq = liveRef.current.seq.length')
    expect(read('./wordLaneListen.js')).toContain('chunk: 2048')      // куски по 2048 кадров (≈ 46 мс): уровень голоса для пилюль приходит ≈ 22 раза в секунду, главный поток — вдвое меньше вызовов, чем при 1024
  })
})

describe('кот выскакивает заранее', () => {
  it('до голоса диктора и до слова ученика: пружина (0,55 с) успевает отыграть, и видно, как открывается рот', async () => {
    const { CAT_LEAD_MS } = await import('./useWordLanePills.js')
    expect(CAT_LEAD_MS).toBeGreaterThanOrEqual(600)
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('t >= r.at - CAT_LEAD_MS')
    expect(eng).toContain('fxRef.current?.peek?.(2600)')
    expect(read('./useWordLaneFlow.js')).toContain('peek(ms) { catApi?.current?.peek?.(ms) }')
  })
})
