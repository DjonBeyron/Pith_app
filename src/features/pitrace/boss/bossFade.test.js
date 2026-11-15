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
  it('цвет Мии: круг с Мией (fast) или церемония финала с момента падения коробки; без Мии и до падения — обычный', () => {
    const m = { phase: 'in', fast: false }
    expect(miaColorOn(m, { sid: 'boss-ann' }, true)).toBe(true)
    expect(miaColorOn(m, { sid: 'boss-ann' }, false)).toBe(false) // коробка ещё летит — цвета обычные
    expect(miaColorOn(m, { sid: 'a3-ann' }, true)).toBe(false) // обычная церемония Мии: цвет — с круга
    expect(miaColorOn({ phase: 'in', fast: true }, { sid: 'boss' }, false)).toBe(true)
    expect(miaColorOn({ phase: 'off', fast: true }, { sid: 'boss' }, true)).toBe(false)
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
    expect(css).toMatch(/\.wlBossZone \{[^}]*z-index: 1/); expect(css).toMatch(/\.wlBossTick \{[^}]*z-index: 1/); expect(css).toMatch(/\.wlBossLine \{[^}]*right: 6px[^}]*z-index: 2/) // ровно от ствола (его кромка 4–6 px), без зазора и без наложения на него
  })
})

describe('финал: XP не за красную зону, «не успел» молча, взгляд Пита', () => {
  const read2 = p => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('XP: красная зона не награждается, остальные — да; шкала пишет зону, игра читает при принятом слове', async () => {
    const { xpAllowed, setBossZoneNow, getBossZoneNow } = await import('./bossZoneNow.js')
    expect(xpAllowed('slow')).toBe(false); expect(xpAllowed('mid')).toBe(true); expect(xpAllowed('fast')).toBe(true); expect(xpAllowed(null)).toBe(true)
    setBossZoneNow('slow'); expect(getBossZoneNow()).toBe('slow'); setBossZoneNow(null)
    const flow = read2('../../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain('if (rep.last && !(stages[sRef.current.idx]?.silent && !xpAllowed(getBossZoneNow()))) xpApi.current?.add(')
    expect(read2('./RaceBossScale.jsx')).toContain('setBossZoneNow(zoneAt(')
  })
  it('«не успел» в финале (silent): ни реплики, ни текста сверху, ни подсказки слова над дорожками', () => {
    const flow = read2('../../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain('failMute(st) ? false : sayLine('); expect(flow).toContain('if (!said && !failMute(st)) flash('); expect(flow).toContain('!st.step.labels.length && !st.silent')
  })
  it('взгляд Пита в коробке: ходит из стороны в сторону и осматривается; в пределах щели; почти не стоит', async () => {
    const { eyeLife } = await import('../mia/miaMotion.js')
    const looks = []; for (let t = 0; t < 60; t += 0.05) looks.push(eyeLife(t).look)
    expect(Math.max(...looks)).toBeLessThan(6); expect(Math.min(...looks)).toBeGreaterThan(-6)
    expect(Math.max(...looks)).toBeGreaterThan(3.5); expect(Math.min(...looks)).toBeLessThan(-3.5) // в обе стороны
    const jumps = looks.slice(1).filter((x, k) => Math.abs(x - looks[k]) > 0.4).length // быстрые перескоки взгляда
    expect(jumps).toBeGreaterThan(30) // за минуту — десятки перескоков: на месте не стоит
  })
})
