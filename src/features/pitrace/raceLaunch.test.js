import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { openAsk, answerAsk } from './raceLaunch.js'
import { createStartTrace, RACE_HOLD_MAX_MS, RACE_LINE_WAIT_MS, PIT_PEEK_MS, RACE_ENTRY_LINE_MS } from './raceStartTrace.js'
import { wordsPlan } from '../player/modules/rotate-phone/wordLaneStart.js'
import { waitWarmGate, gateSize, warmProgress, GATE_MIN } from '../player/modules/rotate-phone/wordLaneGate.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Попап внутри игры и быстрый старт Пита (CONCEPT_RACE.md): до ответа — только тихий прогрев; ответ — жест, в нём startGameAudio синхронно; «Говорю» ждёт микрофон в попапе, «Тапаю» — без микрофона и сразу; ворота ждут только первые реплики.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('до ответа на попап ничего не стартует (кроме тихого прогрева)', () => {
  it('openAsk: полный экран, тихий прогрев (prewarm) и фаза ask — startGameAudio, заставка, реплики не вызываются', () => {
    const calls = []
    openAsk({ fullscreen: () => calls.push('fullscreen'), prewarm: () => calls.push('prewarm'), setPhase: p => calls.push(`phase:${p}`) })
    expect(calls).toEqual(['fullscreen', 'prewarm', 'phase:ask'])
    const quiet = []; openAsk({ fullscreen: () => quiet.push('fs'), prewarm: () => { throw new Error('сбой') }, setPhase: p => quiet.push(p) }); expect(quiet).toEqual(['fs', 'ask']) // сбой прогрева не мешает попапу
  })
  it('модуль: start() у гонки открывает попап (openRace → openAsk) и выходит до startGameAudio; игра монтируется только при phase === game', () => {
    const mod = read('../player/modules/rotate-phone/RotatePhoneModule.jsx'), hook = read('./useRaceLaunch.js')
    const start = mod.slice(mod.indexOf('const start = useCallback'), mod.indexOf('/** Касание по «Тапни'))
    expect(start.indexOf('if (race) { openRace(fullscreen); return }')).toBeGreaterThan(-1); expect(start.indexOf('openRace(')).toBeLessThan(start.indexOf('startGameAudio('))
    expect(start.match(/startGameAudio\(/g)).toHaveLength(1) // в start() он есть только после выхода гонки (обычная игра); гонка зовёт его из pick
    expect(mod).toContain("const game = phase === 'game' && <WordLaneGame"); expect(mod).toContain("{phase === 'ask' && <RaceAskPlate {...rl.plate} />}")
    const pick = hook.slice(hook.indexOf('const pick = useCallback'), hook.indexOf('const cancel = useCallback'))
    expect(pick).toContain('startAudio: hooks => startGameAudio({ cfg: runCfg, audioSrc, lines, ...hooks })'); expect(pick).toContain("if (phase !== 'ask' || wait) return")
    expect(hook).toContain('openAsk({ fullscreen, setPhase, prewarm: () => raceWarm.start({ cfg, lines }) })')
  })
})

describe('ответ на попап: жест', () => {
  const mk = (over = {}) => {
    const calls = [], timers = [], hooks = {}
    const audio = over.audio ?? Promise.resolve({ mic: over.choice === 'voice' ? 'granted' : 'off', needsTap: false })
    const o = {
      choice: 'tap', ask: { pick: c => calls.push(`ask:${c}`) }, trace: { ask: () => calls.push('trace.ask'), begin: () => calls.push('trace.begin'), cancel: () => calls.push('trace.cancel') },
      startAudio: h => { calls.push(`startAudio:mic=${h.mic}`); hooks.h = h; return audio }, setPhase: p => calls.push(`phase:${p}`), setHold: h => calls.push(`hold:${h}`), setWait: w => calls.push(`wait:${w}`),
      onAudio: vi.fn(), onDenied: vi.fn(), onEnter: () => calls.push('enter'), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => calls.push('clear'), ...over,
    }
    return { o, calls, timers, hooks }
  }
  it('«Тапаю»: выбор → отсчёт → startGameAudio БЕЗ микрофона СИНХРОННО → вход в игру сразу (hold), всё до первого await', () => {
    const { o, calls } = mk()
    answerAsk(o)
    expect(calls).toEqual(['ask:tap', 'trace.ask', 'startAudio:mic=false', 'trace.begin', 'hold:true', 'enter', 'phase:game'])
  })
  it('«Тапаю»: часы стоят не дольше RACE_HOLD_MAX_MS; звук реплик готов (onLineReady) — часы идут сразу', () => {
    const a = mk({ audio: new Promise(() => {}) }); answerAsk(a.o)
    expect(a.timers[0].ms).toBe(RACE_HOLD_MAX_MS); expect(RACE_HOLD_MAX_MS).toBe(1500)
    a.timers[0].fn(); expect(a.calls.at(-1)).toBe('hold:false')
    const b = mk({ audio: new Promise(() => {}) }); answerAsk(b.o); b.hooks.h.onLineReady(); expect(b.calls.at(-1)).toBe('hold:false')
    const stale = mk({ audio: new Promise(() => {}), current: () => false }); answerAsk(stale.o); stale.hooks.h.onLineReady(); expect(stale.calls).not.toContain('hold:false')
  })
  it('«Говорю»: микрофон запрашивается в жесте, попап остаётся («Разрешите микрофон…»), игры нет, пока система не ответила', () => {
    const { o, calls, hooks } = mk({ choice: 'voice', audio: new Promise(() => {}) })
    answerAsk(o)
    expect(calls).toEqual(['ask:voice', 'trace.ask', 'wait:mic', 'startAudio:mic=true']) // никакого phase:game
    hooks.h.onMic('granted'); expect(calls.at(-1)).toBe('wait:sound') // доступ дан — «Готовлю звук…», пока звук улягается
  })
  it('«Говорю»: доступ дан → вход в игру; звук реплик уже готов — часы не стоят и потолка нет', async () => {
    const hooks = {}
    const { o, calls, timers } = mk({ choice: 'voice', startAudio: h => { hooks.h = h; return Promise.resolve().then(() => { h.onLineReady(); return { mic: 'granted', needsTap: false } }) } })
    await answerAsk(o)
    expect(calls.slice(calls.indexOf('wait:null'))).toEqual(['wait:null', 'trace.begin', 'hold:false', 'enter', 'phase:game'])
    expect(timers).toHaveLength(0); expect(o.onAudio).toHaveBeenCalledWith({ mic: 'granted', needsTap: false }); expect(o.onDenied).not.toHaveBeenCalled(); expect(hooks.h.mic).toBe(true)
  })
  it('«Говорю»: отказ или ошибка → остаёмся в попапе (onDenied), игры нет, строка старта отменена', async () => {
    for (const audio of [Promise.resolve({ mic: 'denied' }), Promise.resolve({ mic: 'unavailable' }), Promise.reject(new Error('сбой'))]) {
      const { o, calls } = mk({ choice: 'voice', audio })
      await answerAsk(o)
      expect(calls).not.toContain('phase:game'); expect(calls).toContain('trace.cancel'); expect(o.onDenied).toHaveBeenCalledTimes(1); expect(o.onAudio).not.toHaveBeenCalled()
    }
  })
  it('«Попробовать снова» после отказа — тот же путь «Голосом»: новый жест, startGameAudio с микрофоном; плашка отказа по режиму, подсказка до тапа — при открытии попапа', async () => {
    const first = mk({ choice: 'voice', audio: Promise.resolve({ mic: 'denied' }) }); await answerAsk(first.o)
    const again = mk({ choice: 'voice' }); await answerAsk(again.o) // кнопка «Попробовать снова» зовёт onPick('voice')
    expect(again.calls).toContain('startAudio:mic=true'); expect(again.calls).toContain('phase:game')
    const plate = read('./RaceAskPlate.jsx'), hook = read('./useRaceLaunch.js')
    expect(plate).toContain("hint && c === 'voice' ? RETRY_LABEL"); expect(plate).toContain('onClick={() => onPick(c)}')
    const open = hook.slice(hook.indexOf('const open = useCallback'), hook.indexOf('const pick = useCallback'))
    expect(open).toContain('setNote(needsMicNote(') // подсказка решается до тапа (getUserMedia остаётся в жесте)
  })
  it('«Говорю»: жест истёк, а контекст не запущен (needsTap) — «Тапни, чтобы начать»; устаревший запуск ничего не меняет', async () => {
    const a = mk({ choice: 'voice', audio: Promise.resolve({ mic: 'granted', needsTap: true }) }); await answerAsk(a.o); expect(a.calls).toContain('phase:tap'); expect(a.calls).not.toContain('phase:game')
    const b = mk({ choice: 'voice', current: () => false }); await answerAsk(b.o); expect(b.calls).not.toContain('phase:game'); expect(b.o.onAudio).not.toHaveBeenCalled(); expect(b.o.onDenied).not.toHaveBeenCalled()
  })
  it('в жесте: ask.pick (запись выбора и режим тапа) идёт до startGameAudio — режим тапа выставлен до старта игры', () => {
    const hook = read('./useRaceAsk.js')
    const pick = hook.slice(hook.indexOf('const pick'), hook.indexOf('const watch'))
    expect(pick).toContain('writeVoiceChoice(picked'); expect(pick.indexOf('guard.begin')).toBeLessThan(pick.indexOf('writeTapMode'))
  })
})

describe('Пит почти сразу и журнал старта', () => {
  it('строка «[race] старт: реплика через M мс после входа в игру, Пит через N мс; от ответа на попап до входа W мс» — один раз за запуск', () => {
    let t = 1000; const log = vi.fn(), tr = createStartTrace({ now: () => t, log })
    expect(tr.line()).toBeNull() // без запуска — молчит
    tr.ask(); expect(tr.asking()).toBe(true); t += 650; tr.begin(); expect(tr.asking()).toBe(false)
    t += 40; tr.pit(); t += 20; tr.pit(); t += 240
    expect(tr.line()).toEqual({ pit: 40, line: 300, wait: 650 }); expect(log).toHaveBeenCalledWith('[race] старт: реплика через 300 мс после входа в игру, Пит через 40 мс; от ответа на попап до входа 650 мс')
    expect(tr.line()).toBeNull(); expect(log).toHaveBeenCalledTimes(1)
  })
  it('дольше RACE_ENTRY_LINE_MS (0,4 с) — пометка; без звука — пометка; отмена — строки нет; без ask — без ожидания', () => {
    let t = 0; const log = vi.fn(), tr = createStartTrace({ now: () => t, log })
    expect(RACE_ENTRY_LINE_MS).toBe(400)
    tr.begin(); tr.cancel(); expect(tr.active()).toBe(false); expect(tr.line()).toBeNull()
    tr.begin(); t = 900; expect(tr.line({ voiced: false })).toEqual({ pit: 900, line: 900, wait: null })
    expect(log.mock.calls[0][0]).toBe('[race] старт: реплика через 900 мс после входа в игру, Пит через 900 мс (без звука — только подпись) — ДОЛЬШЕ 400 мс')
  })
  it('Пит выскакивает при открытии сцены (peek на PIT_PEEK_MS), реплика ждёт слот не дольше 1,5 с, строка пишется на старте первой реплики', () => {
    expect(RACE_LINE_WAIT_MS).toBe(1500); expect(PIT_PEEK_MS).toBeGreaterThan(RACE_HOLD_MAX_MS)
    const game = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(game).toContain('if (startHold) { catApi.current?.peek?.(PIT_PEEK_MS); raceStart.pit() }')
    const cat = read('../player/modules/rotate-phone/useCatLines.js')
    expect(cat).toContain('raceStart.line({ id })'); expect(cat).toContain('raceStart.line({ voiced: false, id })'); expect(cat).toContain('{ maxMs: waitMs, pollMs:'); expect(cat).toContain('waitMs = LINE_WAIT_MS')
    const flow = read('../player/modules/rotate-phone/useWordLaneFlow.js')
    expect(flow).toContain("waitMs: plan?.game === 'race' ? RACE_LINE_WAIT_MS : undefined"); expect(flow).toContain('if (hold) return undefined; const t = setTimeout(() => go(\'lanes\'), DROP_MS)')
    expect(read('../rehearsal/useRehearsalActs.js')).toContain("if (!on || stage !== 'drop' || !(intro || early) || hold) return undefined")
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
  it('«Пальцами»: ворота ждут стартовую фразу race_start_tap — она первая в списке и единственная в firstCount', () => {
    const tl = { ...ls, race_start_tap: lines('race_start_tap'), race_catch_tap: lines('race_catch_tap') }
    const p = wordsPlan({ cfg: { ...cfg, firstLines: ['race_start_tap', 'race_catch_tap'] }, lines: tl })
    expect(p.firstCount).toBe(1); expect(p.now.slice(0, 2).map(x => x.key)).toEqual(['line:race_start_tap', 'line:race_catch_tap'])
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
