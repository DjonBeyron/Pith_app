import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeRec, alt, setup } from './speechTestKit.js'
import { logSound, soundProbe, _resetSoundLog } from '../soundLog.js'

beforeEach(() => { vi.useFakeTimers(); _resetSoundLog() })
afterEach(() => vi.useRealTimers())

const rig = extra => { FakeRec.all = []; return setup(extra) }

describe('журнал: звуки страницы до записи и во время неё (audioBefore / audioDuring)', () => {
  const sounds = soundProbe

  it('за 6 с до старта: unlock-wav×2, audio-play — пишется в запись; старше окна не считается', async () => {
    const s = rig({ getRestart: () => 'S1', sounds })
    logSound('audio-play', 'old', Date.now() - 7000)
    logSound('unlock-wav', 'wav', Date.now() - 340)
    logSound('unlock-wav', 'wav', Date.now() - 300)
    logSound('audio-play', 'message-in', Date.now() - 200)
    s.tap()
    s.rec(0).onaudiostart(); s.rec(0).onsoundstart(); s.rec(0).onresult({ results: [alt('I am here')] }); s.rec(0).onend()
    await s.tick(0)
    expect(s.entries[0]).toMatchObject({ audioBefore: 'unlock-wav×2, audio-play', audioAgo: 200, audioDuring: '' })
  })

  it('тишина перед записью → пустая строка; звук во время записи → audioDuring', async () => {
    const s = rig({ getRestart: () => 'S1', sounds })
    s.tap()
    await s.tick(300)
    logSound('audio-play', 'xp-gain')
    s.rec(0).onaudiostart(); s.rec(0).onsoundstart(); s.rec(0).onresult({ results: [alt('I am here')] }); s.rec(0).onend()
    await s.tick(0)
    expect(s.entries[0]).toMatchObject({ audioBefore: '', audioAgo: null, audioDuring: 'audio-play' })
  })

  it('без sounds поля не пишутся (модуль)', async () => {
    const s = rig({ getRestart: () => 'S1' })
    s.tap()
    s.rec(0).onaudiostart(); s.rec(0).onsoundstart(); s.rec(0).onresult({ results: [alt('I am here')] }); s.rec(0).onend()
    await s.tick(0)
    expect(s.entries[0].audioBefore).toBeUndefined()
    expect(s.entries[0].audioDuring).toBeUndefined()
  })
})
