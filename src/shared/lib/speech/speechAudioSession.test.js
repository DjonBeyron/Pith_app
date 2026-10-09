import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeRec, alt, setup } from './speechTestKit.js'
import { createAudioSession, degradeStrategy, SESSION_RESET_MS } from './speechAudioSession.js'
import { STRATEGIES, resolveStrategy } from './speechRestart.js'
import { DEAF_WINDOW_MS, DEAF_RETRY_PAUSE_MS } from './speechPolicy.js'
import { _resetSoundLog } from '../soundLog.js'

beforeEach(() => { vi.useFakeTimers(); _resetSoundLog() })
afterEach(() => vi.useRealTimers())

// Подставной navigator.audioSession: все операции — в общий журнал вместе с start() распознавателя (проверяем ПОРЯДОК)
function rig(extra = {}, { supported = true, failSet = false } = {}) {
  const ops = []
  let type = 'auto'
  const audioSession = {
    supported: () => supported,
    current: () => type,
    set(t) { if (failSet) return false; ops.push(`set:${t}`); type = t; return true },
  }
  const createRecognition = () => { const r = new FakeRec(); const st = r.start.bind(r); r.start = () => { ops.push('start'); st() }; return r }
  const s = setup({ audioSession, createRecognition, ...extra })
  return { ...s, ops, type: () => type }
}
const okRun = async (s, i = 0) => {
  s.tap()
  const r = s.rec(i)
  r.onaudiostart(); r.onsoundstart(); r.onresult({ results: [alt('I am here')] }); r.onend()
  await s.tick(0)
}

describe('createAudioSession: feature-detect и защита от исключений', () => {
  it('нет navigator.audioSession → supported() false, set() false, ничего не падает', () => {
    const s = createAudioSession({ nav: {} })
    expect(s.supported()).toBe(false)
    expect(s.current()).toBe(null)
    expect(s.set('play-and-record')).toBe(false)
    expect(createAudioSession({ nav: null }).supported()).toBe(false)
  })
  it('есть API: читает и пишет type; бросающий сеттер → false', () => {
    const nav = { audioSession: { type: 'auto' } }
    const s = createAudioSession({ nav })
    expect(s.supported()).toBe(true)
    expect(s.set('play-and-record')).toBe(true)
    expect(nav.audioSession.type).toBe('play-and-record')
    expect(s.current()).toBe('play-and-record')
    const bad = createAudioSession({ nav: { audioSession: { get type() { return 'auto' }, set type(v) { throw new Error(`nope ${v}`) } } } })
    expect(bad.set('x')).toBe(false)
  })
  it('degradeStrategy: S6/S7 без API превращаются в S3, id сохраняется; S1 и стратегии с API не трогаются', () => {
    const s6 = resolveStrategy('S6')
    expect(degradeStrategy(s6, true)).toBe(s6)
    expect(degradeStrategy(s6, false)).toMatchObject({ id: 'S6', pauseMs: 900, waitEnd: true, audioSession: null, audioReset: false, degraded: true })
    expect(degradeStrategy(resolveStrategy('S7'), false)).toMatchObject({ id: 'S7', pauseMs: STRATEGIES.S3.pauseMs, degraded: true })
    const s1 = resolveStrategy('S1')
    expect(degradeStrategy(s1, false)).toBe(s1)
  })
})

describe('S6: play-and-record ДО start(), возврат auto после end', () => {
  it('порядок: set:play-and-record → start (синхронно в тапе); после end — set:auto', async () => {
    const s = rig({ getRestart: () => 'S6' })
    s.tap()
    expect(s.ops).toEqual(['set:play-and-record', 'start'])
    expect(s.type()).toBe('play-and-record')
    s.rec(0).onaudiostart(); s.rec(0).onsoundstart(); s.rec(0).onresult({ results: [alt('I am here')] }); s.rec(0).onend()
    await s.tick(0)
    expect(s.ops).toEqual(['set:play-and-record', 'start', 'set:auto'])
    expect(s.type()).toBe('auto')
    expect(s.entries[0]).toMatchObject({ strategy: 'S6', audioSession: 'auto→play-and-record' })
  })

  it('второй запуск: пауза 700 мс после end, снова set:play-and-record перед start, снова auto после', async () => {
    const s = rig({ getRestart: () => 'S6' })
    await okRun(s)
    s.ops.length = 0
    s.tap()
    expect(FakeRec.all).toHaveLength(1) // пауза 700 мс
    await s.tick(701)
    expect(s.ops).toEqual(['set:play-and-record', 'start'])
  })

  it('ошибка, «Стоп», reset и pagehide возвращают auto', async () => {
    const s = rig({ getRestart: () => 'S6' })
    s.tap()
    s.rec(0).onerror({ error: 'not-allowed' })
    await s.tick(0)
    expect(s.type()).toBe('auto')
    s.rec(0).onend()
    await s.tick(1000)
    s.tap()
    expect(s.type()).toBe('play-and-record')
    s.ctrl.stop(); s.rec(1).onend()
    await s.tick(1000)
    expect(s.type()).toBe('auto')
    s.tap()
    expect(s.type()).toBe('play-and-record')
    s.ctrl.reset() // уход со страницы / pagehide
    expect(s.type()).toBe('auto')
  })

  it('новая попытка внутри захода: прежняя сессия возвращена и выставлена заново', async () => {
    const s = rig({ getRestart: () => 'S6' })
    s.tap()
    s.rec(0).onerror({ error: 'network' })
    await s.tick(0)
    expect(s.ops.slice(-1)).toEqual(['set:auto'])
    s.rec(0).onend()
    await s.tick(3000)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.ops.filter(o => o === 'set:play-and-record')).toHaveLength(2)
    expect(s.type()).toBe('play-and-record')
  })

  it('S1 (без аудиосессии) тип не трогает, но читает его в журнал', async () => {
    const s = rig({ getRestart: () => 'S1' })
    await okRun(s)
    expect(s.ops.filter(o => o.startsWith('set:'))).toEqual([])
    expect(s.entries[0].audioSession).toBe('auto')
  })

  it('set() не удался — запись всё равно стартует, auto не «возвращаем», в журнале пометка', async () => {
    const s = rig({ getRestart: () => 'S6' }, { failSet: true })
    s.tap()
    expect(s.rec(0).started).toBe(true)
    s.rec(0).onerror({ error: 'not-allowed' })
    await s.tick(0)
    expect(s.entries[0].audioSession).toContain('не удалось')
  })
})

describe('S7: принудительный сброс — auto → 150 мс → play-and-record → start', () => {
  it('start на 150 мс позже тапа, порядок операций верный, в конце auto', async () => {
    const s = rig({ getRestart: () => 'S7' })
    s.tap()
    expect(s.ops).toEqual(['set:auto'])
    expect(s.rec(0).started).toBe(false)
    await s.tick(SESSION_RESET_MS - 1)
    expect(s.rec(0).started).toBe(false)
    await s.tick(1)
    expect(s.ops).toEqual(['set:auto', 'set:play-and-record', 'start'])
    expect(s.rec(0).started).toBe(true)
    s.rec(0).onaudiostart(); s.rec(0).onsoundstart(); s.rec(0).onresult({ results: [alt('I am here')] }); s.rec(0).onend()
    await s.tick(0)
    expect(s.type()).toBe('auto')
    expect(s.entries[0].audioSession).toBe('auto→auto→(150 мс)→play-and-record')
  })

  it('времена попытки отсчитываются от реального start(), а не от тапа: мгновенный audiostart после сброса всё ещё «глухой» (<120 мс)', async () => {
    const s = rig({ getRestart: () => 'S7' })
    s.tap()
    await s.tick(SESSION_RESET_MS)
    await s.tick(50)
    s.rec(0).onaudiostart()
    s.ctrl.stop(); s.rec(0).onend()
    await s.tick(0)
    expect(s.entries[0].msAudio).toBe(50)
  })

  it('«Стоп»/сброс в окне 150 мс: запись уже не стартует, auto возвращён', async () => {
    const s = rig({ getRestart: () => 'S7' })
    s.tap()
    s.ctrl.reset()
    await s.tick(500)
    expect(s.rec(0).started).toBe(false)
    expect(s.type()).toBe('auto')
  })
})

describe('нет navigator.audioSession: S6/S7 деградируют до S3 (паузы), ничего не падает', () => {
  it('S6 без API: пауза 900 мс как у S3, тип не ставится, в журнале пометка', async () => {
    const s = rig({ getRestart: () => 'S6' }, { supported: false })
    await okRun(s)
    s.tap()
    await s.tick(700)
    expect(FakeRec.all).toHaveLength(1) // у S6 пауза была бы 700 — здесь как у S3
    await s.tick(201)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.ops.filter(o => o.startsWith('set:'))).toEqual([])
    expect(s.entries[0].audioSession).toBe('нет API → как S3')
  })
  it('вообще без адаптера (audioSession не передан) — то же самое', async () => {
    const s = setup({ getRestart: () => 'S7' })
    await okRun(s)
    s.tap()
    await s.tick(901)
    expect(FakeRec.all).toHaveLength(2)
  })
})

describe('флаг модуля (getAudioSessionType) и глухой повтор', () => {
  it('модуль: стратегия M + флаг → play-and-record на время записи, без флага — не трогаем', async () => {
    let flag = null
    const s = rig({ getRestart: () => 'M', getAudioSessionType: () => flag })
    await okRun(s)
    expect(s.ops.filter(o => o.startsWith('set:'))).toEqual([])
    flag = 'play-and-record'
    await s.tick(700)
    s.ops.length = 0
    s.tap()
    expect(s.ops).toEqual(['set:play-and-record', 'start'])
  })

  it('глухая попытка → новый экземпляр + сброс (auto → 150 мс → play-and-record) + пауза 900 мс, deaf_retry в журнале; модуль без флага тоже', async () => {
    const s = rig({ getRestart: () => 'M' })
    await okRun(s)
    await s.tick(700)
    s.tap()
    s.rec(1).onaudiostart() // быстрый audiostart, звука нет
    await s.tick(DEAF_WINDOW_MS)
    expect(s.last().status).toBe('retrying')
    s.rec(1).onend() // abort() закрыл экземпляр
    s.ops.length = 0
    await s.tick(DEAF_RETRY_PAUSE_MS)
    expect(FakeRec.all).toHaveLength(3)
    expect(s.ops).toEqual(['set:auto']) // сброс начался, start ещё ждёт
    expect(s.rec(2).started).toBe(false)
    await s.tick(SESSION_RESET_MS)
    expect(s.ops).toEqual(['set:auto', 'set:play-and-record', 'start'])
    expect(s.entries.at(-1)).toMatchObject({ error: 'deaf', deaf: true })
    s.rec(2).onaudiostart(); s.rec(2).onsoundstart(); s.rec(2).onresult({ results: [alt('I am here')] }); s.rec(2).onend()
    await s.tick(0)
    expect(s.entries.at(-1)).toMatchObject({ deaf_retry: true, outcome: 'ok' })
    expect(s.entries.at(-1).audioSession).toContain('play-and-record')
    expect(s.type()).toBe('auto')
  })
})
