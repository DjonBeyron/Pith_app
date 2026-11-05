import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { openAsk, answerAsk } from './raceLaunch.js'
import { createStartTrace, RACE_HOLD_MAX_MS, RACE_LINE_WAIT_MS, PIT_PEEK_MS } from './raceStartTrace.js'
import { wordsPlan } from '../player/modules/rotate-phone/wordLaneStart.js'
import { waitWarmGate, gateSize, warmProgress, GATE_MIN } from '../player/modules/rotate-phone/wordLaneGate.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Попап внутри игры и быстрый старт Пита (CONCEPT_RACE.md): до ответа не начинается ничего; ответ — жест, в нём startGameAudio синхронно и игра открывается сразу; ворота ждут только первые реплики.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('до ответа на попап ничего не стартует', () => {
  it('openAsk: только полный экран и фаза ask — startGameAudio, заставка, реплики не вызываются', () => {
    const calls = []
    openAsk({ fullscreen: () => calls.push('fullscreen'), setPhase: p => calls.push(`phase:${p}`) })
    expect(calls).toEqual(['fullscreen', 'phase:ask'])
  })
  it('модуль: start() у гонки открывает попап и выходит до startGameAudio; игра (Пит, заставка, реплики, конвейер) монтируется только при phase === game', () => {
    const mod = read('../player/modules/rotate-phone/RotatePhoneModule.jsx')
    const start = mod.slice(mod.indexOf('const start = useCallback'), mod.indexOf('/** «Говорю» / «Тапаю»'))
    expect(start.indexOf("if (race) { openAsk(")).toBeGreaterThan(-1); expect(start.indexOf('openAsk(')).toBeLessThan(start.indexOf('startGameAudio('))
    expect(mod).toContain("const game = phase === 'game' && <WordLaneGame")
    expect(start.match(/startGameAudio\(/g)).toHaveLength(1) // в start() он есть только после выхода гонки (обычная игра); гонка зовёт его из pick
    const pick = mod.slice(mod.indexOf('const pick = useCallback'), mod.indexOf('const cancelAsk'))
    expect(pick).toContain('startAudio: hooks => startGameAudio({ cfg, audioSrc, lines, ...hooks })'); expect(pick).toContain("if (phase !== 'ask') return")
  })
})

describe('ответ на попап: жест', () => {
  const mk = (over = {}) => {
    const calls = [], timers = [], hooks = {}
    const audio = over.audio ?? Promise.resolve({ mic: 'granted', needsTap: false })
    const o = {
      choice: 'tap', ask: { pick: c => calls.push(`ask:${c}`) }, trace: { begin: () => calls.push('trace.begin') },
      startAudio: h => { calls.push('startAudio'); hooks.h = h; return audio }, setPhase: p => calls.push(`phase:${p}`), setHold: h => calls.push(`hold:${h}`),
      onAudio: vi.fn(), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => calls.push('clear'), ...over,
    }
    return { o, calls, timers, hooks }
  }
  it('порядок: выбор и режим тапа → отсчёт «Пит через N мс» → hold → startGameAudio СИНХРОННО → игра открыта (phase game)', () => {
    const { o, calls } = mk()
    answerAsk(o)
    expect(calls).toEqual(['ask:tap', 'trace.begin', 'hold:true', 'startAudio', 'phase:game']) // всё до первого await
  })
  it('часы игры стоят не дольше RACE_HOLD_MAX_MS: потом hold снимается сам, даже если звук не готов', () => {
    const { o, calls, timers } = mk({ audio: new Promise(() => {}) })
    answerAsk(o)
    expect(timers[0].ms).toBe(RACE_HOLD_MAX_MS); expect(RACE_HOLD_MAX_MS).toBe(1500)
    timers[0].fn(); expect(calls.at(-1)).toBe('hold:false')
  })
  it('звук реплик готов раньше микрофона (onLineReady): часы идут сразу, не ждут ни микрофон, ни потолок RACE_HOLD_MAX_MS', () => {
    const { o, calls, timers, hooks } = mk({ audio: new Promise(() => {}) }) // микрофон ещё открывается
    answerAsk(o)
    hooks.h.onLineReady(); expect(calls.at(-1)).toBe('hold:false')
    expect(timers).toHaveLength(1) // потолок остаётся страховкой
    const stale = mk({ audio: new Promise(() => {}), current: () => false }); answerAsk(stale.o); stale.hooks.h.onLineReady(); expect(stale.calls).not.toContain('hold:false')
  })
  it('устаревший запуск (игру закрыли) ничего не меняет; актуальный — ответ startGameAudio доходит до модуля', async () => {
    const a = mk(); await answerAsk(a.o); expect(a.o.onAudio).toHaveBeenCalledWith({ mic: 'granted', needsTap: false })
    const b = mk({ current: () => false }); await answerAsk(b.o); expect(b.o.onAudio).not.toHaveBeenCalled()
    b.timers[0].fn(); expect(b.calls).not.toContain('hold:false')
  })
  it('в жесте: ask.pick (запись выбора и режим тапа) идёт до startGameAudio — режим тапа выставлен до старта игры', () => {
    const hook = read('./useRaceAsk.js')
    const pick = hook.slice(hook.indexOf('const pick'), hook.indexOf('const watch'))
    expect(pick).toContain('writeVoiceChoice(picked'); expect(pick.indexOf('guard.begin')).toBeLessThan(pick.indexOf('writeTapMode'))
  })
})

describe('Пит почти сразу и журнал старта', () => {
  it('строка «[race] старт: Пит через N мс, реплика через M мс» — один раз за запуск; N не больше M', () => {
    let t = 1000; const log = vi.fn(), tr = createStartTrace({ now: () => t, log })
    expect(tr.line()).toBeNull() // без запуска — молчит
    tr.begin(); t += 40; tr.pit(); t += 20; tr.pit(); t += 840
    expect(tr.line()).toEqual({ pit: 40, line: 900 }); expect(log).toHaveBeenCalledWith('[race] старт: Пит через 40 мс, реплика через 900 мс')
    expect(tr.line()).toBeNull(); expect(log).toHaveBeenCalledTimes(1)
  })
  it('запуск отменён (микрофон не дали) — строки нет; реплика без выскакивания головы — N = M', () => {
    let t = 0; const log = vi.fn(), tr = createStartTrace({ now: () => t, log })
    tr.begin(); tr.cancel(); expect(tr.active()).toBe(false); expect(tr.line()).toBeNull()
    tr.begin(); t = 300; expect(tr.line()).toEqual({ pit: 300, line: 300 })
  })
  it('Пит выскакивает при открытии сцены (peek на PIT_PEEK_MS), реплика ждёт слот не дольше 1,5 с, строка пишется на старте первой реплики', () => {
    expect(RACE_LINE_WAIT_MS).toBe(1500); expect(PIT_PEEK_MS).toBeGreaterThan(RACE_HOLD_MAX_MS)
    const game = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(game).toContain('if (startHold) { catApi.current?.peek?.(PIT_PEEK_MS); raceStart.pit() }')
    const cat = read('../player/modules/rotate-phone/useCatLines.js')
    expect(cat).toContain('raceStart.line()'); expect(cat).toContain('{ maxMs: waitMs, pollMs:'); expect(cat).toContain('waitMs = LINE_WAIT_MS')
    const flow = read('../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain("waitMs: plan?.game === 'race' ? RACE_LINE_WAIT_MS : undefined"); expect(flow).toContain('if (hold) return undefined; const t = setTimeout(() => go(\'lanes\'), DROP_MS)')
    expect(read('../rehearsal/useRehearsalActs.js')).toContain("if (!on || stage !== 'drop' || !intro || hold) return undefined")
  })
})

describe('ворота старта гонки ждут только первые реплики', () => {
  const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
  const lines = id => ({ url: `https://x/${id}.mp3`, text: id, duration: 3 })
  const ls = { race_start: lines('race_start'), race_sprint: lines('race_sprint'), race_catch: lines('race_catch'), race_climb: lines('race_climb') }
  const cfg = { chunks: plan.chunks, confusers: [], extraWords: [], translations: [], firstLines: ['race_start', 'race_sprint'], plan }
  it('firstCount = 1 (только race_start), gateMin 0: реплика первого этапа, куски фразы и переводы не держат Пита (v3.3.117)', () => {
    const p = wordsPlan({ cfg, lines: ls })
    expect(p.gateMin).toBe(0); expect(p.firstCount).toBe(1); expect(p.now.slice(0, 2).map(x => x.key)).toEqual(['line:race_start', 'line:race_sprint'])
    expect(gateSize(p.firstCount, 20, p.gateMin)).toBe(1); expect(gateSize(2, 20)).toBe(GATE_MIN) // у репетиции по-прежнему не меньше 5
    expect(wordsPlan({ cfg: { ...cfg, plan: { ...plan, game: undefined } }, lines: ls }).gateMin).toBeUndefined()
  })
  it('ворота открываются по «первые N», как только готовы две реплики, хотя слова и остальные реплики ещё качаются', async () => {
    const { settle, clearSettled } = await import('../player/modules/rotate-phone/wordLaneSettled.js')
    clearSettled()
    const items = [{ key: 'a', url: 'ua' }, { key: 'b', url: 'ub' }, { key: 'w1', url: 'uw1' }, { key: 'w2', url: 'uw2' }, { key: 'w3', url: 'uw3' }, { key: 'w4', url: 'uw4' }]
    settle('ua', 'ok'); settle('ub', 'ok')
    const p = warmProgress(items, 2, 0)
    expect(p.firstN).toBe(2); expect(p.open).toBe(true); expect(p.all).toBe(false)
    expect(warmProgress(items, 2).firstN).toBe(GATE_MIN); expect(warmProgress(items, 2).open).toBe(false) // у репетиции (min 5) ворота остались бы закрытыми
    const r = await waitWarmGate({ items, firstCount: 2, min: 0 }, { log: () => {} })
    expect(r.by).toBe('first'); expect(r.firstN).toBe(2); expect(r.missing).toEqual(['w1', 'w2', 'w3', 'w4']) // слова догреваются к первой пилюле
    clearSettled()
  })
})
