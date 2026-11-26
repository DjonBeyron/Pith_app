// Линия шкалы экзамена едет часами полёта пилюли (bossFollow.js); цвета: жидкость — цвет Пита у всех пилюль, зона экзамена — рамка (владелец 2026-11-26, слабый Android).
import { describe, it, expect } from 'vitest'
import { followFrames, mirror, createFollower } from './bossFollow.js'
import { ENTER_Y, EXIT_Y } from '../../player/modules/rotate-phone/wordLaneTimeline.js'
import { FLIGHT_MS, ANIM_MS } from '../../player/modules/rotate-phone/wordLaneMotion.js'

describe('линия шкалы едет часами полёта пилюли', () => {
  it('путь ведомого — путь пилюли, обрезанный у низа шкалы', () => {
    const f = followFrames(-40, 600, 800) // низ пилюли = центр × 8 px − 40; низ шкалы (600 px) — при центре 80 % высоты
    expect(f.map(x => x.translate)).toEqual([`0 ${ENTER_Y.toFixed(3)}dvh`, '0 80.000dvh', '0 80.000dvh'])
    expect(f[1].offset).toBeCloseTo(((80 - ENTER_Y) / (EXIT_Y - ENTER_Y)) * (FLIGHT_MS / ANIM_MS), 9)
  })
  it('часы — копия часов полёта: старт и скорость; полёт стоит — ведомый стоит там же', () => {
    const a = { playbackRate: 1, startTime: 5, playState: 'running', currentTime: 0, pause() { this.playState = 'paused' } }
    mirror(a, { playbackRate: 0.5, startTime: 120, playState: 'running', currentTime: 900 }); expect(a).toMatchObject({ playbackRate: 0.5, startTime: 120, playState: 'running' })
    mirror(a, { playbackRate: 0.5, startTime: null, playState: 'paused', currentTime: 1234 }); expect(a).toMatchObject({ playState: 'paused', currentTime: 1234 })
  })
  it('ведомый: анимация translate на узле, сдвиг — transform; низ пилюли по часам полёта — без чтения вёрстки; снят — следов нет', () => {
    const src = { playbackRate: 0.5, startTime: 100, playState: 'running', currentTime: FLIGHT_MS / 2 }, made = []
    const el = { style: {}, animate(fr, o) { const an = { fr, o, playbackRate: 1, startTime: null, playState: 'running', cancel() { this.gone = true } }; made.push(an); return an } }
    const fo = createFollower(); fo.start({}, src, 300, 600); fo.add(el); fo.add(el)
    expect(made).toHaveLength(1); expect(made[0].o).toMatchObject({ duration: ANIM_MS, easing: 'linear', fill: 'both' }); expect(made[0]).toMatchObject({ playbackRate: 0.5, startTime: 100 })
    expect(fo.y()).toBeCloseTo(300, 6); expect(el.style.transform).toMatch(/^translate3d\(0, -?[\d.]+px, 0\)$/)
    const k0 = el.style.transform; expect(fo.step(300.1)).toBe(true); expect(el.style.transform).toBe(k0) // сдвиг тот же — стиль не переписывается
    src.playState = 'idle'; expect(fo.step(300)).toBe(false)
    fo.release(); expect(made[0].gone).toBe(true); expect(el.style.transform).toBe(''); expect(fo.on()).toBe(false)
  })
})
