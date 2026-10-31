import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { quietSpec, quietDone, quietState, lineVoiced, QUIET_GRACE_MS, QUIET_POLL_MS, QUIET_TAIL_MS } from './rehearsalQuiet.js'
import { stageTiming, countdownMs, QUIET_RISE_MS } from './rehearsalCountdown.js'
import { LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { LINE_WAIT_MS } from '../player/modules/rotate-phone/wordLaneLineGate.js'
import { CAT_RISE_MS } from '../player/modules/rotate-phone/wordLaneCatSay.js'

// Мини-реализация хуков React: usePitQuiet проверяется без рендерера (состояние — в слотах, эффект запускаем сами)
const h = vi.hoisted(() => ({ slots: [], i: 0, effects: [] }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useState: init => { const i = h.i++; if (!(i in h.slots)) h.slots[i] = init; return [h.slots[i], v => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }] },
  useEffect: fn => { h.effects.push(fn) },
}))
const { usePitQuiet } = await import('./usePitQuiet.js')
const render = props => { h.i = 0; h.effects = []; return usePitQuiet(props) }

const lines = { rh_warmup: { text: 'Давай разомнёмся', url: 'https://x/a.mp3', duration: 2 }, rh_mirror: { text: 'Слушаем', url: null, duration: null } }

describe('тишина экрана: чистые решения', () => {
  it('ждём только озвученную реплику: без url, без id и без настроек — экран не прячем', () => {
    expect(lineVoiced(lines, 'rh_warmup')).toBe(true); expect(lineVoiced(lines, 'rh_mirror')).toBe(false)
    expect(lineVoiced(lines, null)).toBe(false); expect(lineVoiced(null, 'rh_warmup')).toBe(false); expect(lineVoiced(lines, 'нет_такой')).toBe(false)
    expect(quietSpec({ voiced: false, lineAt: 270 })).toBeNull(); expect(quietSpec({ voiced: true, lineAt: null })).toBeNull()
  })
  it('предел ожидания: старт реплики + ожидание слота + длина + запас; у отсчёта «до» экран гаснет в момент реплики, а не раньше', () => {
    expect(quietSpec({ voiced: true, lineAt: 270, lineMs: 2000 })).toEqual({ lineAt: 270, from: 0, cap: 270 + LINE_WAIT_MS + 2000 + QUIET_TAIL_MS })
    expect(quietSpec({ voiced: true, order: 'before', lineAt: 1600, lineMs: 450 }).from).toBe(1600)
    expect(quietSpec({ voiced: true, order: 'after', lineAt: 270, lineMs: 1 }).from).toBe(0)
  })
  it('реплика кончилась, когда кот занят одной паузой после речи (не раньше старта реплики); предел срабатывает всегда', () => {
    const spec = quietSpec({ voiced: true, lineAt: 270, lineMs: 2000 })
    expect(quietDone(spec, 100, 0)).toBe(false) // реплика ещё не началась: занятость от прошлой не в счёт
    expect(quietDone(spec, 270 + QUIET_GRACE_MS - 1, 0)).toBe(false)
    expect(quietDone(spec, 400, 2600)).toBe(false) // говорит
    expect(quietDone(spec, 2700, LINE_PAUSE_MS + 1)).toBe(false)
    expect(quietDone(spec, 2900, LINE_PAUSE_MS)).toBe(true) // осталась пауза — речь кончилась
    expect(quietDone(spec, 3000, 0)).toBe(true)
    expect(quietDone(spec, spec.cap, 99999)).toBe(true) // озвучка не дождалась слота/кот завис — экран не остаётся пустым
  })
  it('состояние: нет ключа или реплика не озвучена — тишины нет; реплика идёт — тишина; кончилась — плашка можно; у «до» плашка не возвращается после реплики', () => {
    expect(quietState({ key: null, voiced: true })).toEqual({ quiet: false, plateOk: true })
    expect(quietState({ key: 'a', voiced: false })).toEqual({ quiet: false, plateOk: true })
    expect(quietState({ key: 'a', voiced: true })).toEqual({ quiet: true, plateOk: false })
    expect(quietState({ key: 'a', voiced: true, ended: 'a' })).toEqual({ quiet: false, plateOk: true })
    expect(quietState({ key: 'a', voiced: true, ended: 'старая' })).toEqual({ quiet: true, plateOk: false }) // «кончилась» относится к прошлой стадии
    expect(quietState({ key: 't', voiced: true, order: 'before' })).toEqual({ quiet: false, plateOk: true }) // «Дубль»: плашка и ноты идут до реплики
    expect(quietState({ key: 't', voiced: true, order: 'before', armed: 't' })).toEqual({ quiet: true, plateOk: false })
    expect(quietState({ key: 't', voiced: true, order: 'before', armed: 't', ended: 't' })).toEqual({ quiet: false, plateOk: false })
  })
})

describe('раскладка: плашка выходит после реплики', () => {
  const o = { lead: 250, pause: 600, lineMs: 2000, minMs: 1700 }
  it('озвученная реплика без счёта: стадия держится до конца речи (с выскакиванием головы) и ещё minMs — плашка успевает показаться; без quiet — как раньше', () => {
    expect(stageTiming({ ...o })).toEqual({ countAt: null, lineAt: 270, holdMs: 250 + 2000 + 600 })
    const t = stageTiming({ ...o, quiet: true })
    expect(t.lineAt).toBe(270); expect(t.holdMs).toBe(270 + QUIET_RISE_MS + 2000 + 1700); expect(QUIET_RISE_MS).toBe(CAT_RISE_MS)
    expect(t.holdMs).toBeGreaterThan(stageTiming({ ...o }).holdMs)
  })
  it('разминка (after): плашка и подписи — на ноты после реплики, стадия не кончается раньше конца нот', () => {
    const t = stageTiming({ ...o, order: 'after', quiet: true })
    expect(t.holdMs).toBe(Math.max(270 + 2000 + 600 + countdownMs(), 270 + QUIET_RISE_MS + 2000 + 1700))
    expect(t.holdMs).toBeGreaterThanOrEqual(t.countAt + countdownMs())
  })
  it('дубль (before): «Дубль» → ноты → «поехали» → плашка уже не нужна; hold не меньше конца реплики; без quiet — прежнее', () => {
    const t = stageTiming({ ...o, order: 'before', lineMs: 450, quiet: true, minMs: 3200 })
    expect(t.lineAt).toBe(250 + countdownMs()); expect(t.holdMs).toBeGreaterThanOrEqual(t.lineAt + 450 + 600)
    expect(stageTiming({ ...o, order: 'before', lineMs: 450 }).holdMs).toBe(250 + countdownMs() + 450 + 600)
  })
  it('нет реплики или не озвучена — quiet ничего не добавляет: сразу, как раньше', () => {
    expect(stageTiming({ ...o, hasLine: false, quiet: true }).holdMs).toBe(1700)
  })
})

describe('usePitQuiet', () => {
  beforeEach(() => { vi.useFakeTimers(); h.slots = [] })
  afterEach(() => vi.useRealTimers())
  const base = { on: true, key: '3:100', voiced: true, order: null, timing: () => ({ lineAt: 270, lineMs: 2000 }) }
  it('с первого кадра стадии экран тихий (без вспышки плашки); реплика кончилась по занятости кота — экран открывается и остаётся открытым', () => {
    let busy = 3000
    const props = { ...base, busyLeft: () => busy }
    expect(render(props)).toEqual({ quiet: true, plateOk: false })
    const stop = h.effects[0]()
    vi.advanceTimersByTime(1000); expect(render(props).quiet).toBe(true)
    busy = LINE_PAUSE_MS; vi.advanceTimersByTime(QUIET_POLL_MS * 2)
    expect(render(props)).toEqual({ quiet: false, plateOk: true })
    expect(render({ ...props, key: '4:200' }).quiet).toBe(true) // следующая стадия — снова тихая, прошлая «кончилась» к ней не относится
    stop()
  })
  it('реплика не озвучена или без стадии — тишины нет и таймеров нет; не репетиция (on=false) — тоже', () => {
    for (const p of [{ ...base, voiced: false }, { ...base, key: null }, { ...base, on: false }]) { expect(render({ ...p, busyLeft: () => 0 })).toEqual({ quiet: false, plateOk: true }); expect(h.effects[0]?.()).toBeUndefined() }
  })
  it('кот завис (занят вечно) — по пределу экран всё равно открывается', () => {
    const props = { ...base, busyLeft: () => 99999 }
    render(props); h.effects[0](); vi.advanceTimersByTime(270 + LINE_WAIT_MS + 2000 + QUIET_TAIL_MS + QUIET_POLL_MS * 2)
    expect(render(props).quiet).toBe(false)
  })
  it('дубль (before): до реплики плашка видна, в момент реплики экран тихий, после неё плашка не возвращается', () => {
    let busy = 0
    const props = { ...base, order: 'before', key: 't:1', busyLeft: () => busy, timing: () => ({ lineAt: 1850, lineMs: 450 }) }
    expect(render(props)).toEqual({ quiet: false, plateOk: true })
    h.effects[0](); vi.advanceTimersByTime(1000); expect(render(props).quiet).toBe(false)
    busy = 5000; vi.advanceTimersByTime(900); expect(render(props)).toEqual({ quiet: true, plateOk: false }) // 1900 мс: «поехали» говорится
    busy = 0; vi.advanceTimersByTime(QUIET_POLL_MS * 2); expect(render(props)).toEqual({ quiet: false, plateOk: false })
  })
})

describe('подключение', () => {
  const src = f => readFileSync(new URL(f, import.meta.url), 'utf8')
  it('директор актов отдаёт rh.quiet / rh.plateOk, считает тихой стадию с озвученной репликой (и итог — rh_done), RehearsalActs прячет экраны', () => {
    const acts = src('./useRehearsalActs.js')
    expect(acts).toContain('usePitQuiet({'); expect(acts).toContain("running.type === 'summary' ? doneLine : running.line ?? null"); expect(acts).toContain('quiet: quiet.quiet, plateOk: quiet.plateOk')
    expect(src('./RehearsalActs.jsx')).toContain('if (rh.quiet) return null')
  })
  it('в rehearsal нет Math.random и нового speechSynthesis', () => {
    for (const f of ['./rehearsalQuiet.js', './usePitQuiet.js', './rehearsalCountdownRun.js', './rehearsalCountdownSynth.js']) { expect(src(f)).not.toContain('Math.random'); expect(src(f)).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/) }
  })
})
