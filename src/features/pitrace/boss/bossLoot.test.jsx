import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceBossLoot from './RaceBossLoot.jsx'
import RaceSummary from '../RaceSummary.jsx'
import { lootFlight, LOOT_OUT_PX, LOOT_FLY_MS, LOOT_BUMP_MS, LOOT_TOTAL_MS } from './bossLoot.js'
import { marksStep, MARKS_MAX } from './bossScale.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

// Экзамен: игрок видит свой счётчик и счётчик Мии под ним; потерянное переходит к ней; итог называет исход. И правило треугольников шкалы — прежнее.
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const m = { phase: 'in', act: 'boss', total: 6, won: { 0: true, 1: true }, zones: { 1: 'mid' }, dug: { 2: true } }
const html = (mia, on = true) => renderToStaticMarkup(createElement(RaceBossLoot, { m: mia, on }))

describe('счётчики экзамена: игрок сверху, Мия под ним — оба слева сверху (владелец 2026-11-25)', () => {
  it('счётчик Мии показывает, сколько трофеев она забрала; виден только в экзамене, пока Мия на коробке; прежнего «Твои N · у Мии M» на коробке нет', () => {
    const h = html(m)
    expect(h).toContain('data-on="true"'); expect(h).toMatch(/data-who="mia">Мия <b data-testid="race-loot-mia">30</) // 10 (жёлтая зона) + 20 (не названо) у Мии
    expect(h).not.toContain('race-loot-me'); expect(h).not.toContain('Твои')
    expect(html(m, false)).not.toContain('data-on'); expect(html({ ...m, phase: 'out' })).not.toContain('data-on'); expect(html({ ...m, act: 'catch' })).not.toContain('data-on')
  })
  it('стоит слева сверху под счётчиком игрока, через safe-area, жёлтый; внизу на коробке ничего; в покое — ни одной анимации', () => {
    const css = read('../../../styles/player/modules/race-boss-loot.css'), panel = read('../../../styles/player/modules/race-panel.css')
    expect(css).toMatch(/\.wlLootChip \{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 80px\)[^}]*left: calc\(env\(safe-area-inset-left, 0px\) \+ 14px\)/); expect(css).not.toMatch(/bottom:/)
    expect(panel).toMatch(/\.wl\[data-race\] \.wlXp \{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 54px\)[^}]*left: calc\(env\(safe-area-inset-left, 0px\) \+ 14px\)/) // игрок — выше, тот же левый край
    expect(css).toMatch(/\.wlLootChip \{[^}]*color: #ffd678/); expect(css).toMatch(/max-width: calc\(100% - 64px\)/)
    expect(css).not.toMatch(/animation|infinite|@keyframes|will-change/); expect(css).toMatch(/\.wlStage > \.wlLoot \{[^}]*pointer-events: none/)
    expect(read('../../../styles/player/modules/race-sprint.css')).toContain("@import './race-boss-loot.css'")
    expect(read('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("<RaceBossLoot m={f.rh.mia.mia} on={f.stage === 'run' && ['boss', 'boss-sw', 'boss2', 'boss-end'].includes(f.stageObj?.sid)} />")
  })
  it('счётчик игрока при Мии не желтеет: у него свой цвет, а не переменная дорожек, которую подменяет «Допрос» и экзамен', () => {
    const panel = read('../../../styles/player/modules/race-panel.css'), mia = read('../../../styles/player/modules/race-mia.css'), base = read('../../../styles/player/modules/word-lane.css')
    expect(mia).toMatch(/\.wl\[data-mia='in'\] \{[^}]*--lvl1: #ffb23e/); expect(base).toMatch(/--wl-accent: var\(--lvl1/) // причина: акцент игры = --lvl1, при Мии он жёлтый
    expect(panel).toMatch(/\.wl\[data-race\] \.wlXp \{[^}]*color: #b6fe3b;/); expect(panel.match(/\.wl\[data-race\] \.wlXp \{[^}]*\}/)[0]).not.toContain('var(--wl-accent)')
  })
  it('потеря: «+N» выплывает от счётчика игрока к числу Мии, число вздрагивает; всё ≤ 700 мс, разово; слабое устройство — без «+N»', () => {
    expect(lootFlight({ xp: { right: 70, cy: 64 }, tx: 52, ty: 90 })).toEqual({ from: [70 + LOOT_OUT_PX, 64], to: [52, 90] })
    expect(lootFlight({ xp: null, tx: 52, ty: 90 })).toEqual({ from: [52 + LOOT_OUT_PX * 2, 90], to: [52, 90] }) // счётчика игрока нет на экране — старт рядом со счётчиком Мии
    expect(LOOT_TOTAL_MS).toBe(LOOT_FLY_MS + LOOT_BUMP_MS); expect(LOOT_TOTAL_MS).toBeLessThanOrEqual(700)
    const src = read('./RaceBossLoot.jsx')
    expect(src).toContain('isWeakDevice()'); expect(src).toContain('if (lite || !el) return'); expect(src).toContain('{show && !lite && <i ref={fly} className="wlLootFly" />}')
    expect(src).toContain("delay: lite ? 0 : LOOT_FLY_MS"); expect(src).not.toMatch(/iterations|Infinity|setInterval|requestAnimationFrame|fill:/) // конечные анимации без fill: после них getAnimations() пуст
    expect(src).not.toContain('.wlBossLine') // прежнего полёта от шкалы к коробке нет
    expect(src).toContain('if (!show || was == null || lost <= was) return') // первый показ и сброс счёта — без анимации
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
