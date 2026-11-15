import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nextPill, fadeProgress, REVEAL_AT, REVEAL_LINES, DEMO_START } from './bossScale.js'
import { miaColorOn } from '../mia/miaTint.js'
import { miaLine } from '../mia/miaLines.js'
import { miaStays, makeMiaBox } from '../mia/raceMia.js'

describe('выцветание маркера слова (фиолетовый → серый)', () => {
  it('прогресс: от top следующей пилюли в момент конца слова до top ≥ 0 (видна целиком)', () => {
    expect(fadeProgress(-200, -200)).toBe(0); expect(fadeProgress(-200, -100)).toBe(0.5); expect(fadeProgress(-200, 0)).toBe(1); expect(fadeProgress(-200, 30)).toBe(1)
    expect(fadeProgress(10, 10)).toBe(1) // следующая уже видна целиком — маркер сразу серый
    expect(fadeProgress(-200, -400)).toBe(0) // пилюля отъехала назад — не уходит в минус
  })
  it('следующая пилюля: не принятая, не «не успел», не ушедшая вниз; из таких — ближайшая к шкале', () => {
    const pills = [{ top: -300 }, { top: -120 }, { top: 40, locked: true }, { top: 20, failed: true }, { top: 900 }]
    expect(nextPill(pills, 600)).toEqual({ top: -120 }); expect(nextPill([], 600)).toBeNull(); expect(nextPill([{ top: 10, locked: true }], 600)).toBeNull()
  })
})

describe('церемония: цвет дорожек и шкала', () => {
  it('цвет Мии: круг с Мией (fast) или церемония финала с первых слов Мии; без Мии и до её слов — обычный', () => {
    const m = { phase: 'in', fast: false }
    expect(miaColorOn(m, { sid: 'boss-ann' }, { id: 'boss_mia_hush' })).toBe(true)
    expect(miaColorOn(m, { sid: 'boss-ann' }, null)).toBe(false) // коробка падает, Пит мечется — цвета ещё обычные
    expect(miaColorOn(m, { sid: 'a3-ann' }, { id: 'mia_push' })).toBe(false) // обычная церемония Мии: цвет — с круга
    expect(miaColorOn({ phase: 'in', fast: true }, { sid: 'boss' }, null)).toBe(true)
    expect(miaColorOn({ phase: 'off', fast: true }, { sid: 'boss' }, null)).toBe(false)
  })
  it('шкала мигает не с начала «видите шкалу справа», а на этих словах', () => {
    expect(REVEAL_AT).toBeGreaterThan(0.3); expect(REVEAL_AT).toBeLessThan(0.6); expect(REVEAL_LINES[0]).toBe(DEMO_START)
  })
  it('реплика «Тише, пушистик»; Пит остаётся в коробке — признак для итога', () => {
    expect(miaLine('boss_mia_hush').text).toBe('Тише, пушистик')
    const mb = makeMiaBox(); expect(miaStays(mb)).toBe(false)
    mb.m = { ...mb.m, keep: true, act: 'boss' }; expect(miaStays(mb)).toBe(true)
  })
})

describe('проводка: панель настроек ставит игру на паузу, попап не прячет клавиатуру', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('⚙ открыта — f.pause, закрыта — pause.resume (кроме «Игра заново»); окно паузы скрыто; Hud сообщает об открытии', () => {
    const game = read('../../player/modules/rotate-phone/WordLaneGame.jsx'), hud = read('../../player/modules/rotate-phone/WordLaneHud.jsx')
    expect(game).toContain("if (open) { if (!f.paused) f.pause('hud') } else if (why !== 'game' && f.paused) pause.resume()")
    expect(game).toContain('!comment && !hudOpen && <WordLanePause')
    expect(hud).toContain('onOpenChange?.(v, why)'); expect(hud).toContain("setOpen(false, 'game')")
  })
  it('попап: тап по галочкам и кнопкам не уводит фокус с поля (preventDefault на mousedown)', () => {
    const src = read('../../../shared/ui/SendLogPopup.jsx')
    expect(src).toContain('e.preventDefault()'); expect((src.match(/onMouseDown=\{keepFocus\}/g) ?? []).length).toBe(4)
  })
  it('линия шкалы под линейкой: зоны и риски выше линии по слою', () => {
    const css = read('../../../styles/player/modules/race-boss.css')
    expect(css).toMatch(/\.wlBossZone \{[^}]*z-index: 1/); expect(css).toMatch(/\.wlBossTick \{[^}]*z-index: 1/); expect(css).toMatch(/\.wlBossLine \{[^}]*z-index: 0/)
  })
})
