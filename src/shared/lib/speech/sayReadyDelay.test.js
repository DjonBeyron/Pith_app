import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { READY_DELAY_MS, POPUP_DELAY_MS, holdKind, startsAsk, startsAfterPopup, readyDelayLeft, activationLeft } from './sayReadyDelay.js'
import { micVisualState, hasMicAccess } from './sayMicState.js'
import { createSayPermission, MIC_GRANTED_KEY, INTRO_SEEN_KEY } from './sayPermission.js'

// Видимый переход locked → ready откладывается ТОЛЬКО на экране; настоящее состояние (micVisualState, decide()) меняется сразу.
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const STATES = ['locked', 'ready', 'active', 'done', 'off']

describe('holdKind — какой переход из показанного locked удерживаем', () => {
  it('locked → ready — удерживаем; locked → active — только если это первый запрос доступа (asked); остальные пары — без удержания', () => {
    for (const shown of STATES) for (const target of STATES) {
      const want = shown !== 'locked' ? null : target === 'ready' ? 'ready' : null
      expect(holdKind({ shown, target }), `${shown} → ${target}`).toBe(want)
      const wantAsked = shown !== 'locked' ? null : target === 'ready' ? 'ready' : target === 'active' ? 'active' : null
      expect(holdKind({ shown, target, asked: true }), `${shown} → ${target} (asked)`).toBe(wantAsked)
    }
  })

  it('уже выданный доступ при монтировании: показано = настоящему (ready → ready) — задержки нет; отзыв доступа (ready → locked / off) — сразу; отказ (locked → off) — сразу, без показа активации', () => {
    expect(holdKind({ shown: 'ready', target: 'ready' })).toBeNull()
    expect(holdKind({ shown: 'ready', target: 'locked' })).toBeNull()
    expect(holdKind({ shown: 'ready', target: 'off' })).toBeNull()
    expect(holdKind({ shown: 'locked', target: 'off', asked: true })).toBeNull()
    expect(holdKind({ shown: 'locked', target: 'done', asked: true })).toBeNull()
    expect(holdKind({ shown: 'locked', target: 'locked' })).toBeNull()
  })

  it('пока Permissions API не ответил (settled=false) — ready без удержания: ответ при открытии модуля показывается сразу', () => {
    expect(holdKind({ shown: 'locked', target: 'ready', settled: false })).toBeNull()
    expect(holdKind({ shown: 'locked', target: 'ready', settled: true })).toBe('ready')
  })
})

describe('startsAsk — нажатие, с которого началась запись, это первый запрос доступа', () => {
  it('да: показан серый locked, запись пошла (active), доступа на этот момент нет (iPhone без флага, Android prompt)', () => {
    expect(startsAsk({ shown: 'locked', target: 'active', noAccess: true })).toBe(true)
  })

  it('нет: доступ уже есть (вводный попап на Android с granted, флаг при неизвестном ответе), повторная попытка из ready, другие цели', () => {
    expect(startsAsk({ shown: 'locked', target: 'active', noAccess: false })).toBe(false)
    expect(startsAsk({ shown: 'ready', target: 'active', noAccess: true })).toBe(false)
    expect(startsAsk({ shown: 'locked', target: 'off', noAccess: true })).toBe(false)
    expect(startsAsk({ shown: 'locked', target: 'ready', noAccess: true })).toBe(false)
  })
})

describe('readyDelayLeft — когда показать ready', () => {
  it('отсечка 600–800 мс', () => {
    expect(READY_DELAY_MS).toBeGreaterThanOrEqual(600)
    expect(READY_DELAY_MS).toBeLessThanOrEqual(800)
  })

  it('Android: просто отсечка по времени от момента «цель стала ready»; приложение скрыто/возвращалось — не важно', () => {
    expect(readyDelayLeft({ ios: false, readyAt: 1000, now: 1000 })).toBe(READY_DELAY_MS)
    expect(readyDelayLeft({ ios: false, readyAt: 1000, now: 1000 + READY_DELAY_MS - 1 })).toBe(1)
    expect(readyDelayLeft({ ios: false, readyAt: 1000, now: 1000 + READY_DELAY_MS })).toBe(0)
    expect(readyDelayLeft({ ios: false, readyAt: 1000, now: 9000 })).toBe(0)
    expect(readyDelayLeft({ ios: false, readyAt: 1000, backAt: 2000, now: 1000 + READY_DELAY_MS, visible: false })).toBe(0)
  })

  it('iPhone: отсчёт от ПОСЛЕДНЕГО из «цель стала ready» и «приложение вернулось» (диалог ОС закрыт); возврат раньше ready ничего не сдвигает', () => {
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 0, now: 1000 })).toBe(READY_DELAY_MS)
    // приложение вернулось уже после ready (диалог закрылся позже ответа Permissions API) — ждём ещё READY_DELAY_MS от возврата
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 1500, now: 1500 })).toBe(READY_DELAY_MS)
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 1500, now: 1000 + READY_DELAY_MS })).toBe(500)
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 1500, now: 1500 + READY_DELAY_MS })).toBe(0)
    // возврат был раньше ready — считаем от ready
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 400, now: 1000 })).toBe(READY_DELAY_MS)
  })

  it('iPhone: пока приложение скрыто (диалог/сворачивание) — ждём возврата: null, а не таймер', () => {
    expect(readyDelayLeft({ ios: true, readyAt: 1000, now: 1100, visible: false })).toBeNull()
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 1200, now: 9000, visible: false })).toBeNull()
    expect(readyDelayLeft({ ios: true, readyAt: 1000, backAt: 1200, now: 9000, visible: true })).toBe(0)
  })
})

describe('задержка только визуальная: настоящее состояние и решения доступа меняются сразу', () => {
  it('после успешного открытия микрофона markMicOk сразу даёт decide() = listen и настоящий ready; хук лишь позже перекрасит круг', () => {
    const local = store(); const session = store()
    local.setItem(INTRO_SEEN_KEY, '1'); local.setItem('pithy_say_explained_v1', '1')
    const perm = createSayPermission({ local, session, queryPerm: async () => 'unavailable', isSupported: () => true, isBlockedBrowser: () => false })
    const before = micVisualState({ ...perm.access(), phase: 'idle' })
    expect(before).toBe('locked')
    perm.markMicOk() // iPhone: диалог позади, запись пошла
    expect(local.getItem(MIC_GRANTED_KEY)).toBe('1')
    expect(perm.decide().action).toBe('listen')                       // флаги и решение — без задержки
    const after = micVisualState({ ...perm.access(), phase: 'idle' })
    expect(after).toBe('ready')
    expect(holdKind({ shown: before, target: after })).toBe('ready') // а вот КАРТИНКА задерживается
  })

  it('sayPermission.isChecked: false до первого ответа Permissions API, true после (и при ошибке запроса)', async () => {
    const mk = queryPerm => createSayPermission({ local: store(), session: store(), queryPerm, isSupported: () => true, isBlockedBrowser: () => false })
    const ok = mk(async () => 'granted')
    expect(ok.isChecked()).toBe(false)
    await ok.refresh()
    expect(ok.isChecked()).toBe(true)
    const bad = mk(async () => { throw new Error('no api') })
    await bad.refresh()
    expect(bad.isChecked()).toBe(true)
    expect(bad.getPerm()).toBe('unavailable')
  })

  it('отзыв доступа (query = denied) → настоящий locked; показанный ready не удерживается', () => {
    const target = micVisualState({ permission: 'denied', flag: true, sessionOk: true, phase: 'idle' })
    expect(target).toBe('locked')
    expect(holdKind({ shown: 'ready', target })).toBeNull()
    expect(holdKind({ shown: 'ready', target: micVisualState({ phase: 'fallback' }) })).toBeNull() // off — сразу
  })

  it('при монтировании с уже выданным доступом: настоящий ready, показанное стартует равным ему — удержания нет', () => {
    const target = micVisualState({ permission: 'granted', phase: 'idle' })
    expect(target).toBe('ready')
    expect(holdKind({ shown: target, target })).toBeNull()
  })
})

// Таймлайн первого запроса доступа (то, что делает хук): тап в попапе → запись идёт, картинка locked → микрофон открылся (opened) → отсчёт → active
describe('первый запрос доступа: когда начинается активация на экране', () => {
  const T0 = 1000          // тап в попапе: phase run, настоящее состояние active
  const OPENED = 4200      // пользователь подтвердил системный диалог, микрофон открылся (view.status listening)

  it('iPhone с подтверждением: до открытия микрофона ждём (отсчёта нет — он стартует только с opened); после — 700 мс от последнего из «открылся» и «приложение вернулось»', () => {
    expect(startsAsk({ shown: 'locked', target: 'active', noAccess: true })).toBe(true)
    // диалог закрылся (focus) уже после открытия — ждём ещё 700 мс от возврата
    expect(readyDelayLeft({ ios: true, readyAt: OPENED, backAt: OPENED + 300, now: OPENED + 300 })).toBe(READY_DELAY_MS)
    expect(readyDelayLeft({ ios: true, readyAt: OPENED, backAt: OPENED + 300, now: OPENED + READY_DELAY_MS })).toBe(300)
    // возврат был раньше открытия — считаем от открытия
    expect(readyDelayLeft({ ios: true, readyAt: OPENED, backAt: T0 + 100, now: OPENED })).toBe(READY_DELAY_MS)
    expect(readyDelayLeft({ ios: true, readyAt: OPENED, backAt: T0 + 100, now: OPENED + READY_DELAY_MS })).toBe(0)
  })

  it('фон / возврат фокуса: пока приложение скрыто, активация не стартует (null), после возврата — 700 мс от возврата', () => {
    expect(readyDelayLeft({ ios: true, readyAt: OPENED, now: OPENED + 50, visible: false })).toBeNull()
    expect(readyDelayLeft({ ios: true, readyAt: OPENED, backAt: OPENED + 5000, now: OPENED + 5000, visible: true })).toBe(READY_DELAY_MS)
  })

  it('Android: отсечка 700 мс от открытия микрофона, без ожидания возврата фокуса', () => {
    expect(readyDelayLeft({ ios: false, readyAt: OPENED, now: OPENED })).toBe(READY_DELAY_MS)
    expect(readyDelayLeft({ ios: false, readyAt: OPENED, now: OPENED + READY_DELAY_MS })).toBe(0)
    expect(readyDelayLeft({ ios: false, readyAt: OPENED, now: OPENED + 50, visible: false })).toBe(READY_DELAY_MS - 50)
  })

  it('доступ уже выдан (флаг / granted при монтировании, повторные попытки) — удержания нет; отказ (not-allowed → fallback → off) — сразу off, активация не показывается', () => {
    const access = { permission: 'granted', flag: false, sessionOk: false }
    const noAccess = !hasMicAccess(access)
    expect(noAccess).toBe(false)
    const run = micVisualState({ ...access, phase: 'run' })
    expect(holdKind({ shown: 'ready', target: run, asked: startsAsk({ shown: 'ready', target: run, noAccess }) })).toBeNull()
    const denied = micVisualState({ permission: 'prompt', phase: 'fallback' })
    expect(denied).toBe('off')
    expect(holdKind({ shown: 'locked', target: denied, asked: true })).toBeNull()
  })

  it('настоящее состояние во время удержания — active (запись и decide() идут сразу), доступ первого запроса на момент тапа определяется по hasMicAccess', () => {
    for (const access of [{ permission: 'prompt' }, { permission: 'unavailable', flag: false }]) {
      expect(hasMicAccess(access)).toBe(false)
      expect(micVisualState({ ...access, phase: 'run' })).toBe('active')
    }
  })
})

// Нажатие кнопки в попапе: активация на экране стартует ПОСЛЕ закрытия попапа (340 мс) и короткой паузы — общая задержка ≈ 450–600 мс от нажатия
describe('активация после попапа (POPUP_DELAY_MS)', () => {
  const TAP = 5000
  const popupExit = Number(/const EXIT_MS = (\d+)/.exec(readFileSync(fileURLToPath(new URL('../../../app/hudPopupState.js', import.meta.url)), 'utf8'))[1])

  it('константа 450–600 мс и дольше закрытия попапа с запасом на паузу', () => {
    expect(POPUP_DELAY_MS).toBeGreaterThanOrEqual(450)
    expect(POPUP_DELAY_MS).toBeLessThanOrEqual(600)
    expect(POPUP_DELAY_MS).toBeGreaterThanOrEqual(popupExit + 100) // попап (340 мс) успевает уйти, потом ещё пауза
  })

  it('startsAfterPopup: только из показанного locked в active и если в прошлом рендере был попап; повторная попытка с круга (ready) — без удержания', () => {
    expect(startsAfterPopup({ shown: 'locked', target: 'active', wasPopup: true })).toBe(true)
    expect(startsAfterPopup({ shown: 'locked', target: 'active', wasPopup: false })).toBe(false)
    expect(startsAfterPopup({ shown: 'ready', target: 'active', wasPopup: true })).toBe(false)
    expect(startsAfterPopup({ shown: 'locked', target: 'off', wasPopup: true })).toBe(false)
    expect(startsAfterPopup({ shown: 'locked', target: 'ready', wasPopup: true })).toBe(false)
  })

  it('holdKind: locked → active удерживается и после попапа (afterPopup) без диалога; без попапа и без диалога — сразу, как раньше', () => {
    expect(holdKind({ shown: 'locked', target: 'active', afterPopup: true })).toBe('active')
    expect(holdKind({ shown: 'locked', target: 'active' })).toBeNull()
    expect(holdKind({ shown: 'ready', target: 'active', afterPopup: true })).toBeNull()
    expect(holdKind({ shown: 'locked', target: 'off', afterPopup: true })).toBeNull() // отказ — сразу
  })

  it('без системного диалога (доступ выдан / Android / вводный попап): ровно POPUP_DELAY_MS от нажатия, возврата в приложение не ждём — и на iPhone', () => {
    for (const ios of [false, true]) {
      expect(activationLeft({ afterPopup: true, ios, tapAt: TAP, readyAt: TAP, now: TAP })).toBe(POPUP_DELAY_MS)
      expect(activationLeft({ afterPopup: true, ios, tapAt: TAP, readyAt: TAP, now: TAP + 300 })).toBe(POPUP_DELAY_MS - 300)
      expect(activationLeft({ afterPopup: true, ios, tapAt: TAP, readyAt: TAP, now: TAP + POPUP_DELAY_MS })).toBe(0)
      expect(activationLeft({ afterPopup: true, ios, tapAt: TAP, readyAt: TAP, now: TAP + 50, visible: false })).toBe(POPUP_DELAY_MS - 50)
    }
  })

  it('первый запрос доступа после попапа: 700 мс от «открылся» (на iPhone — и от возврата), но не раньше нажатия + POPUP_DELAY_MS', () => {
    const OPENED = TAP + 4000
    expect(activationLeft({ asked: true, afterPopup: true, ios: true, tapAt: TAP, readyAt: OPENED, backAt: OPENED + 300, now: OPENED + 300 })).toBe(READY_DELAY_MS)
    expect(activationLeft({ asked: true, afterPopup: true, ios: false, tapAt: TAP, readyAt: OPENED, now: OPENED })).toBe(READY_DELAY_MS)
    // диалог подтвердили мгновенно (авторазрешение): 700 мс от «открылся» всё равно длиннее паузы после попапа — ждём их
    expect(activationLeft({ asked: true, afterPopup: true, ios: false, tapAt: TAP, readyAt: TAP + 10, now: TAP + 10 })).toBe(READY_DELAY_MS)
    // и если «открылся» раньше, чем пройдёт пауза после попапа, пауза от нажатия не сокращается
    expect(activationLeft({ asked: true, afterPopup: true, ios: false, tapAt: TAP, readyAt: TAP - 400, now: TAP })).toBe(POPUP_DELAY_MS)
    // приложение скрыто на iPhone — ждём возврата
    expect(activationLeft({ asked: true, afterPopup: true, ios: true, tapAt: TAP, readyAt: OPENED, now: OPENED + 10, visible: false })).toBeNull()
  })

  it('без попапа (asked, как раньше) и ready — прежние числа; notBefore по умолчанию ничего не меняет', () => {
    expect(activationLeft({ asked: true, ios: false, readyAt: 1000, now: 1000 })).toBe(READY_DELAY_MS)
    expect(readyDelayLeft({ ios: false, readyAt: 1000, now: 1000, delay: 100 })).toBe(100)
    expect(readyDelayLeft({ ios: false, readyAt: 1000, now: 1000, delay: 100, notBefore: 1400 })).toBe(400)
  })
})
