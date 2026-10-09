import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeRec, alt, interimRes, setup } from './speechTestKit.js'
import { RETRY_PAUSE_MS, DEAF_WINDOW_MS, DEAF_RETRY_PAUSE_MS, planNext } from './speechPolicy.js'
import { isDeaf, isFastAudio, wantsDeafTimer } from './speechDeaf.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const withStrategy = id => setup({ getRestart: () => id })
// Один успешный заход: audiostart, результат, end
async function okRun(s) {
  s.tap()
  const r = s.rec(0)
  r.onaudiostart(); r.onsoundstart(); r.onresult({ results: [alt('I am here')] })
  r.onend()
  await s.tick(0)
}

describe('«глухая» сессия и авто-восстановление', () => {
  // успешная первая попытка → вторая: audiostart через 50 мс, звука нет
  async function deafSecond(s) {
    await okRun(s)
    await s.tick(1000)
    s.tap()
    const r = s.rec(1)
    await s.tick(50)
    r.onaudiostart()
    return r
  }

  it('нет звука DEAF_WINDOW_MS после мгновенного audiostart → конец, новый экземпляр с паузой 900 мс, метка deaf_retry', async () => {
    const s = withStrategy('S1')
    const r = await deafSecond(s)
    await s.tick(DEAF_WINDOW_MS + 5)
    expect(s.last()).toMatchObject({ status: 'retrying', notice: 'Микрофон не отвечает, пробуем ещё раз (2 из 3)…' })
    expect(r.aborted).toBeGreaterThan(0)
    expect(s.entries.at(-1)).toMatchObject({ error: 'deaf', deaf: true, last: false, run: 2 })
    await s.tick(DEAF_RETRY_PAUSE_MS - 30)
    expect(FakeRec.all).toHaveLength(2)
    await s.tick(30)
    expect(FakeRec.all).toHaveLength(3)
    expect(s.rec(2).started).toBe(true)
    s.rec(2).onaudiostart(); s.rec(2).onsoundstart(); s.rec(2).onresult({ results: [alt('I am here')] }); s.rec(2).onend()
    await s.tick(0)
    expect(s.last()).toMatchObject({ status: 'done', attempt: 2 })
    expect(s.entries.at(-1)).toMatchObject({ deaf_retry: true, outcome: 'ok', retry: 1, last: true })
    expect(s.entries.at(-1).deaf).toBeUndefined()
  })

  it('до двух раз подряд: вторая глухая тоже пересоздаётся, третья идёт обычным путём (8 с тишины) и ставит deafGiveUp', async () => {
    const s = withStrategy('S1')
    await deafSecond(s)
    await s.tick(DEAF_WINDOW_MS + DEAF_RETRY_PAUSE_MS + 20)
    expect(FakeRec.all).toHaveLength(3)
    s.rec(2).onaudiostart() // первый повтор тоже глухой
    await s.tick(DEAF_WINDOW_MS + DEAF_RETRY_PAUSE_MS + 20)
    expect(FakeRec.all).toHaveLength(4)
    s.rec(3).onaudiostart()
    await s.tick(DEAF_WINDOW_MS + 100)
    expect(s.last().status).toBe('listening') // третьего повтора нет: таймер не ставился
    expect(s.last().deafGiveUp).toBe(false)
    await s.tick(5000)
    expect(s.entries.at(-1)).toMatchObject({ error: 'silence', deaf: true, last: true, deaf_retry: true })
    expect(s.entries.filter(e => e.deaf_retry)).toHaveLength(2) // оба повтора помечены в журнале
    expect(s.last()).toMatchObject({ status: 'error', deafGiveUp: true })
  })

  it('следующее нажатие после сдавшегося восстановления снова считается «горячим»: глухая попытка пересоздаётся', async () => {
    const s = withStrategy('S1')
    await deafSecond(s)
    await s.tick(DEAF_WINDOW_MS + DEAF_RETRY_PAUSE_MS + 20)
    s.rec(2).onaudiostart()
    await s.tick(DEAF_WINDOW_MS + DEAF_RETRY_PAUSE_MS + 20)
    s.rec(3).onaudiostart()
    await s.tick(DEAF_WINDOW_MS + 6000)
    expect(s.last().deafGiveUp).toBe(true)
    s.tap()
    expect(s.last().deafGiveUp).toBe(false) // новое нажатие очищает сообщение
    s.rec(4).onaudiostart()
    await s.tick(DEAF_WINDOW_MS + 5)
    expect(s.last().status).toBe('retrying')
  })

  it('успешный повтор не ставит deafGiveUp', async () => {
    const s = withStrategy('S1')
    await deafSecond(s)
    await s.tick(DEAF_WINDOW_MS + DEAF_RETRY_PAUSE_MS + 20)
    s.rec(2).onaudiostart(); s.rec(2).onsoundstart(); s.rec(2).onresult({ results: [alt('I am here')] }); s.rec(2).onend()
    await s.tick(0)
    expect(s.last()).toMatchObject({ status: 'done', deafGiveUp: false })
  })

  it('звук (soundstart) в окне — сессия не глухая, таймер снят', async () => {
    const s = withStrategy('S1')
    const r = await deafSecond(s)
    await s.tick(1000)
    r.onsoundstart()
    await s.tick(DEAF_WINDOW_MS)
    expect(s.last().status).toBe('listening')
  })

  it('прошлая попытка НЕ была успешной — авто-восстановления нет (обычные повторы)', async () => {
    const s = withStrategy('S1')
    s.tap()
    s.rec(0).onaudiostart() // первая попытка: быстрый audiostart, но успеха до неё не было
    await s.tick(DEAF_WINDOW_MS + 100)
    expect(s.last().status).toBe('listening')
  })

  it('нормальный audiostart (450 мс) — не глухая', async () => {
    const s = withStrategy('S1')
    await okRun(s)
    await s.tick(1000)
    s.tap()
    await s.tick(450)
    s.rec(1).onaudiostart()
    await s.tick(DEAF_WINDOW_MS + 100)
    expect(s.last().status).toBe('listening')
  })

  it('«Стоп» раньше 4 с — не глухая (просто не успел сказать)', async () => {
    const s = withStrategy('S1')
    await okRun(s)
    await s.tick(1000)
    s.tap()
    s.rec(1).onaudiostart()
    await s.tick(1000)
    s.ctrl.stop(); s.rec(1).onend()
    await s.tick(0)
    expect(s.entries.at(-1)).toMatchObject({ outcome: 'stopped' })
    expect(s.entries.at(-1).deaf).toBeUndefined()
  })

  it('«Стоп» после 4+ с без звука (как в журнале пользователя: исход stopped, result —) — метка deaf, но без авто-повтора', async () => {
    const s = setup({ getRestart: () => 'S1' })
    await okRun(s)
    await s.tick(1000)
    s.tap()
    s.rec(1).onaudiostart()
    await s.tick(DEAF_WINDOW_MS - 50)
    s.ctrl.stop() // пользователь сдался чуть раньше таймера глухой сессии
    await s.tick(100)
    s.rec(1).onend()
    await s.tick(0)
    expect(s.entries.at(-1)).toMatchObject({ outcome: 'stopped', deaf: true })
    expect(FakeRec.all).toHaveLength(2)
  })

  it('метки журнала: strategy, msSound, gapMs, reused', async () => {
    const s = withStrategy('S2')
    await okRun(s)
    await s.tick(10)
    expect(s.entries[0]).toMatchObject({ strategy: 'S2', msSound: expect.any(Number), gapMs: null })
    s.tap()
    await s.tick(1)
    expect(FakeRec.all).toHaveLength(1)
    s.rec(0).onaudiostart(); s.rec(0).onresult({ results: [alt('again')] }); s.rec(0).onend()
    await s.tick(0)
    expect(s.entries.at(-1)).toMatchObject({ reused: true, gapMs: expect.any(Number) })
  })
})

describe('служебные события в history контроллера', () => {
  it('soundstart/speechstart/speechend/soundend/audioend пишутся как {t, kind} рядом с interim; повторы подряд не дублируются', () => {
    const s = setup()
    s.tap()
    const r = s.rec(0)
    r.onaudiostart(); r.onsoundstart(); r.onspeechstart()
    r.onresult({ results: [interimRes('I am')] })
    r.onspeechend(); r.onsoundend(); r.onaudioend()
    r.onresult({ results: [alt('I am here')] })
    const h = s.last().history
    expect(h.map(x => x.kind ?? x.text)).toEqual(['soundstart', 'speechstart', 'I am', 'speechend', 'soundend', 'audioend', 'I am here'])
    expect(h.every(x => typeof x.t === 'number')).toBe(true)
    expect(h.at(-1).final).toBe(true)
  })
})

describe('planNext', () => {
  it('ошибка тишины → повтор; «глухая» после успешной → повтор с большей паузой и пометкой; не больше трёх попыток', () => {
    expect(planNext({ outcome: 'error', error: 'silence', retry: 0 })).toMatchObject({ kind: 'retry', viaDeaf: false, pause: RETRY_PAUSE_MS })
    expect(planNext({ outcome: 'error', error: 'silence', retry: 0, deaf: true, wasOk: true })).toMatchObject({ kind: 'retry', viaDeaf: true, pause: DEAF_RETRY_PAUSE_MS, lastError: 'no-speech' })
    expect(planNext({ outcome: 'error', error: 'silence', retry: 0, deaf: true, wasOk: true, deafRetries: 2 }).viaDeaf).toBe(false)
    expect(planNext({ outcome: 'error', error: 'silence', retry: 1, deaf: true, wasOk: true, deafRetries: 1 }).viaDeaf).toBe(true) // второй повтор разрешён
    expect(planNext({ outcome: 'error', error: 'silence', retry: 2, deaf: true, wasOk: true }).kind).toBe('final')
    expect(planNext({ outcome: 'stopped', error: null, retry: 0, deaf: true, wasOk: true }).kind).toBe('final')
  })
})

describe('isDeaf / wantsDeafTimer (чистые)', () => {
  it('быстрый audiostart (<120 мс) и нет звука — глухая; нормальные 450+ мс или был звук — нет', () => {
    expect(isFastAudio(43)).toBe(true)
    expect(isFastAudio(120)).toBe(false)
    expect(isDeaf({ msAudio: 57, heard: false })).toBe(true)
    expect(isDeaf({ msAudio: 450, heard: false })).toBe(false)
    expect(isDeaf({ msAudio: 57, heard: true })).toBe(false)
    expect(isDeaf({ msAudio: null, heard: false })).toBe(false)
  })
  it('если остановил сам пользователь — глухая только когда слушал не меньше окна', () => {
    expect(isDeaf({ msAudio: 50, heard: false, userStop: true, listenedMs: 3000 })).toBe(false)
    expect(isDeaf({ msAudio: 50, heard: false, userStop: true, listenedMs: DEAF_WINDOW_MS })).toBe(true)
  })
  it('таймер глухой — только после успешной/глухой попытки, не больше двух раз и пока есть куда повторять', () => {
    const base = { hot: true, retries: 0, msAudio: 50, retry: 0 }
    expect(wantsDeafTimer(base)).toBe(true)
    expect(wantsDeafTimer({ ...base, hot: false })).toBe(false)
    expect(wantsDeafTimer({ ...base, retries: 1, retry: 1 })).toBe(true) // второе восстановление подряд
    expect(wantsDeafTimer({ ...base, retries: 2 })).toBe(false)
    expect(wantsDeafTimer({ ...base, retry: 2 })).toBe(false)
    expect(wantsDeafTimer({ ...base, msAudio: 600 })).toBe(false)
  })
})
