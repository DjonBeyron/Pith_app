import { useReducer, useState, useEffect, useRef, useCallback } from 'react'
import { createSpeechController, isBusy } from '../../../../shared/lib/speech/speechController.js'
import { getRecognitionCtor, queryMicPermission } from '../../../../shared/lib/speech/speechSupport.js'
import { sayPermission } from '../../../../shared/lib/speech/sayPermission.js'
import { MAX_TAPS, SAY_EVENTS, sayEventProps } from '../../../../shared/lib/speech/sayResult.js'
import { sayReducer, initialSayState, planTap } from '../../../../shared/lib/speech/sayFlow.js'
import { stopWord } from '../../word-audio/wordAudioPlayer.js'

// Состояние панели «Сказать фразу» (React-обвязка над sayFlow.js + speechController.js + sayPermission.js).
// Микрофон включается ТОЛЬКО по тапу на кнопку (ctrl.start в обработчике тапа: на iPhone recognition.start() вне жеста
// не работает) и гасится на результате, ошибке, тишине, сворачивании, уходе. Разрешения читает/пишет один общий
// sayPermission (флаги пояснения, отказа, «Не могу говорить»). onEvent(name, props) — аналитика: только числа/флаги,
// ни звука, ни текста фразы.
export function useSayPhrase({ data, onEvent, perm = sayPermission }) {
  const [s, dispatch] = useReducer(sayReducer, perm, p => initialSayState(p.decide()))
  const [ctrl] = useState(() => createSpeechController({
    createRecognition: () => { const Ctor = getRecognitionCtor(); return new Ctor() },
    queryPerm: queryMicPermission,
    getMode: () => 'say',
    onView: view => dispatch({ type: 'view', view }),
  }))
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

  useEffect(() => {
    let alive = true
    perm.refresh().then(() => {
      if (!alive) return
      const d = perm.decide() // query мог сказать 'denied' — сразу запасной режим, без попытки
      if (d.action === 'fallback') dispatch({ type: 'fallback', reason: d.reason, onlyIdle: true })
    })
    // Сворачивание: гасим только реальную запись (iOS может мигнуть visibility, пока висит диалог разрешения)
    const interrupt = () => { ctrl.reset(); dispatch({ type: 'interrupt' }) }
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
  }, [ctrl, perm])

  // Начать попытку. Вызывать СИНХРОННО из обработчика тапа (жест нужен iPhone для recognition.start())
  const begin = useCallback(() => {
    if (s.taps >= MAX_TAPS) return
    stopWord() // эталонное «Послушать» не должно звучать, пока слушаем
    dispatch({ type: 'begin', data })
    emit(SAY_EVENTS.start, { taps: s.taps + 1 })
    ctrl.start({ reference: data.phrase, lang: data.lang })
  }, [ctrl, emit, data, s.taps])

  // Тап по микрофону: во время записи — «стоп» (принять сказанное), иначе по решению sayPermission
  const tapMic = useCallback(() => {
    const plan = planTap({ view: s.view, taps: s.taps, decision: perm.decide() })
    if (plan.act === 'stop') ctrl.stop()
    else if (plan.act === 'fallback') dispatch({ type: 'fallback', reason: plan.reason })
    else if (plan.act === 'explain') dispatch({ type: 'explain' })
    else if (plan.act === 'begin') begin()
  }, [ctrl, perm, begin, s.view, s.taps])

  // «Понятно, включить микрофон»: флаг пояснения + сразу попытка в этом же тапе (диалог ОС — по нему)
  const confirmExplain = useCallback(() => { perm.markExplained(); begin() }, [perm, begin])

  // Из режима «Не могу говорить» вернуться к микрофону (если его не запретили)
  const enableMic = useCallback(() => { perm.setCantSpeak(false); dispatch({ type: 'enable' }) }, [perm])

  return {
    view: s.view, phase: s.phase, taps: s.taps, verdict: s.verdict, errorCode: s.errorCode,
    fallbackReason: s.fallbackReason, autoRetries: s.autoRetries, canRetry: s.taps < MAX_TAPS,
    tapMic, confirmExplain, enableMic, emit, perm,
  }
}
