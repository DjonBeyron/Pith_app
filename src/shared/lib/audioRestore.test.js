import { describe, it, expect, vi, beforeEach } from 'vitest'
import { restoreAudio, installAudioRestore } from './audioRestore.js'
import { holdSilence, holdSoundQuiet, _resetSoundQuiet } from './soundQuiet.js'

const mkSession = type => ({ type, current: () => type, set(t) { this.type = t; return true } })
const base = (over = {}) => ({ session: mkSession('auto'), unlock: vi.fn(), lessonOpen: () => true, busy: () => false, ctxState: () => 'running', log: vi.fn(), ...over })

describe('restoreAudio: звук после микрофона', () => {
  beforeEach(() => _resetSoundQuiet())

  it("остался 'play-and-record' → возвращаем 'auto'", () => {
    const d = base({ session: mkSession('play-and-record') })
    const r = restoreAudio(d)
    expect(d.session.type).toBe('auto')
    expect(r.reset).toBe(true)
  })

  it("уже 'auto' или нет API → ничего не трогаем", () => {
    const d = base()
    expect(restoreAudio(d).reset).toBe(false)
    const none = base({ session: { current: () => null, set: vi.fn() } })
    restoreAudio(none)
    expect(none.session.set).not.toHaveBeenCalled()
  })

  it("контекст звуков suspended/interrupted в уроке → unlock (resume); running или урок закрыт → нет", () => {
    const a = base({ ctxState: () => 'interrupted' }); restoreAudio(a); expect(a.unlock).toHaveBeenCalledTimes(1)
    const b = base({ ctxState: () => 'suspended' }); restoreAudio(b); expect(b.unlock).toHaveBeenCalledTimes(1)
    const c = base(); restoreAudio(c); expect(c.unlock).not.toHaveBeenCalled()
    const d = base({ ctxState: () => 'suspended', lessonOpen: () => false }); restoreAudio(d); expect(d.unlock).not.toHaveBeenCalled()
  })

  it('микрофон ещё занят → пропуск без изменений', () => {
    const d = base({ session: mkSession('play-and-record'), busy: () => true })
    expect(restoreAudio(d).skipped).toBe(true)
    expect(d.session.type).toBe('play-and-record')
  })

  it('installAudioRestore срабатывает, когда закрылось ПОСЛЕДНЕЕ удержание (окно записи и полная тишина)', () => {
    const d = base({ session: mkSession('play-and-record') })
    const off = installAudioRestore({ session: d.session, unlock: d.unlock, lessonOpen: () => false, ctxState: () => 'running', log: d.log }) // busy — настоящий isMicBusy
    const relQuiet = holdSoundQuiet()
    const relSilence = holdSilence('admin-voice')
    relQuiet()
    expect(d.session.type).toBe('play-and-record') // тишина ещё держится
    relSilence()
    expect(d.session.type).toBe('auto')
    off()
  })
})
