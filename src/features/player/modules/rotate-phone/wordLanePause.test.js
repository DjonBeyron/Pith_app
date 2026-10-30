import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Пауза игры «Повтори за диктором» при сворачивании (iPhone, iOS 18, Safari). Жалобы владельца: (6) возврат из фона снова просит доступ к микрофону — игра сама переоткрывала поток вне жеста;
// (7) сворачивание не ставит игру на паузу сразу. Хуки React здесь выполняются «как есть» (useEffect — сразу, useCallback — тождество): рендера нет.
const calls = vi.hoisted(() => [])
const fx = vi.hoisted(() => ({ cleanup: null, ref: [] }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useCallback: fn => fn,
  useEffect: fn => { const c = fn(); if (typeof c === 'function') fx.cleanup = c },
  useRef: init => ({ current: init }),
  useState: init => { const box = [typeof init === 'function' ? init() : init]; return [box[0], v => { box[0] = typeof v === 'function' ? v(box[0]) : v }] },
}))
vi.mock('react-dom', async orig => ({ ...(await orig()), flushSync: fn => fn() }))
vi.mock('./wordLaneVoice.js', () => ({ stopVoice: () => calls.push('stopVoice') }))
vi.mock('./wordLaneNotes.js', () => ({ releaseNotes: () => calls.push('releaseNotes') }))
vi.mock('./wordLaneClips.js', () => ({ releaseClips: () => calls.push('releaseClips') }))
vi.mock('./useGameAudioModes.js', () => ({ endGameAudio: () => calls.push('endGameAudio') }))
vi.mock('./wordLaneStart.js', () => ({ startGameAudio: vi.fn() }))
vi.mock('../../../../shared/lib/gameMic.js', () => ({ closeGameMic: () => calls.push('closeGameMic') }))

import { useWordLaneControls } from './useWordLaneControls.js'
import { useWordLanePause } from './useWordLanePause.js'
import { gameMicGesture, guardStream } from '../../../../shared/lib/gameMicGesture.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const lines = rel => read(rel).split('\n').length - 1

beforeEach(() => { calls.length = 0; gameMicGesture.grant() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const STAGES = [{ idx: 0, type: 'announce' }, { idx: 1, type: 'dictor', step: 'A' }, { idx: 2, type: 'student', step: 'A' }]
function makeControls(state) {
  const sRef = { current: state }
  const dispose = vi.fn(), listener = { dispose }
  const timers = { notes: setTimeout(() => {}, 1e6), hint: setTimeout(() => {}, 1e6) }
  const args = {
    stages: STAGES, sRef, setS: vi.fn(fn => { sRef.current = fn(sRef.current) }), setMicEpoch: vi.fn(), clearTimers: vi.fn(() => calls.push('clearTimers')),
    listenerRef: { current: listener }, noteTimerRef: { current: timers.notes }, hintTimerRef: { current: timers.hint }, finishedRef: { current: false },
    catApi: { current: { freeze: vi.fn(() => calls.push('cat.freeze')) } }, cat: { stop: vi.fn(() => calls.push('cat.stop')) }, dbg: { event: vi.fn() },
  }
  return { ...args, dispose, api: useWordLaneControls(args), sRef }
}

describe('pause(): сворачивание в игре (ступень) — всё останавливается сразу', () => {
  it('таймеры, голос, ноты, клипы, слушатель Vosk, реплика и лицо кота, окна речи/сессия, микрофон; стадия «paused», запоминает откуда', () => {
    const c = makeControls({ stage: 'run', idx: 2, hint: [3], note: 'x' })
    expect(c.api.pause('hidden')).toBe(true)
    expect(calls).toEqual(expect.arrayContaining(['stopVoice', 'releaseNotes', 'releaseClips', 'clearTimers', 'cat.stop', 'cat.freeze', 'endGameAudio', 'closeGameMic']))
    expect(c.dispose).toHaveBeenCalledTimes(1)
    expect(c.listenerRef.current).toBeNull()
    expect(c.sRef.current).toMatchObject({ stage: 'paused', from: 'run', idx: 2, hint: [], note: '' })
    expect(c.dbg.event).toHaveBeenCalledWith('pause', expect.objectContaining({ why: 'hidden', stage: 'run', idx: 2 }))
    expect(calls.indexOf('endGameAudio')).toBeLessThan(calls.indexOf('closeGameMic')) // окна речи закрыты до закрытия потока (как finish)
    expect(gameMicGesture.needed()).toBe(true) // дальше микрофон открывается только из тапа
  })
  it('во вступлении (drop) пауза тоже ставится (иначе слушатель следующей ступени открыл бы микрофон сам); откуда — запоминается', () => {
    const c = makeControls({ stage: 'drop', idx: 0 })
    expect(c.api.pause()).toBe(true)
    expect(c.sRef.current).toMatchObject({ stage: 'paused', from: 'drop' })
    expect(gameMicGesture.needed()).toBe(true)
  })
  it('на финале (reveal) и после закрытия игры пауза не нужна: ничего не трогаем', () => {
    const c = makeControls({ stage: 'reveal', idx: 5 })
    expect(c.api.pause()).toBe(false)
    expect(calls).toEqual([]); expect(c.setS).not.toHaveBeenCalled(); expect(gameMicGesture.needed()).toBe(false)
    const d = makeControls({ stage: 'run', idx: 1 }); d.finishedRef.current = true
    expect(d.api.pause()).toBe(false); expect(calls).toEqual([])
  })
  it('повторная пауза (свернули снова, пока «Продолжить» открывал микрофон) стадию не трогает, но микрофон и звук закрывает ещё раз', () => {
    const c = makeControls({ stage: 'paused', from: 'run', idx: 2 })
    expect(c.api.pause('hidden')).toBe(true)
    expect(c.setS).not.toHaveBeenCalled(); expect(c.dbg.event).not.toHaveBeenCalled()
    expect(calls).toEqual(expect.arrayContaining(['closeGameMic', 'endGameAudio', 'releaseClips']))
  })
})

describe('restartStage() после паузы («Продолжить»)', () => {
  it('пауза на ступени: стадия run с НАЧАЛА ступени (диктор → очередь ученика), слушатель и счёт с нуля', () => {
    const c = makeControls({ stage: 'run', idx: 2 }); c.api.pause()
    c.api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'run', idx: 1, seq: [], misses: 0, lid: '', note: '', hint: [] })
    expect(c.setMicEpoch).toHaveBeenCalledTimes(1)
  })
  it('пауза во вступлении: вступление заново (drop); на финале и вне пауз во вступлении — ничего', () => {
    const c = makeControls({ stage: 'drop', idx: 0 }); c.api.pause()
    c.api.restartStage()
    expect(c.sRef.current).toMatchObject({ stage: 'drop', idx: 0 })
    const intro = makeControls({ stage: 'lanes', idx: 0 }); intro.api.restartStage()
    expect(intro.setS).not.toHaveBeenCalled() // HUD «Перезапустить ступень» во вступлении по-прежнему ничего не делает
    const end = makeControls({ stage: 'reveal', idx: 4 }); end.api.restartStage()
    expect(end.setS).not.toHaveBeenCalled()
  })
})

describe('useWordLanePause: подписка на сворачивание и «Продолжить» (жест)', () => {
  function setup({ paused = true, startAudio } = {}) {
    const docL = {}, winL = {}
    const doc = { visibilityState: 'visible', addEventListener: (t, h) => { docL[t] = h }, removeEventListener: t => { delete docL[t] } }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { addEventListener: (t, h) => { winL[t] = h }, removeEventListener: t => { delete winL[t] } })
    const f = { paused, pausedIntro: false, pause: vi.fn(), restartStage: vi.fn(), dbg: { event: vi.fn() } }
    const start = startAudio ?? vi.fn(() => Promise.resolve({ mic: 'granted' }))
    const cfg = { word: 'go' }
    const hook = useWordLanePause({ f, cfg, audioSrc: 'a.mp3', lines: { x: 1 }, startAudio: start })
    return { f, start, hook, doc, docL, winL, cfg }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('visibilitychange → hidden: игра встаёт на паузу СРАЗУ (pause(\'hidden\')); visible — ничего; pagehide — тоже пауза', () => {
    const { f, doc, docL, winL } = setup()
    docL.visibilitychange(); expect(f.pause).not.toHaveBeenCalled() // visible
    doc.visibilityState = 'hidden'; docL.visibilitychange()
    expect(f.pause).toHaveBeenCalledWith('hidden')
    winL.pagehide(); expect(f.pause).toHaveBeenLastCalledWith('pagehide')
  })
  it('размонтирование снимает подписки', () => {
    const { docL, winL } = setup()
    fx.cleanup()
    expect(docL.visibilitychange).toBeUndefined(); expect(winL.pagehide).toBeUndefined()
  })
  it('«Продолжить»: startGameAudio (openGameMic) вызывается СИНХРОННО в тапе, ступень сначала — только после него; запись resume в журнале', async () => {
    const { f, start, hook, cfg } = setup()
    hook.resume()
    expect(start).toHaveBeenCalledTimes(1) // тот же тик, что и тап — жест жив
    expect(start).toHaveBeenCalledWith({ cfg, audioSrc: 'a.mp3', lines: { x: 1 } })
    expect(f.restartStage).not.toHaveBeenCalled()
    expect(f.dbg.event).toHaveBeenCalledWith('resume')
    await tick()
    expect(f.restartStage).toHaveBeenCalledTimes(1)
    expect(start.mock.invocationCallOrder[0]).toBeLessThan(f.restartStage.mock.invocationCallOrder[0])
  })
  it('микрофон не дали: ступень не перезапускается, всё закрывается снова (pause), на оверлее — причина', async () => {
    const { f, hook } = setup({ startAudio: vi.fn(() => Promise.resolve({ mic: 'denied' })) })
    hook.resume(); await tick()
    expect(f.restartStage).not.toHaveBeenCalled()
    expect(f.pause).toHaveBeenCalledWith('mic-denied')
  })
  it('свернули снова, пока микрофон открывался: перезапуска нет, остаёмся на паузе', async () => {
    let done
    const { f, hook, doc, docL } = setup({ startAudio: vi.fn(() => new Promise(r => { done = r })) })
    hook.resume()
    doc.visibilityState = 'hidden'; docL.visibilitychange()
    done({ mic: 'granted' }); await tick()
    expect(f.pause).toHaveBeenCalledWith('hidden')
    expect(f.restartStage).not.toHaveBeenCalled()
  })
  it('не на паузе — «Продолжить» ничего не открывает', () => {
    const { start, hook } = setup({ paused: false })
    hook.resume()
    expect(start).not.toHaveBeenCalled()
  })
})

describe('микрофон после фона открывается только из жеста (gameMicGesture)', () => {
  it('guardStream: живой поток отдаётся; нет потока и жест не нужен — null (распознаватель откроет сам, как раньше); нужен жест — отказ NotAllowedError, а не getUserMedia', async () => {
    const stream = {}
    expect(guardStream(() => stream)()).toBe(stream)
    expect(guardStream(() => null)()).toBeNull()
    gameMicGesture.require()
    expect(guardStream(() => stream)()).toBe(stream)
    await expect(Promise.resolve(guardStream(() => null)())).rejects.toMatchObject({ name: 'NotAllowedError' })
  })
  it('gameMic: после require() режим «close» (reopenGameMic) поток не открывает; openGameMic из жеста открывает и опускает флаг', async () => {
    const gum = vi.fn().mockResolvedValue({ getTracks: () => [{ readyState: 'live', muted: false, stop() {}, getSettings: () => ({}) }] })
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } })
    const gesture = gameMicGesture
    const mic = await vi.importActual('../../../../shared/lib/gameMic.js')
    gesture.require()
    expect(await mic.reopenGameMic()).toBe('unavailable'); expect(gum).not.toHaveBeenCalled()
    expect(await mic.openGameMic()).toBe('granted'); expect(gum).toHaveBeenCalledTimes(1)
    expect(gesture.needed()).toBe(false)
    mic.closeGameMic()
  })
})

describe('проводка и аудит исходников', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  it('все openGameMic( в игре, кроме тапов «Начать» / «Продолжить» (wordLaneStart.js), защищены условием gameMicGesture.needed()', () => {
    const files = readdirSync(dir).filter(f => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) && f !== 'wordLaneStart.js' && f !== 'wordLaneDebugProbe.js')
    const bad = []
    for (const f of files) { const src = read(f).split('\n'); src.forEach((l, i) => { if (/\bopenGameMic\(/.test(l) && !/^\s*\/\//.test(l) && !src.slice(Math.max(0, i - 4), i + 1).some(x => /needed\(\)/.test(x))) bad.push(`${f}:${i + 1}`) }) } // условие — в той же строке или в четырёх строках выше
    expect(bad).toEqual([])
    expect(read('./useWordLaneFlow.js')).toContain('hasGameMic() && !gameMicGesture.needed()')
    expect(read('./useGameAudioModes.js')).toContain('!hasGameMic() || gameMicGesture.needed()')
    expect(read('../../../../shared/lib/gameMic.js')).toContain("if (gameMicGesture.needed()) return Promise.resolve('unavailable')")
  })
  it('слушатель берёт поток через guardStream (нет живого потока после фона — отказ вместо своего getUserMedia)', () => {
    expect(read('./useWordLaneFlow.js')).toContain('getStream: guardStream(getGameMic)')
  })
  it('WordLaneGame: хук паузы и оверлей «Игра на паузе» с кнопками «Продолжить» и «Выйти»; сообщение отказа слушателя на паузе скрыто', () => {
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain('useWordLanePause({ f, cfg, audioSrc, lines })')
    expect(game).toContain('{f.paused && <WordLanePause pause={pause} onExit={f.finish} />}')
    expect(game).toContain("f.mic === 'failed' && !f.paused")
    const ov = read('./WordLanePause.jsx')
    expect(ov).toContain("title: 'Игра на паузе'")
    expect(ov).toContain("sub: 'Ты свернул приложение. Продолжим с начала этой ступени'")
    expect(ov).toContain('Продолжить'); expect(ov).toContain('Выйти')
    expect(ov).toContain('onClick={pause.resume}')
  })
  it('useWordLaneFlow отдаёт pause/paused; кот: freeze в api и stop в репликах', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain('useWordLaneControls({')
    expect(flow).toMatch(/restartStage, pause, paused: s\.stage === 'paused'/)
    expect(read('./WordLaneCat.jsx')).toContain('freeze() { voice.stop()')
    expect(read('./useCatLines.js')).toContain('return { text, sayLine, stop, busyLeft }')
  })
  it('попап паузы — плотная подложка на весь экран (fixed, z-index 60) вне .wlStage, карточка внутри; порядок подключения hud → pause', () => {
    const pause = read('../../../../styles/player/modules/word-lane-pause.css')
    expect(pause).toMatch(/\.wlPauseBack \{[^}]*position: fixed; inset: 0; z-index: 60/)
    expect(pause).toMatch(/\.wlPauseBack \{[^}]*background: #15181f/)                  // плотный фон: сквозь 0,97 кот просвечивал
    expect(pause).toMatch(/\.wlPause \{[^}]*position: relative; left: auto; bottom: auto; transform: none/) // карточка внутри подложки, не absolute у низа как .wlFail
    expect(read('../../../../styles/player/modules/word-lane.css')).toMatch(/\.wlStage > \.wlCat\.scn \{[^}]*z-index: 8/)
    const index = read('../../../../index.css')
    expect(index.indexOf('word-lane-pause.css')).toBeGreaterThan(index.indexOf('word-lane-hud.css')) // .wlPause после .wlFail: при равной специфичности побеждает пауза
    const game = read('./WordLaneGame.jsx')
    const stage = game.slice(game.indexOf('<div className="wlStage">'), game.indexOf('<button type="button" className="wlClose"'))
    expect(stage).not.toContain('<WordLanePause')                                           // попап НЕ в .wlStage (там кот): подложка fixed поверх всего
    expect(game.slice(game.indexOf('className="wlClose"'))).toContain('{f.paused && <WordLanePause pause={pause} onExit={f.finish} />}')
    expect(read('./WordLanePause.jsx')).toContain('<div className="wlPauseBack" data-testid="wl-pause-back">')
  })
  it('CSS: на паузе кот уходит под нижний край (иначе торчит из-под попапа); правило длиннее выскакивания и пружины', () => {
    const pause = read('../../../../styles/player/modules/word-lane-pause.css')
    expect(pause).toMatch(/\.wl\[data-phase='paused'\] \.wlStage > \.wlCat\.scn\.wlCat--up \{[^}]*transform: translate\(-50%, 108%\)/)
    expect(read('../../../../styles/player/modules/word-lane.css')).toMatch(/\.wlStage > \.wlCat\.scn \{[^}]*transform: translate\(-50%, 108%\)/)  // то же положение «спрятан», что у кота по умолчанию
    expect(read('../../../../styles/player/modules/word-lane.css')).toContain('.wlStage > .wlCat.scn.wlCat--up { transform: translate(-50%, 4%)')
  })
  it('CSS: на паузе анимации замирают; стили подключены в index.css', () => {
    const css = read('../../../../styles/player/modules/word-lane-pause.css')
    expect(css).toContain(".wl[data-phase='paused'] *")
    expect(css).toContain('animation-play-state: paused')
    expect(read('../../../../index.css')).toContain('word-lane-pause.css')
  })
  it('размеры файлов в пределах: flow ≤ 250, хук паузы ≤ 150', () => {
    expect(lines('./useWordLaneFlow.js')).toBeLessThanOrEqual(250)
    expect(lines('./useWordLanePause.js')).toBeLessThanOrEqual(150)
    expect(lines('./useWordLaneControls.js')).toBeLessThanOrEqual(150)
  })
})
