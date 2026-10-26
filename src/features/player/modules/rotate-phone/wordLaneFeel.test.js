import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FADE_TOP, FADE_BOTTOM, PILL_H, OPEN_Y, LOCK_MS, ENTER_Y } from './wordLaneTimeline.js'
import { SNAP_LEAD_MS, POP_MS } from './wordLaneSnap.js'
import { makeListenPlan } from './wordLanePlan.js'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = read('../../../../styles/player/modules/word-lane.css')

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
    expect(z).toBeGreaterThan(3)                                   // крестик — 3
    for (const m of read('../../../../styles/player/modules/word-lane-mic.css').matchAll(/z-index: (\d+)/g)) expect(z).toBeGreaterThan(Number(m[1]))
    expect(css).toMatch(/\.wlCat\.scn \{[^}]*pointer-events: none/)
  })
})

describe('диктор начинает сразу, как первая пилюля полностью открылась', () => {
  it('без озвучки и с озвучкой первое слово — через время выката до OPEN_Y + 80 мс, без долгого пустого экрана', () => {
    const plain = makeListenPlan(null)
    const withFile = makeListenPlan([{ start: 0.15, end: 0.65 }, { start: 1.0, end: 1.5 }, { start: 1.9, end: 2.4 }])
    for (const p of [plain, withFile]) {
      expect(p.fillAt[0]).toBeGreaterThanOrEqual((OPEN_Y - ENTER_Y) / 26 * 1000 - 1)
      expect(p.fillAt[0]).toBeLessThan((OPEN_Y - ENTER_Y) / 26 * 1000 + 150)
    }
    expect(withFile.skipMax).toBe(110)                              // тишина перед первым словом файла — запас для перемотки опоздавшего звука (минус 40 мс)
  })
})

describe('отклик пилюль без опоздания', () => {
  it('диктор: щелчок начинается раньше конца слова так, чтобы пик хлопка пришёлся на конец слова', () => {
    expect(SNAP_LEAD_MS).toBeGreaterThanOrEqual(120)
    expect(Math.abs(SNAP_LEAD_MS - POP_MS * 0.38)).toBeLessThan(80)
    expect(read('./useWordLanePills.js')).toContain('t >= at + ms - SNAP_LEAD_MS')
  })

  it('ученик: щелчок — на событии claim (слово принято), а не после заливки; заливка до 100 % быстрая', () => {
    expect(LOCK_MS).toBeLessThanOrEqual(200)
    const eng = read('./useWordLanePills.js')
    expect(eng).toMatch(/e\.type === 'claim'\) \{[^}]*snapPill/)
    expect(eng).not.toMatch(/e\.type === 'win'\) \{[^}]*snapPill/)
    const g = createStudentGame({})
    let claimAt = null
    for (let t = 0; t <= 4000; t += 16) {
      for (const e of stepStudent(g, t, { level: 0.5, hits: t >= 2500 ? 1 : 0 })) if (e.type === 'claim') { claimAt = t; expect(e.order).toBe(0) }
    }
    expect(claimAt).toBeGreaterThanOrEqual(2500)
    expect(claimAt).toBeLessThan(2500 + 20)                           // отклик в том же кадре, когда распознавание отдало слово
  })

  it('слушатель стартует в «твоей очереди» (тяжёлый запуск Vosk — под плашкой), а слова до конвейера ученика не считаются', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain("const listening = s.phase === 'turn' || s.phase === 'speak'")
    expect(read('./useWordLanePills.js')).toContain('g.seenHits = live.current.hits')
    expect(read('./wordLaneListen.js')).toContain('chunk: 1024')      // куски по 64 мс — уровень голоса для пилюль приходит чаще
  })

  it('опоздавший звук перематывается, а не тормозит пилюлю', () => {
    expect(read('./useWordLanePills.js')).toContain('fxRef.current?.skipAudio?.(late)')
    expect(read('./useWordLaneFlow.js')).toContain('skipAudio(ms)')
  })
})
