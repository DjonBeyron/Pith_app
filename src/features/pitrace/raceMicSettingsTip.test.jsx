import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceMicSettingsTip from './RaceMicSettingsTip.jsx'
import { RaceAskScene } from './RaceAskPlate.jsx'
import WordLaneHud from '../player/modules/rotate-phone/WordLaneHud.jsx'
import { shouldShowTip, tipVisibleNow, readTipDone, writeTipDone, readTipLaterUntil, writeTipLater, TIP_DONE_KEY, TIP_LATER_KEY, TIP_LATER_MS } from './raceMicSettingsTip.js'
import { isIOS, micTip, MIC_TIP_TITLE, MIC_TIP_TEXTS } from './raceMicHelp.js'
import { markMicGranted, readMicLaunches, MIC_LAUNCHES_KEY, MIC_LAUNCH_GAP_MS } from '../../shared/lib/micGrantFlag.js'

// Подсказка «Чтобы iPhone не спрашивал микрофон каждый раз»: тексты по режиму, условия показа, счётчик запусков, рендер в попапе и в шестерёнке игры
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }
const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }
afterEach(() => vi.unstubAllGlobals())

describe('iOS и тексты по режиму', () => {
  it('iPhone / iPad / iPadOS — да; Android и десктоп — нет', () => {
    expect(isIOS(IPHONE)).toBe(true); expect(isIOS({ userAgent: 'iPad', platform: 'iPad' })).toBe(true)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIOS(ANDROID)).toBe(false); expect(isIOS(null)).toBe(false)
  })
  it('Safari: шаги «⋯» → Настройки веб-сайта → Микрофон → Разрешить и запасной путь; «Домой»: короткий текст про ограничение и Safari', () => {
    const s = micTip(false), h = micTip(true)
    expect(s.mode).toBe('safari'); expect(s.title).toBe(MIC_TIP_TITLE); expect(s.steps.join(' → ')).toContain('Настройки веб-сайта → Микрофон → Разрешить'); expect(s.steps[0]).toContain('⋯')
    expect(s.fallback).toContain('Настройки iPhone → Приложения → Safari → Настройки для веб-сайтов → Микрофон')
    expect(h.mode).toBe('home'); expect(h.steps).toEqual([]); expect(h.intro).toBe(MIC_TIP_TEXTS.home.intro)
    expect(h.intro).toContain('один раз при каждом запуске'); expect(h.intro).toContain('ограничение iPhone'); expect(h.intro).toContain('открой сайт в Safari и разреши микрофон там')
  })
})

describe('условие показа', () => {
  const base = { ios: true, launches: 2, done: false, laterUntil: null, now: 1000 }
  it('счётчик ≥ 2, iOS, нет «Понятно», нет «позже»', () => {
    expect(shouldShowTip(base)).toBe(true)
    expect(shouldShowTip({ ...base, launches: 1 })).toBe(false); expect(shouldShowTip({ ...base, launches: 5 })).toBe(true)
    expect(shouldShowTip({ ...base, ios: false })).toBe(false); expect(shouldShowTip({ ...base, done: true })).toBe(false)
    expect(shouldShowTip({ ...base, laterUntil: 2000 })).toBe(false); expect(shouldShowTip({ ...base, laterUntil: 1000 })).toBe(true); expect(shouldShowTip({ ...base, laterUntil: 500 })).toBe(true)
  })
  it('«Понятно» пишет флаг pithy_mic_tip_done_v1; «позже» — молчание ровно 24 часа', () => {
    const s = memory()
    expect(TIP_DONE_KEY).toBe('pithy_mic_tip_done_v1'); expect(readTipDone(s)).toBe(false); writeTipDone(s); expect(readTipDone(s)).toBe(true)
    const l = memory(); expect(readTipLaterUntil(l)).toBeNull(); writeTipLater(1000, l); expect(l.m.get(TIP_LATER_KEY)).toBe(String(1000 + TIP_LATER_MS)); expect(readTipLaterUntil(l)).toBe(1000 + TIP_LATER_MS)
    expect(() => writeTipDone({ setItem() { throw new Error('x') } })).not.toThrow(); expect(readTipDone({ getItem() { throw new Error('x') } })).toBe(false)
  })
  it('tipVisibleNow читает всё из хранилища: 2 запуска — да, «позже» гасит на сутки, потом снова', () => {
    const s = memory(); s.setItem(MIC_LAUNCHES_KEY, '2')
    expect(tipVisibleNow({ now: 1000, nav: IPHONE, store: s })).toBe(true); expect(tipVisibleNow({ now: 1000, nav: ANDROID, store: s })).toBe(false)
    writeTipLater(1000, s)
    expect(tipVisibleNow({ now: 1000 + TIP_LATER_MS - 1, nav: IPHONE, store: s })).toBe(false); expect(tipVisibleNow({ now: 1000 + TIP_LATER_MS, nav: IPHONE, store: s })).toBe(true)
    writeTipDone(s); expect(tipVisibleNow({ now: 1e12, nav: IPHONE, store: s })).toBe(false)
  })
})

describe('счётчик запусков с диалогом (micGrantFlag)', () => {
  it('растёт на успехе, если с прошлого больше часа; внутри часа — нет', () => {
    const s = memory(), T = 1e9
    expect(readMicLaunches(s)).toBe(0)
    markMicGranted(T, s); expect(readMicLaunches(s)).toBe(1)
    markMicGranted(T + 1000, s); markMicGranted(T + MIC_LAUNCH_GAP_MS, s); expect(readMicLaunches(s)).toBe(1) // отсчёт от последнего успеха
    markMicGranted(T + MIC_LAUNCH_GAP_MS + MIC_LAUNCH_GAP_MS + 1, s); expect(readMicLaunches(s)).toBe(2)
    s.setItem(MIC_LAUNCHES_KEY, 'мусор'); expect(readMicLaunches(s)).toBe(0); expect(readMicLaunches(null)).toBe(0)
    expect(() => markMicGranted(T, { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } })).not.toThrow()
  })
})

describe('рендер', () => {
  it('карточка: Safari — шаги и обе кнопки; «Домой» — без шагов', () => {
    const s = renderToStaticMarkup(createElement(RaceMicSettingsTip, {})), h = renderToStaticMarkup(createElement(RaceMicSettingsTip, { standalone: true }))
    expect(s).toContain(MIC_TIP_TITLE); expect(s).toContain('race-mic-tip-steps'); expect(s).toContain('Понятно'); expect(s).toContain('Напомнить позже'); expect(s).toContain('race-mic-tip-fallback')
    expect(h).toContain('data-mode="home"'); expect(h).not.toContain('race-mic-tip-steps'); expect(h).toContain('Понятно')
  })
  it('попап: tip вместо строки note; без tip — прежняя строка; при отказе карточки нет', () => {
    const html = p => renderToStaticMarkup(createElement(RaceAskScene, { choice: 'voice', onPick() {}, onCancel() {}, ...p }))
    const withTip = html({ tip: true, note: 'N' }); expect(withTip).toContain('race-mic-tip'); expect(withTip).not.toContain('race-ask-note')
    const noTip = html({ note: 'N' }); expect(noTip).not.toContain('race-mic-tip'); expect(noTip).toContain('race-ask-note')
    expect(html({ tip: true, hint: { mic: 'denied', title: 'T', paras: [] } })).not.toContain('race-mic-tip')
  })
  it('шестерёнка: пункт «Микрофон спрашивает каждый раз?» на iPhone, на Android его нет; карточка раскрывается по нему', () => {
    const hud = () => renderToStaticMarkup(createElement(WordLaneHud, { dbg: {}, defaultOpen: true }))
    vi.stubGlobal('navigator', IPHONE); const ios = hud(); expect(ios).toContain('wl-hud-mictip-toggle'); expect(ios).toContain('Микрофон спрашивает каждый раз?'); expect(ios).not.toContain('race-mic-tip"')
    vi.stubGlobal('navigator', ANDROID); expect(hud()).not.toContain('wl-hud-mictip')
    const src = read('../player/modules/rotate-phone/WordLaneHud.jsx'); expect(src).toContain('RaceMicSettingsTip'); expect(src).toContain('setTipOpen(v => !v)')
  })
  it('useRaceLaunch решает tip при открытии попапа и отдаёт его в плашку', () => {
    const hook = read('./useRaceLaunch.js'), open = hook.slice(hook.indexOf('const open = useCallback'), hook.indexOf('const pick = useCallback'))
    expect(open).toContain('setTip(tipVisibleNow())'); expect(hook).toContain('tip, onTipClose')
  })
})
