import { useReducer, useState, useEffect, useRef, useCallback } from 'react'
import { createSpeechController, isBusy } from '../../../../shared/lib/speech/speechController.js'
import { getRecognitionCtor, queryMicPermission } from '../../../../shared/lib/speech/speechSupport.js'
import { sayPermission } from '../../../../shared/lib/speech/sayPermission.js'
import { SAY_EVENTS, sayEventProps } from '../../../../shared/lib/speech/sayResult.js'
import { sayReducer, initialSayState, planTap, isGo } from '../../../../shared/lib/speech/sayFlow.js'
import { morphDelay, FAIL_HOLD_MS } from '../../../../shared/lib/speech/sayMorph.js'
import { QUIET_TAIL_MS } from '../../../../shared/lib/speech/sayHints.js'
import { createVoiceLevel } from '../../../../shared/lib/speech/sayVoiceLevel.js'
import { createBrowserRealLevel, levelSource, isRealLevelOn, realLevelLabel } from '../../../../shared/lib/speech/sayRealLevel.js'
import { holdSoundQuiet } from '../../../../shared/lib/soundQuiet.js'
import { stopWord } from '../../word-audio/wordAudioPlayer.js'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// Состояние панели «Сказать фразу» (React-обвязка над sayFlow.js + speechController.js + sayPermission.js).
// Микрофон включается ТОЛЬКО по тапу на кнопку (ctrl.start в обработчике тапа: на iPhone recognition.start() вне жеста
// не работает) и гасится на результате, ошибке, тишине, сворачивании, уходе. Разрешения читает/пишет один общий
// sayPermission (флаги пояснения, отказа, «Не могу говорить»). onEvent(name, props) — аналитика: только числа/флаги,
// ни звука, ни текста фразы.
// Голос ученика видят КОЛЬЦА вокруг квадрата «Слушаю / Стоп» (SayStage/useSayRings): уровень по умолчанию СИНТЕТИЧЕСКИЙ, по событиям
// распознавания (sayVoiceLevel.js, без getUserMedia); за админским флагом — РЕАЛЬНЫЙ (sayRealLevel.js: поток открывается в этом же тапе
// перед запуском распознавания, закрывается вместе с попыткой). Источник отдаёт хук как voice. Эквалайзер-свечение плеера модуль НЕ включает.
// Звуки приложения на время попытки (от тапа до результата + QUIET_TAIL_MS) молчат — soundQuiet.js; сам тап по микрофону
// помечен data-no-unlock, чтобы разблокировка звука не стартовала вместе с записью (SayStage.jsx).
// Морфинг кнопки в квадрат (MORPH_MS) — «горлышко» подготовки микрофона: таймер morphEnd; «начали» = isGo (морфинг завершён И движок слушает).
// После неудачи квадрат с крестиком держится FAIL_HOLD_MS (failShow), потом таймер failEnd возвращает прямоугольник.
export function useSayPhrase({ data, onEvent, perm = sayPermission }) {
  const [s, dispatch] = useReducer(sayReducer, perm, p => initialSayState(p.decide()))
  const [voice] = useState(createVoiceLevel)
  const [real] = useState(() => createBrowserRealLevel(st => { if (st !== 'off') dispatch({ type: 'realStatus', status: realLevelLabel(true, st) }) }))
  const [levels] = useState(() => levelSource(voice, real))
  const [ctrl] = useState(() => createSpeechController({
    createRecognition: () => { const Ctor = getRecognitionCtor(); return new Ctor() },
    queryPerm: queryMicPermission,
    getMode: () => 'say',
    onView: view => dispatch({ type: 'view', view }),
    onSignal: kind => voice.signal(kind, nowMs()),
    endOnFinal: 'abort', // после финального результата гасим движок abort(), а не stop(): без системного «хвоста» распознавания
  }))
  const quietRef = useRef({ release: null, timer: 0 })
  const morphRef = useRef(0)
  const failRef = useRef(0)
  const eventRef = useRef(onEvent)
  const stateRef = useRef(s)
  useEffect(() => { eventRef.current = onEvent; stateRef.current = s })

  const emit = useCallback((name, extra = {}) => {
    const cur = stateRef.current
    eventRef.current?.(name, sayEventProps({ perm: perm.getPerm(), explained: cur.explainer, taps: cur.taps, ...extra }))
  }, [perm])

  // Побочные эффекты переходов reducer'а (он чистый): микрофон заработал / отказ / итог захода / событие аналитики
  useEffect(() => { if (s.view.status === 'listening') perm.markMicOk() }, [s.view.status, perm])
  useEffect(() => {
    if (!s.settledRun) return
    if (s.fallbackReason === 'denied') perm.markDenied() // отказ — запоминаем до конца запуска, start() больше не зовём
    perm.refresh() // обновить кэш разрешения после попытки
  }, [s.settledRun]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.event) emit(s.event.name, s.event.extra) }, [s.event]) // eslint-disable-line react-hooks/exhaustive-deps

  // Попытка кончилась: кольца гаснут (источник уровня сбрасываем, реальный поток микрофона закрываем); таймер морфинга больше не нужен
  useEffect(() => {
    if (s.phase === 'run') return
    clearTimeout(morphRef.current)
    voice.signal('stop', nowMs())
    real.close()
  }, [s.phase, voice, real])

  // Неудача: квадрат держит крестик FAIL_HOLD_MS, потом снова прямоугольная кнопка
  useEffect(() => {
    if (!s.failShow) return undefined
    failRef.current = setTimeout(() => dispatch({ type: 'failEnd' }), FAIL_HOLD_MS)
    return () => clearTimeout(failRef.current)
  }, [s.failShow])

  // Окно тишины звуков приложения: открывается в begin() (синхронно в тапе), закрывается через QUIET_TAIL_MS после конца попытки
  useEffect(() => {
    const q = quietRef.current
    if (s.phase === 'run') return undefined
    if (q.release && !q.timer) q.timer = setTimeout(() => { q.release?.(); q.release = null; q.timer = 0 }, QUIET_TAIL_MS)
    return undefined
  }, [s.phase])
  useEffect(() => {
    const q = quietRef.current
    return () => { clearTimeout(q.timer); q.timer = 0; q.release?.(); q.release = null; clearTimeout(morphRef.current); real.close() }
  }, [real])

  useEffect(() => {
    let alive = true
    perm.refresh().then(() => {
      if (!alive) return
      const d = perm.decide() // query мог сказать 'denied' — сразу запасной режим, без попытки
      if (d.action === 'fallback') dispatch({ type: 'fallback', reason: d.reason, onlyIdle: true })
    })
    // Сворачивание: гасим только реальную запись (iOS может мигнуть visibility, пока висит диалог разрешения)
    const interrupt = () => { ctrl.reset(); voice.signal('end', nowMs()); real.close(); dispatch({ type: 'interrupt' }) }
    const onHidden = () => { if (document.visibilityState === 'hidden' && ctrl.isAudioActive()) interrupt() }
    const onPageHide = () => { if (isBusy(stateRef.current.view)) interrupt() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      ctrl.reset() // панель закрыта — микрофон не держим
    }
  }, [ctrl, perm, voice, real])

  // Начать попытку. Вызывать СИНХРОННО из обработчика тапа (жест нужен iPhone для recognition.start()). Порядок: сначала то, без чего
  // не стартует и не нарисуется нажатие (окно тишины, begin, ctrl.start), аналитику откладываем — её запись не должна задерживать
  // ни старт записи, ни первый кадр морфинга
  const begin = useCallback(() => {
    const q = quietRef.current
    stopWord() // эталонное «Послушать» не должно звучать, пока слушаем
    clearTimeout(q.timer); q.timer = 0
    if (!q.release) q.release = holdSoundQuiet()
    const wantReal = isRealLevelOn()
    if (wantReal) real.open() // реальный уровень (админский флаг): поток микрофона открываем в этом же тапе, ДО recognition.start(), промис не ждём
    dispatch({ type: 'begin', data, realLevel: realLevelLabel(wantReal, null) })
    ctrl.start({ reference: data.phrase, lang: data.lang })
    clearTimeout(morphRef.current)
    morphRef.current = setTimeout(() => dispatch({ type: 'morphEnd' }), morphDelay(reducedMotion()))
    const taps = s.taps + 1
    setTimeout(() => emit(SAY_EVENTS.start, { taps }), 0)
  }, [ctrl, real, emit, data, s.taps])

  // Тап по микрофону: «начали» и идёт запись — «стоп» (принять сказанное), иначе по решению sayPermission
  const tapMic = useCallback(() => {
    const plan = planTap({ view: s.view, decision: perm.decide(), go: isGo(s), hold: s.failShow })
    if (plan.act === 'stop') ctrl.stop()
    else if (plan.act === 'fallback') dispatch({ type: 'fallback', reason: plan.reason })
    else if (plan.act === 'explain') dispatch({ type: 'explain', kind: plan.kind })
    else if (plan.act === 'begin') begin()
  }, [ctrl, perm, begin, s])

  // «Понятно, включить микрофон» / «Продолжить»: флаги (полное пояснение видели; в этом запуске попап был) + сразу попытка в этом же тапе
  // (диалог ОС — по нему)
  const confirmExplain = useCallback(() => { perm.markExplained(); perm.markPreShown(); begin() }, [perm, begin])

  // Закрыли попап мимо кнопки: ничего не просили и никаких флагов не ставим — попап покажем снова
  const cancelExplain = useCallback(() => dispatch({ type: 'explainCancel' }), [])

  // Из режима «Не могу говорить» вернуться к микрофону (если его не запретили)
  const enableMic = useCallback(() => { perm.setCantSpeak(false); dispatch({ type: 'enable' }) }, [perm])

  return {
    view: s.view, phase: s.phase, taps: s.taps, verdict: s.verdict, errorCode: s.errorCode,
    fallbackReason: s.fallbackReason, autoRetries: s.autoRetries, failStreak: s.failStreak,
    go: isGo(s), adminLine: s.adminLine, hint: s.hint, voice: levels, failShow: s.failShow, explainKind: s.explainKind,
    tapMic, confirmExplain, cancelExplain, enableMic, emit, perm,
  }
}
