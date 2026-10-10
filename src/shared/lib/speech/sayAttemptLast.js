// Что было на ПОСЛЕДНЕЙ попытке «Сказать фразу» в этом запуске приложения — для админской диагностики прямо в уроке (SayAdminDiag): какой движок, что услышали,
// сколько ждали до первых слов и до итога, почему попытка остановилась. Записывает sayRecognizer.js (через него идут виды обоих движков); звук сюда не попадает, текст — только админу в диагностике.
// Причина остановки выводится по виду: 'tap' — ученик нажал «стоп» (stop() до итога), 'auto' — итог пришёл сам (пауза в речи / авто-стоп / потолок времени), 'silence' — ничего не услышали,
// 'denied' — отказ микрофона, 'error' — сбой движка (код в error), 'interrupted' — сброс (свернули приложение / ушли из модуля). Модульная переменная с подпиской, как sayEngineLast.js.
export const STOP_TEXT = {
  tap: 'остановили нажатием', auto: 'остановилась сама (пауза в речи / авто-стоп)', silence: 'тишина: ничего не услышали',
  denied: 'микрофон не разрешён', error: 'ошибка движка', interrupted: 'прервана (свернули приложение или ушли)',
}

export function createAttemptLog({ perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), wall = Date.now } = {}) {
  let last = null
  let t0 = 0
  let tapped = false
  const subs = new Set()
  const emit = () => subs.forEach(fn => { try { fn() } catch { /* подписчик не должен ломать попытку */ } })
  const ms = () => Math.max(0, Math.round(perf() - t0))
  const patch = p => { last = { ...last, ...p }; emit() }
  const finish = (stop, extra = {}) => patch({ status: stop === 'auto' || stop === 'tap' ? 'done' : 'failed', stop, resultMs: ms(), ...extra })

  return {
    /** Новая попытка: pick — результат pickEngine ({engine, reason}) */
    begin(pick) {
      t0 = perf(); tapped = false
      last = { n: (last?.n ?? 0) + 1, engine: pick?.engine ?? 'system', reason: pick?.reason ?? '', startedAt: wall(), status: 'run', heard: '', micMs: null, firstWordMs: null, resultMs: null, stop: null, error: null }
      emit()
    },
    /** Ученик остановил запись (stop() до итога) */
    userStop() { if (last?.status === 'run') tapped = true },
    /** Вид движка name ('vosk' | 'system') — тот же, что идёт в sayFlow */
    view(name, v) {
      if (!last || last.status !== 'run' || last.engine !== name || !v) return
      if (v.status === 'idle') { finish('interrupted'); return }
      if (v.status === 'listening' && last.micMs == null) patch({ micMs: ms() })
      if (v.interim && last.firstWordMs == null) patch({ firstWordMs: ms(), heard: v.interim })
      else if (v.interim && v.interim !== last.heard) patch({ heard: v.interim })
      if (v.status === 'done') finish(tapped ? 'tap' : 'auto', { heard: v.final?.text || v.lastInterim || last.heard, firstWordMs: last.firstWordMs ?? ms() })
      else if (v.status === 'error') {
        const code = v.error || 'error'
        const stop = code === 'not-allowed' ? 'denied' : code === 'no-speech' || code === 'silence' ? 'silence' : 'error'
        finish(stop, { error: code, heard: v.lastInterim || last.heard })
      }
    },
    get: () => last,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
  }
}

export const sayAttemptLog = createAttemptLog()
