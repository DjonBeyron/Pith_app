import { useReducer, useState, useEffect, useRef, useCallback } from 'react'
import { createSpeechController, isBusy } from '../../../../shared/lib/speech/speechController.js'
import { getRecognitionCtor, queryMicPermission } from '../../../../shared/lib/speech/speechSupport.js'
import { sayPermission } from '../../../../shared/lib/speech/sayPermission.js'
import { MAX_TAPS, SAY_EVENTS, sayEventProps } from '../../../../shared/lib/speech/sayResult.js'
import { sayReducer, initialSayState, planTap } from '../../../../shared/lib/speech/sayFlow.js'
import { createVoiceLevel, FADE_MS } from '../../../../shared/lib/speech/sayVoiceLevel.js'
import { stopWord } from '../../word-audio/wordAudioPlayer.js'
import { publishLevel, unpublishLevel } from '../../audioLevel.js'
import { forceEqualizer } from '../../lessonPrefs.js'

const VOICE_SOURCE = 'say-voice' // id источника уровня в audioLevel.js (эквалайзер-свечение снизу чата)
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// Состояние панели «Сказать фразу» (React-обвязка над sayFlow.js + speechController.js + sayPermission.js).
// Микрофон включается ТОЛЬКО по тапу на кнопку (ctrl.start в обработчике тапа: на iPhone recognition.start() вне жеста
// не работает) и гасится на результате, ошибке, тишине, сворачивании, уходе. Разрешения читает/пишет один общий
// sayPermission (флаги пояснения, отказа, «Не могу говорить»). onEvent(name, props) — аналитика: только числа/флаги,
// ни звука, ни текста фразы.
// Эквалайзер плеера (свечение снизу чата) во время попытки реагирует на голос ученика: уровень СИНТЕТИЧЕСКИЙ, по событиям
// распознавания (sayVoiceLevel.js, без getUserMedia), и включён принудительно, даже если выключен в шестерёнке.
export function useSayPhrase({ data, onEvent, perm = sayPermission }) {
  const [s, dispatch] = useReducer(sayReducer, perm, p => initialSayState(p.decide()))
  const [voice] = useState(createVoiceLevel)
  const [ctrl] = useState(() => createSpeechController({
    createRecognition: () => { const Ctor = getRecognitionCtor(); return new Ctor() },
    queryPerm: queryMicPermission,
    getMode: () => 'say',
    onView: view => dispatch({ type: 'view', view }),
    onSignal: kind => voice.signal(kind, nowMs()),
    endOnFinal: 'abort', // после финального результата гасим движок abort(), а не stop(): без системного «хвоста» распознавания
  }))
  const eqRef = useRef({ release: null, timer: 0 })
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

  // Эквалайзер: на время попытки включаем принудительно и публикуем синтетический уровень; после попытки даём ему
  // затухнуть (FADE_MS) и отпускаем — настройка пользователя снова действует. Вне попытки источника нет — общий rAF стоит
  useEffect(() => {
    const eq = eqRef.current
    if (s.phase === 'run') {
      clearTimeout(eq.timer)
      if (!eq.release) {
        eq.release = forceEqualizer()
        publishLevel(VOICE_SOURCE, { playing: true, getLevel: n => voice.level(n), profile: 'voice' })
      }
      return undefined
    }
    if (eq.release) eq.timer = setTimeout(() => stopEq(eq, voice), FADE_MS + 120)
    return undefined
  }, [s.phase, voice])
  useEffect(() => { const eq = eqRef.current; return () => stopEq(eq, voice) }, [voice])

  useEffect(() => {
    let alive = true
    perm.refresh().then(() => {
      if (!alive) return
      const d = perm.decide() // query мог сказать 'denied' — сразу запасной режим, без попытки
      if (d.action === 'fallback') dispatch({ type: 'fallback', reason: d.reason, onlyIdle: true })
    })
    // Сворачивание: гасим только реальную запись (iOS может мигнуть visibility, пока висит диалог разрешения)
    const interrupt = () => { ctrl.reset(); voice.signal('end', nowMs()); dispatch({ type: 'interrupt' }) }
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
  }, [ctrl, perm, voice])

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

  // Закрыли попап пояснения мимо кнопки: ничего не просили, пояснение покажем снова
  const cancelExplain = useCallback(() => dispatch({ type: 'explainCancel' }), [])

  // Из режима «Не могу говорить» вернуться к микрофону (если его не запретили)
  const enableMic = useCallback(() => { perm.setCantSpeak(false); dispatch({ type: 'enable' }) }, [perm])

  return {
    view: s.view, phase: s.phase, taps: s.taps, verdict: s.verdict, errorCode: s.errorCode,
    fallbackReason: s.fallbackReason, autoRetries: s.autoRetries, canRetry: s.taps < MAX_TAPS,
    tapMic, confirmExplain, cancelExplain, enableMic, emit, perm,
  }
}

function stopEq(eq, voice) {
  clearTimeout(eq.timer)
  if (!eq.release) return
  eq.release()
  eq.release = null
  unpublishLevel(VOICE_SOURCE)
  voice.signal('stop', nowMs())
}
