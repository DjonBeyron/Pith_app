import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceClimb from './RaceClimb.jsx'
import RaceActs from './RaceActs.jsx'
import { initClimb, apply, enter, timeOut } from './raceLadder.js'
import { climbWords } from './raceWords.js'
import { climbTitle } from './raceSim.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const words = climbWords(plan)
const html = (el, props) => renderToStaticMarkup(createElement(el, props))
const esc = t => t.replace(/'/g, '&#x27;') // апостроф в разметке сервера экранируется
const climbAt = events => events.reduce((c, e) => apply(enter(c, 1000), e).climb, initClimb(words.length))

describe('острова «Вершины» (RaceClimb)', () => {
  it('N островов + земля, на каждом номер, подписи скрыты; сверху «вершина»; герой на земле; общий таймер сверху, на островах таймеров нет', () => {
    const h = html(RaceClimb, { climb: initClimb(4), words, phrase: plan.chunks.join(' ') })
    for (let k = 0; k <= 4; k++) expect(h).toContain(`data-testid="race-step-${k}"`)
    expect(h).not.toContain('data-testid="race-step-5"')
    expect(h).toContain('data-testid="race-summit"')
    for (const w of words) expect(h).not.toContain(`>${w}</span>`) // слов на островах нет — виден только номер
    expect(h).toContain('data-testid="race-timer"'); expect(h).not.toContain('data-testid="race-bar"'); expect((h.match(/race-timer"/g) ?? [])).toHaveLength(1)
    expect(h).toContain('--cam:0'); expect(h).toContain('data-testid="race-climber"')
  })
  it('зигзаг: острова 1…4 на дорожках 0, 1, 2, 0 (цвет — цвет дорожки), земля посередине; расстояние и камера — переменные', () => {
    const h = html(RaceClimb, { climb: initClimb(4), words, phrase: 'x' })
    const lane = k => h.match(new RegExp(`data-lane="(\\d)"[^>]*data-testid="race-step-${k}"`))?.[1]
    expect([1, 2, 3, 4].map(lane)).toEqual(['0', '1', '2', '0']); expect(lane(0)).toBe('1')
    expect(h).toContain('--gap:45'); expect(h).toContain('--hb:38')
  })
  it('попал: подпись взятого острова проявляется, герой на его дорожке, мир съезжает вниз на ступень (--cam = rung · 45)', () => {
    const c = climbAt(['win', 'win'])
    const h = html(RaceClimb, { climb: c, words, phrase: 'x' })
    expect(h).toContain(`data-testid="race-word-1">${esc(words[0])}</span>`); expect(h).toContain(`data-testid="race-word-2">${words[1]}</span>`)
    expect(h).toContain('data-testid="race-word-3"></span>'); expect(h).toContain('data-last="hit"')
    expect(h).toContain('--cam:90'); expect(html(RaceClimb, { climb: climbAt(['win', 'win', 'win', 'win']), words, phrase: 'x' })).toContain('--cam:180')
    expect(h).toMatch(/class="raceHero" data-lane="1" style="left:50.00%"/) // 2-я ступень — средняя дорожка
    expect(h).toMatch(/data-here="1" data-testid="race-step-2"/); expect(h).toMatch(/data-target="1" data-testid="race-step-3"/) // герой на втором, цель — третий
  })
  it('соскользнул: подпись оставленного острова гаснет; промах на третьем заходе — подпись мигает; вершина — золото и плашка', () => {
    const slip = html(RaceClimb, { climb: climbAt(['win', 'win', 'fail']), words, phrase: 'x' })
    expect(slip).toContain('data-last="slip"'); expect(slip).toContain('data-testid="race-word-2"></span>'); expect(slip).toContain(`data-testid="race-word-1">${esc(words[0])}</span>`)
    const blink = html(RaceClimb, { climb: climbAt(['win', 'fail', 'fail', 'fail']), words, phrase: 'x' })
    expect(blink).toContain('data-testid="race-blink"')
    const top = html(RaceClimb, { climb: climbAt(['win', 'win', 'win', 'win']), words, phrase: "I'm trying to learn", final: true })
    expect(top).toContain('data-top="true"'); expect(top).toContain('rhNote wlTurn rhNote--gold'); expect(top).toContain('data-testid="race-top-plate"')
  })
  it('время вышло: подъём застыл на текущем острове, надпись «Время вышло», таймер на нуле; в итоге «без медали, N из M ступеней»', () => {
    const c = timeOut(climbAt(['win', 'win']))
    const h = html(RaceClimb, { climb: c, words, phrase: 'x', timeUp: true })
    expect(h).toContain('data-testid="race-time-up"'); expect(h).toContain('Время вышло'); expect(h).toContain('data-time-up="true"')
    expect(h).toMatch(/data-testid="race-timer-sec">0</); expect(h).toContain('--cam:90')
    expect(climbTitle({ medal: 'none', climbRung: 2, climbTotal: 4 })).toBe('без медали, 2 из 4 ступеней')
    expect(climbTitle({ medal: 'gold', climbRung: 4, climbTotal: 4 })).toBe('золото'); expect(climbTitle({ medal: 'none', climbRung: 0, climbTotal: 0 })).toBe('—')
  })
  it('таймер: полоска и секунды от общего запаса; «+5» всплывает после взятой ступени', () => {
    const fresh = html(RaceClimb, { climb: climbAt([]), words, phrase: 'x' })
    expect(fresh).toContain('data-testid="race-timer-sec">12<'); expect(fresh).not.toContain('race-timer-bonus')
    const won = html(RaceClimb, { climb: climbAt(['win']), words, phrase: 'x' })
    expect(won).toContain('data-testid="race-timer-bonus">+5<')
  })
  it('RaceActs: стадия «время вышло» рисует острова с надписью', () => {
    const f = { stage: 'run', stageObj: { type: 'announce', act: 'climb', sid: 'climb-time' }, rh: { on: true, quiet: false, race: { climb: timeOut(climbAt(['win'])) } }, finish() {} }
    expect(html(RaceActs, { f, cfg: { plan } })).toContain('race-time-up')
  })
  it('стили: пилюли и дорожки движка скрыты в раунде, переходы мира и героя только transform, анимации выключены на слабом устройстве и reduced-motion, без filter и Math.random', () => {
    const css = read('../../styles/player/modules/race-climb.css'), timer = read('../../styles/player/modules/race-climb-timer.css')
    expect(css).toContain(".wl[data-act='climb'] .wlField [data-pill]"); expect(css).toContain('visibility: hidden')
    expect(css).toContain('transition: transform 0.6s'); expect(css).toContain('translateY(calc(var(--cam) * 1dvh))')
    for (const c of [css, timer]) { expect(c).toContain('.weak-device .race'); expect(c).toContain('prefers-reduced-motion: reduce'); expect(c).not.toMatch(/filter\s*:/) }
    const idx = read('../../index.css')
    for (const f of ['race-climb', 'race-climb-timer', 'race-sprint']) expect(idx).toContain(`@import './styles/player/modules/${f}.css';`)
    for (const f of ['RaceClimb.jsx', 'RaceHero.jsx', 'RaceClimbBar.jsx', 'raceClimbCam.js']) expect(read(`./${f}`)).not.toContain('Math.random')
    expect(read('./RaceHero.jsx')).toContain('heroFrames'); expect(read('./RaceHero.jsx')).toContain('.animate(')
  })
})
