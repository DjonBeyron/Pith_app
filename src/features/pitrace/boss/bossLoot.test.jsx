import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceBossLoot from './RaceBossLoot.jsx'
import RaceSummary from '../RaceSummary.jsx'
import { lootFlight, LOOT_EDGE_PX, LOOT_FLY_MS } from './bossLoot.js'
import { marksStep, MARKS_MAX } from './bossScale.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

// Экзамен: игрок видит, сколько трофеев собрал и сколько у Мии; потерянное улетает к ней; итог называет исход. И правило треугольников шкалы — прежнее.
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const m = { phase: 'in', act: 'boss', total: 6, won: { 0: true, 1: true }, zones: { 1: 'mid' }, dug: { 2: true } }
const html = (mia, on = true) => renderToStaticMarkup(createElement(RaceBossLoot, { m: mia, on }))

describe('счётчик трофеев экзамена', () => {
  it('показывает «Твои N» и «у Мии M» по счёту машины; виден только в экзамене, пока Мия на коробке', () => {
    const h = html(m)
    expect(h).toContain('data-on="true"'); expect(h).toMatch(/data-testid="race-loot-me">30</); expect(h).toMatch(/data-testid="race-loot-mia">30</) // 20 + 10 собрано; 10 (жёлтая) + 20 (не названо) у Мии
    expect(html(m, false)).not.toContain('data-on'); expect(html({ ...m, phase: 'out' })).not.toContain('data-on'); expect(html({ ...m, act: 'catch' })).not.toContain('data-on')
  })
  it('стоит внизу слева на коробке, с отступом safe-area; шкалу справа не закрывает; в покое — ни одной анимации', () => {
    const css = read('../../../styles/player/modules/race-boss-loot.css')
    expect(css).toMatch(/\.wlLootChip \{[^}]*left: calc\(env\(safe-area-inset-left, 0px\) \+ 10px\)[^}]*bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 10px\)/); expect(css).toMatch(/max-width: calc\(100% - 64px\)/)
    expect(css).not.toMatch(/animation|infinite|@keyframes|will-change/); expect(css).toMatch(/\.wlStage > \.wlLoot \{[^}]*pointer-events: none/)
    expect(read('../../../styles/player/modules/race-sprint.css')).toContain("@import './race-boss-loot.css'")
    expect(read('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("<RaceBossLoot m={f.rh.mia.mia} on={f.stage === 'run' && ['boss', 'boss-sw', 'boss2', 'boss-end'].includes(f.stageObj?.sid)} />")
  })
  it('полёт потерянных трофеев: от шкалы (с высоты линии слова) к числу «у Мии»; анимации разовые; слабое устройство — без частиц', () => {
    expect(lootFlight({ w: 375, h: 812, lineY: 400, tx: 150, ty: 790 })).toEqual({ from: [375 - LOOT_EDGE_PX, 400], tx: 150, ty: 790 })
    expect(lootFlight({ w: 375, h: 812, lineY: null, tx: 1, ty: 2 }).from[1]).toBe(406); expect(lootFlight({ w: 375, h: 812, lineY: 9999, tx: 1, ty: 2 }).from[1]).toBe(812 - 24)
    const src = read('./RaceBossLoot.jsx')
    expect(src).toContain('isWeakDevice()'); expect(src).toContain('fly.current.slice(0, lite ? 1 : 3)'); expect(src).not.toMatch(/iterations|Infinity|setInterval|requestAnimationFrame/); expect(LOOT_FLY_MS).toBeLessThanOrEqual(800)
    expect(src).toContain('if (!show || was == null || lost <= was) return') // первый показ и сброс счёта — без полёта
  })
})

describe('итог гонки называет исход экзамена', () => {
  const plan = normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'stages' })
  const base = { sprint: { hit: 2, total: 3 }, catchOk: 1, catchTotal: 2, medal: 'none', descent: null, xp: 1, capped: false, gold: false, metrics: null, weak: [] }
  const sum = exam => renderToStaticMarkup(createElement(RaceSummary, { plan, result: { ...base, ...(exam ? { exam } : {}) }, onDone() {} }))
  it('три исхода: сколько собрано из максимума, сколько забрала Мия, что с Питом', () => {
    const free = sum({ got: 100, max: 120, lost: 20, outcome: 'free' }), mid = sum({ got: 53, max: 120, lost: 67, outcome: 'mid' }), stay = sum({ got: 13, max: 120, lost: 107, outcome: 'stay' })
    expect(free).toMatch(/race-summary-exam">100 из 120</); expect(free).toMatch(/race-summary-exam-mia">20</); expect(free).toMatch(/data-outcome="free">свободен</)
    expect(mid).toMatch(/race-summary-exam">53 из 120</); expect(mid).toMatch(/race-summary-exam-mia">67</); expect(mid).toMatch(/data-outcome="mid">свободен</)
    expect(stay).toMatch(/race-summary-exam-mia">107</); expect(stay).toMatch(/data-outcome="stay">остался в коробке</)
  })
  it('экзамена не было — строк нет; сохраняемый XP считается как раньше (начисления не менялись)', () => {
    expect(sum(null)).not.toContain('race-summary-exam'); expect(sum(null)).toMatch(/race-summary-xp">\+1</)
    expect(read('../useRaceActs.js')).toContain("setResult(mb.m.act === 'boss' && mb.m.total ? { ...res, exam: { ...examOf(mb.m, true), stay: miaStays(mb) } } : res)")
  })
})

describe('треугольники шкалы — правило владельца не менялось', () => {
  it('треугольник идёт за линией своего слова и замирает там, где линия была в момент подтверждения ответа; живут два — предыдущий и текущий; без ответа исчезает внизу', () => {
    let s = marksStep([], { id: 1, y: 0.2, now: 0 }); s = marksStep(s, { id: 1, y: 0.37, now: 100 })
    expect(s).toMatchObject([{ id: 1, y: 0.37, dying: 0 }])
    s = marksStep(s, { id: 1, y: 0.37, now: 2000 }); expect(s[0].y).toBe(0.37) // слово принято: линия стоит — треугольник стоит
    s = marksStep(s, { id: 2, y: 0.1, now: 3000 }); expect(s.filter(x => !x.dying).map(x => x.id)).toEqual([1, 2]); expect(s.find(x => x.id === 1).y).toBe(0.37) // новое слово прежний треугольник не двигает
    s = marksStep(s, { id: 3, y: 0.1, now: 6000 }); expect(s.filter(x => !x.dying).map(x => x.id)).toEqual([2, 3]); expect(MARKS_MAX).toBe(2)
    s = marksStep(s, { id: 3, y: 1, now: 9000, drop: true }); expect(s.find(x => x.id === 3).dying).toBe(9000) // ответа нет — гаснет у низа
  })
  it('на экране треугольник стоит ровно на линии: место пишется свойством translate (transform умножался на scale 1,2 у зафиксированного маркера — треугольник вставал на 20 % ниже)', () => {
    const src = read('./RaceBossScale.jsx'), css = read('../../../styles/player/modules/race-boss.css')
    expect(src).toContain('if (m) e.style.translate = `0 ${(m.y * H).toFixed(1)}px`'); expect(src).not.toContain('if (m) e.style.transform = `translate3d(0, ${(m.y * H)')
    expect(css).toMatch(/\.wlBossMark\[data-set\] \{ scale: 1\.2/)
    expect(src).toContain("clock.current.onZone?.(zoneAt(Math.min(1, Math.max(0, tr.y / H))))") // зона для трофеев берётся в тот же момент и с той же высоты, что треугольник
  })
})
