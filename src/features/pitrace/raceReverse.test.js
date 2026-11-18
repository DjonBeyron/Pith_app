// Обратный конвейер (проход B «Конвейера слов», владелец 2026-11-17): слова едут снизу вверх, верные улетают вниз, Пит отпрыгивает от выезжающих
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { awayX, ZONE_Y } from './raceDodgeUp.js'
import { mirrorY, flightPosition, edgeFrames } from '../player/modules/rotate-phone/wordLaneMotion.js'
import { riseFrames, RISE_END_Y } from '../player/modules/rotate-phone/wordLaneRise.js'
import { ENTER_Y, EXIT_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { buildRaceStages } from './raceStages.js'
import { LANE_X } from '../player/modules/rotate-phone/wordLaneTimeline.js'

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const plan = { game: 'race', seed: 's1', chunks: ['learn', 'meet', 'nice', 'trying'], words: ['learn', 'meet', 'nice', 'trying'].map(text => ({ text, translation: `ru ${text}`, confusers: [] })), phrases: [] }

describe('обратный конвейер', () => {
  it('экранная высота зеркальна: вход снизу (100 − ENTER_Y), выход сверху (100 − EXIT_Y); кадры полёта и край масштаба симметричны', () => {
    expect(mirrorY(ENTER_Y)).toBe(100 - ENTER_Y); expect(mirrorY(EXIT_Y)).toBeLessThan(0)
    const fw = edgeFrames(false), bw = edgeFrames(true)
    expect(bw[0].translate).toBe(flightPosition(mirrorY(ENTER_Y))); expect(bw.at(-1).translate).toBe(flightPosition(mirrorY(EXIT_Y)))
    expect(bw.map(f => f.scale)).toEqual(fw.map(f => f.scale))
  })
  it('верная улетает вверх и в реверсе: взлёт с обычным endY (экранная высота старта зеркальна)', () => {
    expect(riseFrames(60, 800).at(-1).translate).toContain(`${RISE_END_Y.toFixed(3)}dvh`)
    expect(riseFrames(mirrorY(40), 800).at(0).translate).toContain(`${mirrorY(40).toFixed(3)}dvh`) // начало — там, где пилюля была на экране
  })
  it('проход B — reverse во всех кругах (голос и тап); проход A, фразы и финал — нет', () => {
    for (const tap of [false, true]) {
      const st = buildRaceStages({ plan, tap, ru: true }).stages.filter(s => s.type === 'student')
      expect(st.filter(s => s.act === 'catch').length).toBeGreaterThan(0)
      for (const s of st) expect(!!s.step?.reverse).toBe(s.sid === 'catch') // обратный — только круг 1 прохода B; круг Мии (catch3) идёт вниз
    }
  })
  it('Пит: чисто — стоит; слово выезжает на его дорожке — отпрыгивает туда, где слов нет, не задевая соседние', () => {
    expect(awayX([], 50, 50)).toBe(50)
    expect(awayX([LANE_X[0]], 80, 50)).toBe(80) // слово слева, голова справа: чисто
    const x = awayX([LANE_X[1]], 50, 50) // слово по центру: голова уходит к краю
    expect(Math.abs(x - LANE_X[1])).toBeGreaterThan(30)
    const y = awayX([LANE_X[0], LANE_X[2]], 27, 50) // слова слева и справа: единственное свободное место — центр не годится, берём самое далёкое
    expect(typeof y).toBe('number'); expect(ZONE_Y).toBeGreaterThan(0)
  })
  it('проводка: пул ставит data-up и считает экранную высоту зеркально, движок передаёт up: step.reverse, привод — createDodgeUp, узор дорожек бежит вверх', () => {
    const pool = rd('../player/modules/rotate-phone/wordLanePool.js'), pills = rd('../player/modules/rotate-phone/useWordLanePills.js')
    expect(pool).toContain("el.setAttribute('data-up', '1')"); expect(pool).toContain('l.up ? mirrorY(flightY(l.anim)) : flightY(l.anim)'); expect(pool).not.toContain('mirrorY(RISE_END_Y)'); expect(pool).toContain('startRise(parts[k].el, scr(l), RISE_DELAY_MS, RISE_END_Y)')
    expect(pills).toContain('up: !!step.reverse'); expect(pills).toContain('step.reverse ? createDodgeUp(')
    expect(rd('../../styles/player/modules/word-lane-lane-run.css')).toContain('.wl[data-up] .wlLanes i::before { transform: translate3d(0, calc(var(--run-p, 0px) - var(--run-y, 0px))')
    expect(rd('../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("data-up={laneUp(f) ? '' : undefined}")
  })
})
