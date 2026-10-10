import { describe, it, expect } from 'vitest'
import { autoPopupWanted, autoPopupDelay, AUTO_POPUP_MS } from './sayAutoPopup.js'
import { decideMic } from './sayPermission.js'
import { micVisualState } from './sayMicState.js'

// Автопоказ попапа разрешения: решает только чистая функция; условия — те же, по которым тап на круг открыл бы попап
const base = { visible: true, closing: false, phase: 'idle', taps: 0, micState: 'locked', decision: { action: 'explain', kind: 'intro' } }

describe('autoPopupWanted', () => {
  it('locked + решение explain (любой вид) + панель видна + нажатий не было → показать', () => {
    for (const kind of ['full', 'short', 'intro']) expect(autoPopupWanted({ ...base, decision: { action: 'explain', kind } })).toBe(true)
  })

  it('не показываем: панель ещё/уже не видна, уходит, уже нажимали на круг', () => {
    expect(autoPopupWanted({ ...base, visible: false })).toBe(false)
    expect(autoPopupWanted({ ...base, closing: true })).toBe(false)
    expect(autoPopupWanted({ ...base, taps: 1 })).toBe(false)
  })

  it('не показываем: попап уже открыт, идёт запись, итог, неудача, запасной режим (off/fallback)', () => {
    for (const phase of ['explain', 'run', 'passed', 'failed', 'fallback']) expect(autoPopupWanted({ ...base, phase })).toBe(false)
  })

  it('не показываем: кнопка не locked (доступ есть и вводный попап видели)', () => {
    for (const micState of ['ready', 'active', 'done', 'off']) expect(autoPopupWanted({ ...base, micState })).toBe(false)
  })

  it('не показываем: решение не explain — запись пошла бы сразу (listen) или запасной режим (denied / Firefox / не поддерживается / «не могу говорить»)', () => {
    expect(autoPopupWanted({ ...base, decision: { action: 'listen' } })).toBe(false)
    for (const reason of ['denied', 'browser', 'unsupported', 'cant_speak']) expect(autoPopupWanted({ ...base, decision: { action: 'fallback', reason } })).toBe(false)
    expect(autoPopupWanted({ ...base, decision: null })).toBe(false)
  })

  it('сквозной критерий: первое открытие (доступа нет / вводный не видели) — да; отказ в настройках, Firefox — нет', () => {
    const run = (d, access) => autoPopupWanted({ ...base, micState: micVisualState({ ...access, phase: 'idle' }), decision: decideMic(d) })
    const sup = { supported: true, cantSpeak: false, denied: false, explained: false, micOk: false }
    expect(run({ ...sup, perm: 'prompt' }, { permission: 'prompt', introSeen: false })).toBe(true)
    expect(run({ ...sup, perm: 'granted', explained: true, introSeen: false }, { permission: 'granted', flag: true, introSeen: false })).toBe(true) // Android: доступ есть, вводный не видели
    expect(run({ ...sup, perm: 'denied' }, { permission: 'denied' })).toBe(false)
    expect(run({ ...sup, perm: 'prompt', browserBlocked: true }, { permission: 'prompt' })).toBe(false)
    expect(run({ ...sup, perm: 'granted', explained: true, introSeen: true }, { permission: 'granted', introSeen: true })).toBe(false) // всё уже видели
  })
})

describe('autoPopupDelay', () => {
  it('ждём ровно оставшееся до секунды после появления модуля; не меньше нуля', () => {
    expect(AUTO_POPUP_MS).toBe(1000)
    expect(autoPopupDelay(0)).toBe(1000)
    expect(autoPopupDelay(400)).toBe(600)
    expect(autoPopupDelay(1000)).toBe(0)
    expect(autoPopupDelay(5000)).toBe(0)
    expect(autoPopupDelay(-50)).toBe(1000)
  })
})
