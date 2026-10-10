// Тонкий адаптер «Vosk как распознаватель» для модуля «Сказать фразу»: тот же интерфейс, что у speechController (start / stop / reset / isAudioActive) и те же «виды» (view)
// на выходе — поэтому sayFlow, оценка (judgeRun: speechMatch / strict / threshold / firstSeenRule), подсказки, реплика ученика и «Я не могу говорить» работают как с системным движком.
//  • start({reference, lang, data}) вызывать СИНХРОННО в тапе: getUserMedia запускается тут же (жест), без await перед ним. Грамматика — из полей шага (sayVoskGrammar.js).
//  • view: starting → listening (микрофон открыт, звук пошёл) → done (есть текст) | error (no-speech: тишина или всё ниже порога/[unk]; not-allowed; audio-capture; no-start; vosk-error).
//    interim / lastInterim — partial; final — итог { text, confidence }; history — [{t, text, final?}] и событие конца речи {t, kind:'speechend'} для правила «первое увиденное».
//    lastInterim в итоге = текст итога: Vosk с закрытым словарём не «домысливает» слова языковой моделью, консенсус interim+final тут не нужен, а отставший на слово partial не должен
//    отбрасывать последнее слово в «Строго». Пауза «первого увиденного» (мелькание ошибочной формы) по-прежнему считается по истории partial.
//  • Слова с уверенностью ниже VOSK_MIN_CONF и [unk] в текст не идут (voskResult.js); последнее слово эталона проверяется мягче (VOSK_TAIL_MIN_CONF). Сырой результат (слова, уверенность, что отброшено) уходит в view.raw — для диагностики админа.
//  • Остановка: авто-стоп (услышано хоть слово и текст не менялся SAY_AUTOSTOP_MS = 2,5 с — медленная речь с паузами не обрывается; вся фраза уже услышана — всего SAY_FULL_MS), потолок SAY_MAX_MS,
//    тишина SAY_SILENCE_MS без единого слова, тап по кругу (stop()). Эндпойнтер самого Vosk (0,5–2 с паузы) настроить нельзя — движок не отдаёт ему долгую тишину (gate, voskGate.js), он срабатывает
//    лишь когда вся фраза уже сказана (затвор открыт) либо в шумной комнате, где тишины «нет».
//    После stop итог должен прийти за SAY_STOP_FORCE_MS, иначе микрофон/контекст/аудиосессию освобождаем принудительно (cancel) и считаем сбоем.
//  • Сбой (не отказ пользователя) → onFail(code, message): вызывающий пометит Vosk «не работает» — следующая попытка пойдёт на системном. Отказ микрофона (not-allowed) — не сбой Vosk.
//  • Режим «голосовое с текстом»: start({ record: true }) просит движок копить сырой звук потока в памяти (voskRecord.js); клип попадает в итоговый вид как view.audio ({ ok, blob, durationMs, peaks } либо { ok: false, reason }). Без record view.audio нет.
//  • Уровень голоса: onLevel(rms) каждого куска звука — в sayVoskLevel.js; второго getUserMedia нет.
import { emptyView } from '../speech/speechView.js'
import { pushHistory } from '../speech/speechSegments.js'
import { PERMISSION_GUARD_MS } from '../speech/speechPolicy.js'
import { startListening } from './voskEngine.js'
import { AUTOSTOP_PHRASE, AUTOSTOP_FULL } from './voskTiming.js'
import { buildSayGrammar, sayCompleteCheck } from './sayVoskGrammar.js'
import { cleanPartial, cleanResult, VOSK_MIN_CONF, VOSK_TAIL_MIN_CONF } from './voskResult.js'
import { buildRaw } from './voskRaw.js'

export const SAY_AUTOSTOP_MS = AUTOSTOP_PHRASE // 2500: слово услышано, а текст не менялся столько (и голоса нет — voskTiming.autoStopDue) — просим итог: пауза между словами медленной речи не конец
export const SAY_FULL_MS = AUTOSTOP_FULL        // 800: в partial уже все слова эталона — ждать нечего, итог быстро
export const SAY_MAX_MS = 20000                 // потолок одной попытки (медленная речь: пять слов с паузами по 2 с ≈ 12 с)
export const SAY_SILENCE_MS = 8000              // после открытия микрофона ни одного слова — тишина (как LISTEN_SILENCE_MS у системного)
export const SAY_STOP_FORCE_MS = 2500           // после stop итог должен прийти за это время
export const SAY_CHUNK = 2048                   // кадров на кусок звука (128 мс при 16 кГц): уровень голоса обновляется чаще

const DENIED = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError'])
const NO_MIC = new Set(['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'TrackStartError'])
/** Код ошибки getUserMedia / движка → код, который понимает sayFlow (not-allowed → запасной режим «отказ») */
export const voskErrorCode = e => (DENIED.has(e?.name) ? 'not-allowed' : NO_MIC.has(e?.name) ? 'audio-capture' : typeof e?.code === 'string' ? e.code : 'vosk-error')

export function createVoskRecognizer({
  runtime, level = null, onView = () => {}, onFail = () => {}, getSession = () => null, listen = startListening,
  perfNow = () => performance.now(), now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, minConf = VOSK_MIN_CONF,
}) {
  let cur = null
  let runNo = 0
  let seq = 0
  let view = emptyView
  const push = patch => { view = { ...view, ...patch }; onView(view) }
  const live = a => cur === a && !a.done
  const since = a => Math.round(perfNow() - a.t0)

  // Освободить всё, что держит попытка: таймеры и движок (микрофон, AudioContext, аудиосессия — сам engine.free()). engineFreed — движок уже освободился сам (итог/ошибка)
  function dispose(a, engineFreed = false) {
    a.done = true
    for (const k of ['guard', 'silence', 'force']) clearTimer(a[k])
    if (!engineFreed) { try { a.handle?.cancel() } catch { /* уже освобождён */ } }
    level?.reset()
  }

  function fail(a, code, message, engineFreed = false) {
    if (!live(a)) return
    dispose(a, engineFreed)
    if (code !== 'not-allowed' && code !== 'no-start') onFail(code, message ?? code) // отказ пользователя и долгое ожидание диалога — не сбой Vosk
    push({ status: 'error', phase: null, interim: '', error: code, hint: null, notice: null, history: a.hist })
  }

  function requestStop(a) {
    if (!live(a) || a.stopping) return
    a.stopping = true
    clearTimer(a.silence); clearTimer(a.guard)
    a.force = setTimer(() => fail(a, 'vosk-error', 'итог не пришёл после остановки'), SAY_STOP_FORCE_MS)
    if (a.handle) a.handle.stop(); else a.wantStop = true
  }

  function onResult(a, text, stats) {
    if (!live(a)) return
    const r = cleanResult({ text, words: stats?.words, minConf, tailWord: a.tailWord })
    const raw = buildRaw({ rawText: text, stats, cleaned: r, partial: a.text, minConf, tailWord: a.tailWord, tailMinConf: VOSK_TAIL_MIN_CONF })
    const t = since(a)
    const tStop = stats?.afterStopMs != null ? Math.max(0, t - stats.afterStopMs) : t
    dispose(a, true)
    if (!r.text) { // тишина, либо всё распознанное — [unk] / ниже порога уверенности: для ученика это «не слышу вас»
      push({ status: 'error', phase: null, interim: '', error: 'no-speech', hint: null, notice: null, history: a.hist, raw })
      return
    }
    a.hist = pushHistory(a.hist, { t: Math.max(0, Math.min(tStop, t - 1)), kind: 'speechend' })
    a.hist = pushHistory(a.hist, { t, text: r.text, final: true })
    const final = { text: r.text, confidence: r.confidence }
    push({ status: 'done', phase: null, interim: '', lastInterim: r.text, final, alternatives: [final], usedInterim: false, error: null, hint: null, notice: null, history: a.hist, raw, audio: stats?.audio ?? null })
  }

  function callbacks(a) {
    return {
      onReady: () => {
        if (!live(a)) return
        clearTimer(a.guard)
        a.listening = true
        a.silence = setTimer(() => requestStop(a), SAY_SILENCE_MS)
        push({ status: 'listening', phase: 'audio', notice: null })
      },
      onLevel: rms => { if (live(a)) level?.push(rms) },
      onPartial: raw => {
        if (!live(a)) return
        const text = cleanPartial(raw)
        if (!text || text === a.text) return
        a.text = text
        clearTimer(a.silence) // заговорили: дальше решают авто-стоп, пауза движка и потолок
        a.hist = pushHistory(a.hist, { t: since(a), text })
        push({ interim: text, lastInterim: text, history: a.hist })
      },
      onResult: (text, stats) => onResult(a, text, stats),
      onError: msg => fail(a, 'vosk-error', msg), // ошибка acceptWaveform движок сам не освобождает: cancel() идемпотентен
    }
  }

  function stop() { if (cur) requestStop(cur) }
  function cancel() { if (cur) { dispose(cur); cur = null } }

  return {
    /** Вызывать прямо в обработчике тапа. data — readSayData шага (грамматика); reference и lang фиксируются на заход; record — копить звук для голосового ответа */
    start({ reference, lang, data, record = false }) {
      cancel()
      const a = { id: ++seq, t0: perfNow(), done: false, listening: false, stopping: false, wantStop: false, handle: null, tailWord: '', hist: [], text: '', guard: 0, silence: 0, force: 0 }
      cur = a
      view = { ...emptyView, runNo: ++runNo, reference, lang, at: now(), attempt: 1, attemptId: a.id }
      push({ status: 'starting', phase: 'permission', notice: null })
      a.guard = setTimer(() => fail(a, 'no-start', 'микрофон не открылся за 30 с'), PERMISSION_GUARD_MS)
      const model = runtime.getModel()
      if (!model) { fail(a, 'vosk-error', 'модель не в памяти'); return }
      let p
      try {
        const g = buildSayGrammar(data ?? { phrase: reference })
        a.tailWord = g.phrases[0]?.split(' ').at(-1) ?? ''
        p = listen(model, g.json, callbacks(a), {
          autoStopMs: SAY_AUTOSTOP_MS, completeMs: SAY_FULL_MS, maxMs: SAY_MAX_MS, session: getSession(), chunk: SAY_CHUNK,
          gate: true, cleanPartial, isComplete: sayCompleteCheck(data ?? { phrase: reference }), record: !!record,
        })
      } catch (e) { p = Promise.reject(e) }
      Promise.resolve(p).then(h => {
        if (!live(a)) { try { h?.cancel() } catch { /* уже освобождён */ } return } // пока открывался микрофон, попытку отменили
        a.handle = h
        if (a.wantStop) h.stop()
      }, e => fail(a, voskErrorCode(e), e?.message || String(e)))
    },
    stop,
    /** Полный сброс (смена эталона, уход со страницы, сворачивание): микрофон гасим, вид очищаем */
    reset() { cancel(); view = { ...emptyView }; onView(view) },
    isAudioActive: () => !!cur && cur.listening && !cur.done,
    /** Идёт ли попытка (для источника уровня: пока true, эквалайзер питает RMS Vosk) */
    isRunning: () => !!cur && !cur.done,
  }
}
