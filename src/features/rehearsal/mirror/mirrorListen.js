// «Дубль и зеркало»: слова с таймингами для дубля. createWordListener игры («Повтори за диктором») stats.words наружу НЕ отдаёт (только счёт и «что услышал»), поэтому дубль слушает напрямую
// через voskEngine.startListening на том же потоке игры (второго микрофона нет) и собирает stats.words (СЫРЫЕ слова Vosk: { word, conf, start, end } в секундах).
// Vosk закрывает заход на паузе в речи (эндпойнт) — а долгая пауза внутри фразы как раз то, что мы меряем: после итога сразу начинается следующий заход, а время его слов сдвигается на момент
// старта захода от начала дубля. Затвор тишины ВЫКЛЮЧЕН (gate: false): он вырезает паузы из звука и сжал бы тайминги. Нет модели — { ok: false, reason: 'no-model' }, слов нет.
import { voskRuntime } from '../../../shared/lib/vosk/voskRuntime.js'
import { startListening } from '../../../shared/lib/vosk/voskEngine.js'
import { targetGrammar } from '../../player/modules/rotate-phone/wordLaneMatch.js'

const STOP_WAIT_MS = 1500   // после stop() ждём итог не дольше (Vosk доигрывает хвост), потом отдаём что есть
const MIN_RUN_MS = 800      // меньше времени до потолка — новый заход не начинаем

/**
 * listenTake({ chunks, stream, maxMs = 6000 }) → { done: Promise<{ ok, reason?, words (секунды от старта дубля), text }>, stop(), cancel() }. Зависимости (runtime, listen, now, setTimer, clearTimer) подставляются в тестах.
 */
export function listenTake({ chunks, stream, maxMs = 6000, runtime = voskRuntime, listen = startListening, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const model = runtime.getModel?.()
  const grammar = model ? targetGrammar(chunks, Math.max(1, chunks.length)) : null
  const t0 = now()
  const words = []
  const texts = []
  let handle = null
  let stopped = false
  let finished = false
  let waitTimer = 0
  let resolveDone = () => {}
  const done = new Promise(resolve => { resolveDone = resolve })
  const finish = (extra = {}) => {
    if (finished) return
    finished = true
    clearTimer(waitTimer)
    resolveDone({ ok: true, words, text: texts.join(' ').trim(), ...extra })
  }
  if (!model || !grammar) { finish({ ok: false, reason: 'no-model' }); return { done, stop() {}, cancel() {} } }

  const run = () => {
    const left = maxMs - (now() - t0)
    if (stopped || left < MIN_RUN_MS) { finish(); return }
    const s0 = now()
    const cb = {
      onPartial() {},
      onResult(text, stats) {
        const off = (s0 - t0 + (Number(stats?.audioStartMs) || 0)) / 1000 // слова захода отсчитаны от его первого звука — переводим к началу дубля
        for (const w of stats?.words ?? []) words.push({ ...w, start: Number(w.start) + off, end: Number(w.end) + off })
        if (text) texts.push(text)
        handle = null
        run()
      },
      onError(msg) { finish({ ok: false, reason: String(msg || 'error') }) },
    }
    Promise.resolve()
      .then(() => listen(model, grammar, cb, { maxMs: left, stream: stream ?? undefined, gate: false, chunk: 2048 }))
      .then(h => { if (finished) { try { h?.cancel() } catch { /* уже свободен */ } return } handle = h; if (stopped) h.stop() }, e => finish({ ok: false, reason: e?.name || 'mic' }))
  }
  run()

  return {
    done,
    /** Конец дубля: просим итог текущего захода (слова последнего куска речи) и закрываем */
    stop() {
      if (stopped) return
      stopped = true
      if (!handle) { finish(); return }
      try { handle.stop() } catch { finish(); return }
      waitTimer = setTimer(() => { try { handle?.cancel() } catch { /* уже свободен */ } finish() }, STOP_WAIT_MS)
    },
    cancel() { stopped = true; try { handle?.cancel() } catch { /* уже свободен */ } finish({ ok: false, reason: 'cancelled' }) },
  }
}
