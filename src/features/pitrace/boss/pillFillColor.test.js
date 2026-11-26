// Цвета пилюль (владелец 2026-11-26): жидкость — цвет тела Пита у ВСЕХ пилюль игры; зона экзамена — рамка пилюли, и она сильнее «золота серии».
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const raw = f => readFileSync(new URL('../../../styles/player/modules/' + f, import.meta.url), 'utf8')
const css = f => raw(f).split('/*').map((part, i) => (i ? part.slice(part.indexOf('*/') + 2) : part)).join('') // без комментариев
const rule = (src, sel) => { const at = src.indexOf(sel + ' {'); return at < 0 ? null : src.slice(at, src.indexOf('}', at)) }

describe('жидкость пилюль — цвет Пита', () => {
  it('значение — базовый тон шерсти Пита из его арта (kit.json: первый контур тела, головы и хвоста)', () => {
    const kit = JSON.parse(readFileSync(new URL('../../scene/v2/sprites/mascot/kit.json', import.meta.url), 'utf8'))
    for (const part of ['body', 'head', 'tail']) expect(kit[part].slice(0, kit[part].indexOf('/>')).toLowerCase()).toContain('fill="#bc82fa"')
    const pill = rule(css('word-lane-pill.css'), '.wlPill')
    expect(pill).toContain('--wl-fill: #bc82fa;'); expect(pill).toContain('--wl-fill-rgb: 188, 130, 250;')
  })
  it('жидкость, линия уровня, свет и вылетевшие пузыри читают --wl-fill, а не цвет дорожки, зоны или серии (--c, --rgb)', () => {
    const pill = css('word-lane-pill.css'), wide = css('word-lane-wide-fill.css'), bub = css('word-lane-bubbles.css')
    const list = [[pill, '.wlPillFill'], [pill, '.wlPillSparks b::before'], [pill, '.wlPillSparks b::after'], [wide, '.wlPill[data-wide]:not([data-fail]) .wlPillFill'], [wide, '.wlPill[data-wide] .wlPillSparks i::before'], [wide, '.wlPill[data-wide] .wlPillSparks i::after'], [bub, '.wlBubs[data-out] .wlBub']]
    for (const [src, sel] of list) {
      const body = rule(src, sel); expect(body, sel).not.toBeNull()
      expect(body, sel).toContain('--wl-fill'); expect(body, sel).not.toContain('var(--c)'); expect(body, sel).not.toContain('var(--rgb)')
    }
    expect(pill).toContain('.wlField .wlPill[data-full]:not([data-fail]) { background-image: none; background-color: var(--wl-fill); }')
    expect(pill).toContain('.wlField .wlPill[data-full]:not([data-fail]) .wlPillClip { background-color: var(--wl-fill); }')
  })
  it('жидкость никто не перекрашивает: ни зона экзамена, ни серия, ни янтарный взлёт «не по всем словам»; красная кромка «неверное слово» остаётся красной', () => {
    for (const f of ['race-boss.css', 'race-sprint.css', 'race-phrase-rounds.css', 'word-lane-pill-safe.css', 'word-lane-pill-wrong.css', 'race-reverse.css']) expect(css(f).includes('--wl-fill:'), f).toBe(false)
    const wide = css('word-lane-wide-fill.css')
    expect(wide).toContain('--wl-fill-rgb: 255, 72, 62;'); expect(rule(wide, '.wlPill[data-wide] .wlPillFill::after')).toContain('background: rgb(255, 72, 62)')
    expect(raw('word-lane-pill.css')).toContain('.wlPill[data-fail] .wlPillFill { background: #7b8494; }') // «не успел» — серая
  })
})

describe('экзамен: зона — рамка пилюли', () => {
  it('правило зоны сильнее «золота серии»: серия доживала до экзамена и перекрывала цвет зоны — принятая в красной улетала жёлтой', () => {
    const boss = css('race-boss.css'), sprint = css('race-sprint.css')
    expect(boss).toContain('.wlField .wlPill[data-wide][data-bz] { --rgb: var(--bz); --c: rgb(var(--bz)); }') // 4 класса и атрибута…
    expect(sprint).toContain(".wl[data-streak='gold'] .wlPill, .wl[data-streak='fire'] .wlPill { --c: #ffd257; --rgb: 255, 210, 87; }") // …против 3 у серии
  })
  it('слово принято (data-bzf): рамка зоны толще и светится; слабое устройство — кольцо без размытия; анимаций нет', () => {
    const boss = css('race-boss.css')
    expect(boss).toContain('.wlField .wlPill[data-wide][data-bzf]:not([data-fail]) { box-shadow: 0 0 0 2px rgb(var(--bz)), 0 0 18px 3px rgba(var(--bz), 0.65); }')
    expect(boss).toContain('.wlField.wl--lite .wlPill[data-wide][data-bzf]:not([data-fail]) { box-shadow: 0 0 0 2px rgb(var(--bz)); }')
    expect(boss).toContain('.weak-device .wlField .wlPill[data-wide][data-bzf]:not([data-fail])')
  })
})
