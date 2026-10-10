import { useReducer, useState, useEffect, useRef, useCallback } from 'react'
import { createSpeechController, isBusy } from '../../../../shared/lib/speech/speechController.js'
import { createSayRecognizer } from '../../../../shared/lib/speech/sayRecognizer.js'
import { getRecognitionCtor, queryMicPermission } from '../../../../shared/lib/speech/speechSupport.js'
import { sayPermission } from '../../../../shared/lib/speech/sayPermission.js'
import { SAY_EVENTS, sayEventProps } from '../../../../shared/lib/speech/sayResult.js'
import { sayReducer, initialSayState, planTap, isGo, STOP_ARM_MS } from '../../../../shared/lib/speech/sayFlow.js'
import { QUIET_TAIL_MS } from '../../../../shared/lib/speech/sayHints.js'
import { createVoiceLevel } from '../../../../shared/lib/speech/sayVoiceLevel.js'
import { createBrowserRealLevel, levelSource, isRealLevelOn, realLevelLabel } from '../../../../shared/lib/speech/sayRealLevel.js'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { holdSoundQuiet } from '../../../../shared/lib/soundQuiet.js'
import { createAudioSession } from '../../../../shared/lib/speech/speechAudioSession.js'
import { sayAudioSessionType } from '../../../../shared/lib/speech/sayAudioSession.js'
import { stopWord } from '../../word-audio/wordAudioPlayer.js'

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// Состояние панели «Сказать фразу» (React-обвязка над sayFlow.js + speechController.js + sayPermission.js).
// Микрофон включается ТОЛЬКО по тапу на кнопку (ctrl.start в обработчике тапа: на iPhone recognition.start() вне жеста
// не работает) и гасится на результате, ошибке, тишине, сворачивании, уходе. Разрешения читает/пишет один общий
// sayPermission (флаги пояснения, отказа, «Не могу говорить»). onEvent(name, props) — аналитика: только числа/флаги,
// ни звука, ни текста фразы.
// Голос ученика видит ЭКВАЛАЙЗЕР вокруг круга-микрофона (SayStage/useSayWaves). Его питает ЗАМЕНЯЕМЫЙ источник уровня (sayLevelSource.js:
// подписка → значение 0..1 каждый кадр), хук отдаёт его как level. Когда идёт Vosk — это РЕАЛЬНЫЙ RMS кусков звука его же потока (с первого куска). На системном
// распознавании: уровень по умолчанию СИНТЕТИЧЕСКИЙ, по событиям распознавания (sayVoiceLevel.js, без getUserMedia); за админским флагом — РЕАЛЬНЫЙ
// (sayRealLevel.js: поток открывается в этом же тапе перед запуском распознавания, закрывается вместе с попыткой; при Vosk этот флаг не действует — микрофон один).
// Движок (Vosk / системное) выбирает sayRecognizer.js на каждой попытке; прогрев модели Vosk — пока панель смонтирована (ctrl.warm). Эквалайзер-свечение плеера модуль НЕ включает.
// Звуки приложения на время попытки (от тапа до результата + QUIET_TAIL_MS) молчат — soundQuiet.js; сам тап по микрофону
// помечен data-no-unlock, чтобы разблокировка звука не стартовала вместе с записью (SayStage.jsx).
// Перезапуск: speechController ждёт end прошлого экземпляра и RESTART_COOLDOWN_MS (стратегия 'M', speechRestart.js) — прозрачно: тап в эту паузу ставится в очередь и стартует по её окончании;
// «глухая» попытка после успешной автоматически пересоздаётся один раз (speechDeaf.js).
// Круг реагирует на тап СРАЗУ: 'begin' ставит phase 'run' в том же тапе. «Можно остановить» = isGo (движок слушает И прошла защита от
// двойного тапа STOP_ARM_MS: таймер 'arm'). После неудачи круг сразу снова готов (никаких пауз-показов); реплика и подсказка уходят в чат (панель).
export function useSayPhrase({ data, onEvent, perm = sayPermission }) {
  const [s, dispatch] = useReducer(sayReducer, perm, p => initialSayState(p.decide()))
  const [voice] = useState(createVoiceLevel)
  const [real] = useState(() => createBrowserRealLevel(st => { if (st !== 'off') dispatch({ type: 'realStatus', status: realLevelLabel(true, st) }) }))
  // РАСПОЗНАВАТЕЛЬ: два движка за одним интерфейсом (sayRecognizer.js). Vosk — основной, когда к тапу готов (модель в кэше и в памяти), иначе системное распознавание (speechController
  // ниже — настройки прежние). Выбор на каждую попытку, тап ничего не ждёт; упал Vosk — следующая попытка на системном.
  const [ctrl] = useState(() => createSayRecognizer({
    createSystem: onView => createSpeechController({
      createRecognition: () => { const Ctor = getRecognitionCtor(); return new Ctor() },
      queryPerm: queryMicPermission,
      getMode: () => 'say',
      onView,
      onSignal: kind => voice.signal(kind, nowMs()),
      endOnFinal: 'abort', // после финального результата гасим движок abort(), а не stop(): без системного «хвоста» распознавания
      audioSession: createAudioSession(), // navigator.audioSession: сброс при «глухом» повторе; на время записи — по админскому флагу pithy_say_audiosession_v1 (по умолчанию включён)
      getAudioSessionType: () => sayAudioSessionType(),
      getRestart: () => 'M', // новый экземпляр — только после end прошлого + RESTART_COOLDOWN_MS (iOS: второй запуск сразу после первого бывает «глухим»); тап в это окно встаёт в очередь
    }),
    onView: view => dispatch({ type: 'view', view }),
    getSession: () => sayAudioSessionType(), // тот же тип аудиосессии на время записи Vosk
  }))
  // ИСТОЧНИК УРОВНЯ (заменяемый). Vosk: реальный RMS кусков звука его же потока (ctrl.level, с первого куска, второго getUserMedia нет). Системное распознавание: реальный RMS, если
  // админ включил флаг и поток жив, иначе синтетический по событиям (sayVoiceLevel.js). ТОЧКА ПОДКЛЮЧЕНИЯ ВТОРОГО ИСТОЧНИКА — строка `const [levels] = useState(...)` ниже.
  const [levels] = useState(() => { const sys = levelSource(voice, real); return createLevelSource(t => ctrl.level(t) ?? sys.ringLevel(t)) })
  const quietRef = useRef({ release: null, timer: 0 })
  const armRef = useRef(0)
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

  // Попытка кончилась: эквалайзер гаснет (источник уровня сбрасываем, реальный поток микрофона закрываем); таймер защиты от двойного тапа больше не нужен
  useEffect(() => {
    if (s.phase === 'run') return
    clearTimeout(armRef.current)
    voice.signal('stop', nowMs())
    real.close()
  }, [s.phase, voice, real])

  // Окно тишины звуков приложения: открывается в begin() (синхронно в тапе), закрывается через QUIET_TAIL_MS после конца попытки
  useEffect(() => {
    const q = quietRef.current
    if (s.phase === 'run') return undefined
    if (q.release && !q.timer) q.timer = setTimeout(() => { q.release?.(); q.release = null; q.timer = 0 }, QUIET_TAIL_MS)
    return undefined
  }, [s.phase])
  useEffect(() => {
    const q = quietRef.current
    return () => { clearTimeout(q.timer); q.timer = 0; q.release?.(); q.release = null; clearTimeout(armRef.current); real.close() }
  }, [real])

  useEffect(() => {
    let alive = true
    let unwarm = null
    perm.refresh().then(() => {
      if (!alive) return
      const d = perm.decide() // query мог сказать 'denied' — сразу запасной режим, без попытки
      if (d.action === 'fallback') dispatch({ type: 'fallback', reason: d.reason, onlyIdle: true })
      else unwarm = ctrl.warm() // микрофон возможен: прогреваем Vosk (модель из кэша в память, в фоне), панель уйдёт — через 30 с освободим
    })
    // Сворачивание: гасим только реальную запись (iOS может мигнуть visibility, пока висит диалог разрешения)
    const interrupt = () => { ctrl.reset(); voice.signal('end', nowMs()); real.close(); dispatch({ type: 'interrupt' }) }
    const onHidden = () => { if (document.visibilityState === 'hidden' && ctrl.isAudioActive()) interrupt() }
    const onPageHide = () => { if (isBusy(stateRef.current.view)) interrupt() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      alive = false
      unwarm?.()
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      ctrl.reset() // панель закрыта — микрофон не держим
    }
  }, [ctrl, perm, voice, real])

  // Начать попытку. Вызывать СИНХРОННО из обработчика тапа (жест нужен iPhone для recognition.start()). Порядок: сначала то, без чего
  // не стартует и не нарисуется нажатие (окно тишины, begin, ctrl.start), аналитику откладываем — её запись не должна задерживать
  // ни старт записи, ни первый кадр эквалайзера (круг и волны перерисовываются синхронно, в конце этого же обработчика тапа)
  const begin = useCallback(() => {
    const q = quietRef.current
    stopWord() // эталонное «Послушать» не должно звучать, пока слушаем
    clearTimeout(q.timer); q.timer = 0
    if (!q.release) q.release = holdSoundQuiet()
    const pick = ctrl.choose(data) // какой движок пойдёт на эту попытку (синхронно, без ожидания): Vosk, если готов, иначе системное
    const wantReal = isRealLevelOn() && pick.engine === 'system' // отдельный реальный уровень — только для системного: у Vosk микрофон один, уровень берётся из его потока
    if (wantReal) real.open() // реальный уровень (админский флаг): поток микрофона открываем в этом же тапе, ДО recognition.start(), промис не ждём
    dispatch({ type: 'begin', data, realLevel: realLevelLabel(wantReal, null), audioSession: sayAudioSessionType(), engine: pick })
    ctrl.start({ reference: data.phrase, lang: data.lang, data, pick })
    clearTimeout(armRef.current)
    armRef.current = setTimeout(() => dispatch({ type: 'arm' }), STOP_ARM_MS)
    const taps = s.taps + 1
    setTimeout(() => emit(SAY_EVENTS.start, { taps }), 0)
  }, [ctrl, real, emit, data, s.taps])

  // Тап по микрофону: «начали» и идёт запись — «стоп» (принять сказанное), иначе по решению sayPermission
  const tapMic = useCallback(() => {
    const plan = planTap({ view: s.view, decision: perm.decide(), go: isGo(s), running: s.phase === 'run' })
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
    go: isGo(s), adminLine: s.adminLine, hint: s.hint, reply: s.reply, level: levels, explainKind: s.explainKind,
    tapMic, confirmExplain, cancelExplain, enableMic, emit, perm,
  }
}
