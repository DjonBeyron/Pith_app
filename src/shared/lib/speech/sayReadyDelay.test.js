import { describe, it, expect } from 'vitest'
import { READY_DELAY_MS, holdsReady, readyDelayLeft } from './sayReadyDelay.js'
import { micVisualState } from './sayMicState.js'
import { createSayPermission, MIC_GRANTED_KEY, INTRO_SEEN_KEY } from './sayPermission.js'

// Видимый переход locked → ready откладывается ТОЛЬКО на экране; настоящее состояние (micVisualState, decide()) меняется сразу.
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const STATES = ['locked', 'ready', 'active', 'done', 'off']

describe('holdsReady — какой переход задерживается', () => {
  it('только показанный locked → настоящий ready; остальные пары — без удержания', () => {
    for (const shown of STATES) for (const target of STATES) {
      expect(holdsReady({ shown, target }), `${shown} → ${target}`).toBe(shown === 'locked' && target === 'ready')
    }
  })

  it('пока Permissions API не ответил (settled=false) — удержания нет: ready, пришедший с первым ответом при открытии модуля, показывается сразу', () => {
    expect(holdsReady({ shown: 'locked', target: 'ready', settled: false })).toBe(false)
    expect(holdsReady({ shown: 'locked', target: 'ready', settled: true })).toBe(true)
  })

  it('уже выданный доступ при монтировании: показано = настоящему (ready → ready) — задержки нет; отзыв доступа (ready → locked / off) и запись (locked → active) — сразу', () => {
    expect(holdsReady({ shown: 'ready', target: 'ready' })).toBe(false)
    expect(holdsReady({ shown: 'ready', target: 'locked' })).toBe(false)
    expect(holdsReady({ shown: 'ready', target: 'off' })).toBe(false)
    expect(holdsReady({ shown: 'locked', target: 'active' })).toBe(false)
    expect(holdsReady({ shown: 'locked', target: 'off' })).toBe(false)
    expect(holdsReady({ shown: 'locked', target: 'locked' })).toBe(false)
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
    expect(holdsReady({ shown: before, target: after })).toBe(true)  // а вот КАРТИНКА задерживается
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
    expect(holdsReady({ shown: 'ready', target })).toBe(false)
    expect(holdsReady({ shown: 'ready', target: micVisualState({ phase: 'fallback' }) })).toBe(false) // off — сразу
  })

  it('при монтировании с уже выданным доступом: настоящий ready, показанное стартует равным ему — удержания нет', () => {
    const target = micVisualState({ permission: 'granted', phase: 'idle' })
    expect(target).toBe('ready')
    expect(holdsReady({ shown: target, target })).toBe(false)
  })
})
