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
  it('взгляд Пита в коробке: почти неподвижен, редко и плавно чуть сдвигается; зрачки дышат (расширяются / сужаются)', async () => {
    const { eyeLife } = await import('../mia/miaMotion.js')
    const looks = [], pupils = []; for (let t = 0; t < 60; t += 0.05) { const l = eyeLife(t); looks.push(l.look); pupils.push(l.pupil) }
    expect(Math.max(...looks)).toBeLessThan(3.5); expect(Math.min(...looks)).toBeGreaterThan(-3.5) // сдвиги небольшие
    const step = Math.max(...looks.slice(1).map((x, k) => Math.abs(x - looks[k])))
    expect(step).toBeLessThan(0.45) // плавно: никаких скачков (за 0,05 с взгляд сдвигается меньше половины единицы)
    const calm = looks.slice(1).filter((x, k) => Math.abs(x - looks[k]) < 0.03).length
    expect(calm).toBeGreaterThan(looks.length * 0.6) // большую часть времени взгляд стоит (лишь лёгкое дыхание)
    expect(Math.min(...pupils)).toBeLessThan(0.88); expect(Math.max(...pupils)).toBeGreaterThan(1.12); expect(Math.min(...pupils)).toBeGreaterThan(0.7)
  })
})

describe('эпилог финала кончается, когда договорили', () => {
  it('bossEnd: красные = слова без верно названных не в красной зоне; пять и больше — Пит остаётся', async () => {
    const { bossEnd } = await import('../mia/raceMia.js')
    expect(bossEnd({ total: 8, won: { 0: 1, 1: 1, 2: 1 }, redWins: 0, reds: 0 })).toEqual({ won: 3, reds: 5, keep: true })
    expect(bossEnd({ total: 8, won: { 0: 1, 1: 1, 2: 1, 3: 1 }, redWins: 0, reds: 0 })).toMatchObject({ reds: 4, keep: false })
    expect(bossEnd({ total: 8, won: { 0: 1, 1: 1, 2: 1, 3: 1 }, redWins: 2, reds: 0 })).toMatchObject({ reds: 6, keep: true }) // два верных были в красной зоне
  })
  it('директор: эпилог держится по длине реплик Мии и Пита (не фиксированные 11 с), с потолком st.ms', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain("if (st?.mia !== 'end') return rh.holdMs(st)"); expect(src).toContain('Math.min(st.ms, Math.max(2500,')
  })
})

describe('финал: колкость после ошибки, порог «больше половины», линия у конвейера', () => {
  it('ошибка / «не успел»: Мия коротко подкалывает один раз на слово, с задержкой (Пит успевает сказать верное слово)', async () => {
    const { reduceMia, miaInit, BOSS } = await import('../mia/raceMia.js')
    const stage = { mia: 'round', silent: true, act: 'boss', words: [1, 2, 3, 4, 5, 6].map(i => ({ text: 'w' + i })) }
    let m = reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage }).mia
    const a = reduceMia(m, { t: 'miss', stage, idx: 0 })
    expect(a.say).toHaveLength(1); expect(a.say[0]).toMatchObject({ who: 'mia', delay: BOSS.MISS_AT }); expect(a.say[0].id).toMatch(/^mia_miss/)
    expect(reduceMia(a.mia, { t: 'fail', stage, idx: 0 }).say).toEqual([]) // то же слово: вторая колкость не нужна
    expect(reduceMia(a.mia, { t: 'fail', stage, idx: 1 }).say).toHaveLength(1)
  })
  it('Пит остаётся, когда красных БОЛЬШЕ ПОЛОВИНЫ слов (3–6 слов): 2 из 3, 3 из 4–5, 4 из 6; порог «пять» отменён', async () => {
    const { keepNeed, bossEnd } = await import('../mia/raceMia.js')
    expect([3, 4, 5, 6].map(keepNeed)).toEqual([2, 3, 3, 4]); expect(keepNeed(0)).toBe(5)
    expect(bossEnd({ total: 6, won: { 0: 1, 1: 1 }, redWins: 0, reds: 0 })).toEqual({ won: 2, reds: 4, keep: true }) // назвал 2 из 6 — раньше (нужно было 5) Мия отпускала
    expect(bossEnd({ total: 6, won: { 0: 1, 1: 1, 2: 1 }, redWins: 0, reds: 0 })).toMatchObject({ reds: 3, keep: false })
  })
  it('Пит говорит верное слово и после ошибки (miss), один раз на слово; линия шкалы упирается в левую полосу конвейера; колонки без жёлтой заливки', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).toContain("(kind === 'fail' || kind === 'miss') && running.act === 'boss'"); expect(src).toContain('toldRef.current !== idx')
    expect(readFileSync(new URL('./RaceBossScale.jsx', import.meta.url), 'utf8')).toContain("setProperty('--bl'")
    expect(readFileSync(new URL('../../../styles/player/modules/race-boss.css', import.meta.url), 'utf8')).toMatch(/\.wlBossLine \{[^}]*left: var\(--bl, 0px\)/)
  })
})
