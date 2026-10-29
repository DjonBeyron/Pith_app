import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WordLaneHud from './WordLaneHud.jsx'
import { createWordListener } from './wordLaneListen.js'
import { TAP_KEY, readTapMode, writeTapMode } from './wordLaneHudSettings.js'

// «Тап вместо речи» (админ, HUD ⚙): проверка механики и анимаций игры «Повтори за диктором» без голоса — тап по дорожке в очереди ученика засчитывает следующую цель тем же путём, что речь (слушатель → seq → движок пилюль).
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const noModel = { getModel: () => null }

afterEach(() => vi.unstubAllGlobals())

describe('настройка pithy_wl_tap_v1', () => {
  it('по умолчанию выключена; «1» включает; выключение снимает ключ', () => {
    const st = memStore()
    expect(readTapMode(st)).toBe(false)
    writeTapMode(true, st); expect(st.m[TAP_KEY]).toBe('1'); expect(readTapMode(st)).toBe(true)
    writeTapMode(false, st); expect(TAP_KEY in st.m).toBe(false)
  })
})

describe('слушатель: tap(target)', () => {
  it('цель засчитывается как услышанная: seq растёт, onChange получает heard = текст цели; дальше счёт захода идёт от нового seq', () => {
    const calls = []
    const l = createWordListener({ targets: ['i am', 'trying'], expected: 3, runtime: noModel, onChange: e => calls.push({ ...e, seq: [...e.seq] }), now: () => 1000 })
    l.start() // модели нет → unavailable, но тап работает и без Vosk
    l.tap(1); l.tap(0)
    const last = calls.at(-1)
    expect(last.seq).toEqual([1, 0]); expect(last.hits).toBe(2); expect(last.heard).toBe('i am'); expect(last.heardAt).toBe(1000); expect(last.tail).toBeNull()
    expect(l.heardAt()).toBe(1000)
  })
  it('мусор не ломает: цель вне списка, null, после dispose — ничего не публикуется', () => {
    const onChange = vi.fn()
    const l = createWordListener({ targets: ['go'], runtime: noModel, onChange })
    l.tap(5); l.tap(-1); l.tap(null)
    expect(onChange).not.toHaveBeenCalled()
    l.dispose(); l.tap(0)
    expect(onChange).not.toHaveBeenCalled()
  })
  it('тап уходит в журнал отладки (kind tap)', () => {
    const onDebug = vi.fn()
    const l = createWordListener({ targets: ['go'], runtime: noModel, onChange() {}, onDebug })
    l.tap(0)
    expect(onDebug).toHaveBeenCalledWith('tap', { target: 0, text: 'go', seq: [0] })
  })
})

describe('проводка в игре', () => {
  it('useWordLaneFlow.onLane: у «Порядка» — tap движка; у ученика (nextTarget) — listener.tap', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain("const onLane = useCallback(lane => { const api = sceneApi.current; if (api?.tap) api.tap(lane); else { const t = api?.nextTarget?.(); if (t != null) listenerRef.current?.tap(t) } }, [])")
  })
  it('WordLaneGame: кнопки дорожек и подсказка в очереди ученика только при tapMode; HUD переключает его сразу (setTapMode)', () => {
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain('const [tapMode, setTapMode] = useState(readTapMode)')
    expect(game).toContain("onLane={phase === 'order' || phase === 'discern' || (tapMode && phase === 'student') ? f.onLane : null}")
    expect(game).toContain(`{tapMode && phase === 'student' && <div className="wlTapHint" data-testid="wl-tap-hint">`)
    expect(game).toContain('setTapMode={setTapMode}')
    expect(read('../../../../styles/player/modules/word-lane-hud.css')).toContain('.wlTapHint {')
  })
  it('HUD: пункт «Тап вместо речи» (сразу), третий режим микрофона «Закрывать микрофон»', () => {
    vi.stubGlobal('localStorage', memStore({ [TAP_KEY]: '1' }))
    const out = renderToStaticMarkup(createElement(WordLaneHud, { dbg: {}, rootRef: { current: null }, onRestartStage() {}, onRestartGame() {}, onExit() {}, defaultOpen: true }))
    expect(out).toMatch(/Тап вместо речи \(проверка механики\)<em class="wlHudWhen wlHudWhen--now">сразу/)
    expect(out).toMatch(/data-testid="wl-hud-tap-toggle">Вкл/)
    expect(out).toContain('data-testid="wl-hud-hold-close"')
    expect(read('./WordLaneHud.jsx')).toContain('const toggleTap = () => { writeTapMode(!tap); setTapMode?.(!tap); refresh() }')
  })
})
