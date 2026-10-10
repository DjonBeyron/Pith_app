import { describe, it, expect } from 'vitest'
import { createAttemptLog, STOP_TEXT } from './sayAttemptLast.js'
import { emptyView } from './speechView.js'

// Журнал последней попытки для диагностики: движок, что услышали, тайминги, причина остановки
function make() {
  let t = 0
  const log = createAttemptLog({ perf: () => t, wall: () => 1700000000000 })
  const v = patch => ({ ...emptyView, ...patch })
  return { log, v, at: ms => { t = ms } }
}

describe('sayAttemptLast: последняя попытка', () => {
  it('до попыток — null; begin заводит запись и оповещает подписчиков; отписка работает', () => {
    const { log } = make()
    let n = 0
    const off = log.subscribe(() => { n++ })
    expect(log.get()).toBe(null)
    log.begin({ engine: 'vosk', reason: 'ready' })
    expect(log.get()).toMatchObject({ n: 1, engine: 'vosk', reason: 'ready', status: 'run', startedAt: 1700000000000, heard: '', firstWordMs: null })
    expect(n).toBe(1)
    off(); log.begin({ engine: 'system', reason: 'no-model' })
    expect(n).toBe(1); expect(log.get().n).toBe(2)
  })
  it('успех сам: микрофон открыт → первые слова → итог; причина «остановилась сама»', () => {
    const { log, v, at } = make()
    log.begin({ engine: 'vosk', reason: 'ready' })
    at(300); log.view('vosk', v({ status: 'listening' }))
    at(1200); log.view('vosk', v({ status: 'listening', interim: 'i have' }))
    at(1900); log.view('vosk', v({ status: 'listening', interim: 'i have two cats' }))
    at(2800); log.view('vosk', v({ status: 'done', final: { text: 'i have two cats', confidence: 0.9 }, lastInterim: 'i have two cats' }))
    expect(log.get()).toMatchObject({ status: 'done', stop: 'auto', micMs: 300, firstWordMs: 1200, resultMs: 2800, heard: 'i have two cats' })
    expect(STOP_TEXT.auto).toBeTruthy()
  })
  it('нажатие «стоп» до итога → причина «остановили нажатием»', () => {
    const { log, v, at } = make()
    log.begin({ engine: 'system', reason: 'no-model' })
    at(500); log.view('system', v({ status: 'listening', interim: 'hello' }))
    log.userStop()
    at(900); log.view('system', v({ status: 'done', final: { text: 'hello' } }))
    expect(log.get()).toMatchObject({ status: 'done', stop: 'tap', heard: 'hello' })
  })
  it('тишина / отказ микрофона / сбой движка — разные причины, код ошибки сохраняется; слышали что-то — остаётся в heard', () => {
    for (const [error, stop] of [['no-speech', 'silence'], ['not-allowed', 'denied'], ['vosk-error', 'error'], ['network', 'error']]) {
      const { log, v, at } = make()
      log.begin({ engine: 'vosk', reason: 'ready' })
      at(700); log.view('vosk', v({ status: 'error', error, lastInterim: 'hm' }))
      expect(log.get(), error).toMatchObject({ status: 'failed', stop, error, resultMs: 700, heard: 'hm' })
      expect(STOP_TEXT[stop]).toBeTruthy()
    }
  })
  it('сброс (idle) посреди попытки → «прервана»; виды чужого движка и после конца попытки игнорируются', () => {
    const { log, v } = make()
    log.begin({ engine: 'vosk', reason: 'ready' })
    log.view('system', v({ status: 'done', final: { text: 'x' } })) // чужой движок
    expect(log.get().status).toBe('run')
    log.view('vosk', v({ status: 'idle' }))
    expect(log.get()).toMatchObject({ status: 'failed', stop: 'interrupted' })
    log.view('vosk', v({ status: 'done', final: { text: 'late' } })) // после конца
    expect(log.get().stop).toBe('interrupted')
  })
  it('итог без interim: «до первых слов» равно времени итога', () => {
    const { log, v, at } = make()
    log.begin({ engine: 'system', reason: 'mode-system' })
    at(1500); log.view('system', v({ status: 'done', final: { text: 'ok' } }))
    expect(log.get()).toMatchObject({ firstWordMs: 1500, resultMs: 1500 })
  })
})
