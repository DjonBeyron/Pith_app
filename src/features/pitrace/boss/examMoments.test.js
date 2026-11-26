import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// Мини-рантайм хуков (в проекте нет DOM-окружения для тестов): useState / useEffect с зависимостями и чисткой — хватает, чтобы прогнать хук показа шкалы по настоящей последовательности реплик
const rt = vi.hoisted(() => ({ cells: [], i: 0, queue: [], dirty: false }))
vi.mock('react', () => ({
  useState: init => { const k = rt.i++; if (!(k in rt.cells)) rt.cells[k] = { v: typeof init === 'function' ? init() : init }; const c = rt.cells[k]; return [c.v, v => { const n = typeof v === 'function' ? v(c.v) : v; if (n !== c.v) { c.v = n; rt.dirty = true } }] },
  useEffect: (fn, deps) => { const k = rt.i++, c = rt.cells[k] ??= {}; if (!c.deps || !deps || deps.some((d, j) => d !== c.deps[j])) rt.queue.push(() => { c.clean?.(); c.clean = fn() ?? null }); c.deps = deps },
}))
const { useBossReveal, revealDelay } = await import('./useBossReveal.js')
const { REVEAL_LINES, revealAtMs, REVEAL_AT } = await import('./bossScale.js')
const { wordAtMs, examPlateOn, PLATE_LINE, byeAtMs, BYE_WORD } = await import('./lineWordAt.js')
const { reduceMia, miaInit } = await import('../mia/raceMia.js')
const { BYE_LINE, PIT_AFTER_LEAVE_MS } = await import('./bossMia.js')
const { miaLine } = await import('../mia/miaLines.js')
const { createMiaSpeech, miaGap } = await import('../mia/miaSpeech.js')

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const CEREMONY = ['boss_mia_hush', 'boss_mia_look', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five', 'boss_mia_go']
afterEach(() => vi.useRealTimers())

/** Хук показа шкалы под рантаймом: render(talk, live) → видна ли шкала */
function scale() {
  rt.cells = []
  const render = (talk, live = true) => { let out; for (let n = 0; n < 9; n++) { rt.i = 0; rt.dirty = false; out = useBossReveal(talk, live); rt.queue.splice(0).forEach(f => f()); if (!rt.dirty) break } return out }
  return { render }
}

describe('1. плашка экзамена появляется на «Эй, вы за экраном, это экзамен…», не раньше', () => {
  it('плашки нет на реплике Пита из коробки, на «Сиди тихо…» из-за края и на прыжке Мии; есть — всю реплику boss_mia_look; дальше снова нет', () => {
    expect(PLATE_LINE).toBe('boss_mia_look'); expect(miaLine(PLATE_LINE).text).toMatch(/^Эй, вы за экраном, это экзамен/)
    expect(examPlateOn(null)).toBe(false) // Пит говорит из коробки / Мия ещё молчит
    expect(CEREMONY.map(id => examPlateOn({ id }))).toEqual([false, true, false, false, false, false, false])
  })
  it('подключено: у церемонии экзамена плашку ведёт реплика Мии, у «Допроса» — прежнее окно «говорит за кадром»; стадия-заставка экзамена без плашки, как раньше', () => {
    const src = read('../useRaceActs.js')
    expect(src).toContain("st?.miaPlate ? ((st.script === 'boss' ? examPlateOn(miaTalk) && miaPlate.look : miaPlate.go) ? plateText({ type: 'announce', round: st.miaPlate }) : '')")
    expect(src).toContain("st?.mia === 'intro' || st?.sid === 'boss-intro-ann' ? ''")
    expect(read('./raceStagesBoss.js')).toContain("script: 'boss'")
  })
})

describe('2. шкала, появившись на слове «шкала», стоит до конца экзамена (было: на «я запускаю слова» гасла и мигала заново)', () => {
  it('причина: реплики «я запускаю слова» нет среди реплик объяснения — прежний показ «пока говорит реплику из списка» на ней гас', () => {
    expect(REVEAL_LINES).not.toContain('boss_mia_go'); expect(revealDelay('boss_mia_go', 0)).toBeNull(); expect(revealDelay('boss_mia_look', 2900)).toBe(2900); expect(revealDelay('boss_mia_red', 2900)).toBe(0)
  })
  it('вся церемония и круг: шкала показывается ровно один раз — на слове «шкала» — и больше не пропадает (реплики, сброс очереди речи, пауза)', () => {
    vi.useFakeTimers()
    const s = scale(), seen = []
    const at = (talk, live = true, ms = 0) => { seen.push(s.render(talk, live)); if (ms) { vi.advanceTimersByTime(ms); seen.push(s.render(talk, live)) } }
    at(null); at({ id: 'boss_mia_hush', key: 1, ms: 1500 }, true, 1500) // Пит из коробки, Мия из-за края
    at({ id: 'boss_mia_look', key: 2, ms: 6000, revealMs: 2900 }, true, 2899); expect(seen.every(v => v === false)).toBe(true) // до слова «шкала» шкалы нет
    at({ id: 'boss_mia_look', key: 2, ms: 6000, revealMs: 2900 }, true, 2); expect(seen.at(-1)).toBe(true) // слово «шкала»
    const from = seen.length
    for (const [k, id] of ['boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five'].entries()) at({ id, key: 3 + k, ms: 2500 }, true, 2500)
    at({ id: 'boss_mia_five', key: 6, ms: 2500 }, true, 1800) // «Нет, только не это» — говорит Пит, реплика Мии прежняя
    at({ id: 'boss_mia_go', key: 7, ms: 1200 }, true, 1200)  // «я запускаю слова»
    at(null, true, 500)                                       // круг: очередь речи пуста
    at({ id: 'boss_mia_miss_1', key: 8, ms: 2000 }, true, 2000); at({ id: 'boss_mia_ru', key: 9, ms: 3000 }, true, 3000)
    expect(seen.slice(from).every(v => v === true)).toBe(true)
    expect(seen.filter((v, i) => v && !seen[i - 1]).length).toBe(1) // появление — одно
    at(null, false, 10); expect(seen.at(-1)).toBe(false) // экзамен кончился — защёлка снята
    at({ id: 'boss_mia_hush', key: 10, ms: 1500 }, true, 1500); expect(seen.at(-1)).toBe(false) // новая попытка начинается без шкалы
  })
  it('реплику «…шкала покажет…» пропустили — шкала появляется на первой же реплике объяснения и тоже остаётся; срок без revealMs — запасная доля', () => {
    vi.useFakeTimers()
    const s = scale()
    expect(s.render({ id: 'boss_mia_green', key: 1, ms: 2000 })).toBe(false); vi.advanceTimersByTime(1); expect(s.render({ id: 'boss_mia_green', key: 1, ms: 2000 })).toBe(true)
    expect(s.render({ id: 'boss_mia_go', key: 2, ms: 1000 })).toBe(true)
    const z = scale(), look = { id: 'boss_mia_look', key: 1, ms: 4000 }
    z.render(look); vi.advanceTimersByTime(Math.round(4000 * REVEAL_AT) - 1); expect(z.render(look)).toBe(false); vi.advanceTimersByTime(2); expect(z.render(look)).toBe(true)
  })
  it('подключено: защёлка живёт все стадии экзамена (пауза её не снимает), шкала на сцене получает её вместе с прежними условиями круга', () => {
    const src = read('../../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(src).toContain("const bossSid = f.rh.on && ['boss-ann', 'boss', 'boss-sw', 'boss2', 'boss-fast-ann', 'boss-fast'].includes(f.stageObj?.sid)"); expect(src).toContain('useBossReveal(f.rh.miaTalk, bossSid)')
    expect(src).toContain("show={f.stageObj?.type === 'student' || bossReveal || f.stageObj?.sid === 'boss-sw'}")
  })
})

describe('4. Мия начинает уход с коробкой на слове «пока», а не после конца реплики', () => {
  const text = miaLine('boss_mia_bye').text
  it('момент слова — общая привязка «слово в реплике»: по таймингам слов записи, без них — по месту слова в тексте; та же функция ведёт показ шкалы', () => {
    expect(text).toBe('Коробка мне ещё пригодится, пока'); expect(BYE_WORD).toEqual({ boss_mia_bye: 'пока' })
    const words = text.split(' ').map((w, i) => ({ w, t: 0.2 + i * 0.5, e: 0.6 + i * 0.5 }))
    expect(byeAtMs('boss_mia_bye', { text, words, duration: 3 }, 3000)).toBe(2200); expect(byeAtMs('boss_mia_bye', { text, words, duration: 3 }, 1500)).toBe(1100) // звук короче файла — срок приведён к длине звука
    expect(byeAtMs('boss_mia_bye', { text }, 3100)).toBe(Math.round(3100 * text.indexOf('пока') / text.length)); expect(byeAtMs('boss_mia_bye', { text }, 3100)).toBeGreaterThan(3100 * 0.8)
    expect(byeAtMs('boss_mia_bye', { text: 'Пока, коробка мне ещё пригодится' }, 3000)).toBe(0) // текст заменили — срок едет вместе со словом
    expect(byeAtMs('boss_mia_bye', { text: 'Коробку я заберу' }, 3000)).toBeNull() // слова нет — уход по концу реплики, как раньше
    expect(wordAtMs({ text: 'шкала покажет, пока' }, 1900, 'пока', null, true)).toBe(1500); expect(wordAtMs({ text: 'шкала покажет, пока' }, 1900, 'пока')).toBe(600) // слово целиком: «покажет» — не «пока»; по началу слова (как у «шкал…») нашлось бы «покажет»
    expect(byeAtMs('boss_mia_bye', { text: 'Шкала покажет, пока', words: [{ w: 'Шкала', t: 0 }, { w: 'покажет,', t: 0.5 }, { w: 'пока', t: 1.5 }], duration: 2 }, 2000)).toBe(1500)
    const look = miaLine('boss_mia_look').text; expect(revealAtMs({ text: look }, 6000)).toBe(wordAtMs({ text: look }, 6000, 'шкал', REVEAL_AT)) // показ шкалы — та же функция
    expect(read('./bossScale.js')).toContain('export const revealAtMs = (line, ms) => wordAtMs(line, ms, REVEAL_WORD, REVEAL_AT)')
  })
  it('средний исход (boss_mia_mid, без «пока») — срока «на слове» нет: уход по концу реплики', () => {
    expect(BYE_LINE.mid).toBe('boss_mia_mid'); expect(byeAtMs('boss_mia_mid', { text: miaLine('boss_mia_mid').text }, 4000)).toBeNull(); expect(byeAtMs('boss_mia_free', { text: 'вот твои трофеи, пока' }, 4000)).toBeNull()
  })
  it('машина Мии: событие ухода на слове уводит её сразу; конец реплики после этого второй раз не уводит и Пита второй раз не зовёт', () => {
    const base = { ...miaInit(), phase: 'in', act: 'boss', total: 2, won: { 0: true, 1: true }, zones: {}, dug: {}, failed: {}, redWins: 0, outcome: 'free', bye: 'boss_mia_bye' }, stage = { act: 'boss', mia: 'end' }
    const g = reduceMia(base, { t: 'bye', id: 'boss_mia_bye', stage, now: 2200 })
    expect(g.mia).toMatchObject({ phase: 'out', at: 2200, bye: null }); expect(g.say).toEqual([{ id: 'boss_pit_well', who: 'pit', delay: PIT_AFTER_LEAVE_MS }])
    const again = reduceMia(g.mia, { t: 'bye', id: 'boss_mia_bye', stage, now: 3000 }); expect(again.mia).toBe(g.mia); expect(again.say).toEqual([])
  })
  it('очередь речи: «Ух, спасибо…» Пита не накладывается на «пока» и не оставляет пустой тишины — он говорит, когда Мия уже за краем И её реплика доиграла', () => {
    const run = wordAt => {
      let t = 0, n = 0
      const timers = new Map(), said = []
      const setTimer = (fn, ms) => { const k = ++n; timers.set(k, { fn, at: t + ms }); return k }, clearTimer = k => timers.delete(k)
      const advance = ms => { const end = t + ms; for (;;) { const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; timers.delete(next[0]); next[1].fn() } t = end }
      const sp = createMiaSpeech({ now: () => t, setTimer, clearTimer, play: (k, res, start, end) => { start(); res({ play: 'ok' }); setTimer(end, 3000); return true }, has: () => true, bufferMs: () => 3000, onCaption() {}, log() {}, trace() {} })
      sp.use({ lines: { boss_mia_bye: { text, url: 'u', duration: 3 }, boss_pit_well: { text: 'Ух, спасибо', url: 'u', duration: 2 } }, cat: { busyLeft: () => 0, holdBusy() {}, sayLine: (id, v, o) => { said.push([id, t]); setTimer(() => o.onEnd(), 2000); return true } }, listener: { current: null } })
      sp.enqueue([{ id: 'boss_mia_bye', who: 'mia', delay: 0 }]); advance(wordAt)
      sp.enqueue([{ id: 'boss_pit_well', who: 'pit', delay: PIT_AFTER_LEAVE_MS }]) // слово «пока»: Мия ушла, Пит поставлен в очередь
      advance(8000)
      return said[0]
    }
    const late = run(2600), early = run(900), gap = miaGap()
    expect(late[0]).toBe('boss_pit_well'); expect(late[1]).toBeGreaterThanOrEqual(2600 + PIT_AFTER_LEAVE_MS); expect(late[1]).toBeLessThanOrEqual(2600 + PIT_AFTER_LEAVE_MS + 150) // «пока» в конце записи: Пит ждёт только ухода Мии
    expect(early[1]).toBeGreaterThanOrEqual(3000 + gap); expect(early[1]).toBeLessThanOrEqual(3000 + gap + 150) // слово раньше: Пит ждёт конца реплики Мии и обычной паузы очереди
  })
  it('подключено: срок слова ставит очередь речи на начале реплики; новая реплика, пауза и выход его снимают; обработчик тот же, что у конца реплики', () => {
    const src = read('./useExamSpeech.js')
    expect(src).toContain('const bye = c ? byeAtMs(c.id, src.lines?.[c.id] ?? { text: c.text }, c.ms) : null'); expect(src).toContain('clearTimeout(src.word); src.word = 0')
    expect(src).toMatch(/src\.word = setTimeout\(\(\) => \{[^\n]*src\.onEnd\?\.\(c\.id\)[^\n]*\}, bye\)/); expect(src).toContain('useEffect(() => () => clearTimeout(api.word()), [api])')
    expect(read('../useRaceActs.js')).toContain("onLineEnd(id => miaEvent({ t: 'bye', id, stage: running }))")
  })
})
