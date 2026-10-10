import { useReducer, useState, useEffect, useRef, useCallback } from 'react'
import { createSpeechController, isBusy } from '../../../../shared/lib/speech/speechController.js'
import { createSayRecognizer } from '../../../../shared/lib/speech/sayRecognizer.js'
import { startPanelWarm } from '../../../../shared/lib/speech/sayPanelWarm.js'
import { useVoskWait } from './useVoskWait.js'
import { getRecognitionCtor, queryMicPermission } from '../../../../shared/lib/speech/speechSupport.js'
import { sayPermission } from '../../../../shared/lib/speech/sayPermission.js'
import { SAY_EVENTS, sayEventProps } from '../../../../shared/lib/speech/sayResult.js'
import { sayReducer, initialSayState, planTap, isGo, STOP_ARM_MS } from '../../../../shared/lib/speech/sayFlow.js'
import { STOP_MANUAL } from '../../../../shared/lib/speech/sayHints.js'
import { createVoiceLevel } from '../../../../shared/lib/speech/sayVoiceLevel.js'
import { createBrowserRealLevel, levelSource, isRealLevelOn, realLevelLabel } from '../../../../shared/lib/speech/sayRealLevel.js'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { createSayQuiet } from '../../../../shared/lib/speech/sayQuietWindow.js'
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
// Звуки приложения на время попытки (от тапа до результата; у системного ещё QUIET_TAIL_MS, у Vosk хвоста нет) молчат — soundQuiet.js / sayQuietWindow.js; сам тап по микрофону
// помечен data-no-unlock, чтобы разблокировка звука не стартовала вместе с записью (SayStage.jsx).
// Перезапуск: speechController ждёт end прошлого экземпляра и RESTART_COOLDOWN_MS (стратегия 'M', speechRestart.js) — прозрачно: тап в эту паузу ставится в очередь и стартует по её окончании;
// «глухая» попытка после успешной автоматически пересоздаётся один раз (speechDeaf.js).
// Круг реагирует на тап СРАЗУ: 'begin' ставит phase 'run' в том же тапе. «Можно остановить» = isGo (движок слушает И прошла защита от
// двойного тапа STOP_ARM_MS: таймер 'arm'). После неудачи круг сразу снова готов (никаких пауз-показов); реплика и подсказка уходят в чат (панель).
// Вид круга «нет доступа / доступ выдан» (sayMicState.js) считает панель из access = perm.access() (ответ Permissions API, флаг «микрофон уже открывался» в localStorage, «работал в этом запуске», «вводный попап видели»):
// флаг ставит markMicOk (запись реально пошла), сбрасывает markDenied (not-allowed) и query=denied; ответ query приходит асинхронно — bumpAccess перерисовывает панель.
// После третьей засчитанной неудачи (exhausted, счёт — sayFlow.js) тап игнорируется: панель сама уходит по ветке «неверный».
export function useSayPhrase({ data, onEvent, perm = sayPermission }) {
  const [s, dispatch] = useReducer(sayReducer, perm, p => initialSayState(p.decide()))
  const [, bumpAccess] = useReducer(n => n + 1, 0) // перерисовка после ответа Permissions API (он асинхронный): вид круга считается из perm.access() при рендере
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
  const { note: waitNote, wait: waitVosk } = useVoskWait(ctrl) // админский режим «Только Vosk»: ожидание прогрева вместо системного (плашка админа)
  // ИСТОЧНИК УРОВНЯ (заменяемый). Vosk: реальный RMS кусков звука его же потока (ctrl.level, с первого куска, второго getUserMedia нет). Системное распознавание: реальный RMS, если
  // админ включил флаг и поток жив, иначе синтетический по событиям (sayVoiceLevel.js). ТОЧКА ПОДКЛЮЧЕНИЯ ВТОРОГО ИСТОЧНИКА — строка `const [levels] = useState(...)` ниже.
  const [levels] = useState(() => { const sys = levelSource(voice, real); return createLevelSource(t => ctrl.level(t) ?? sys.ringLevel(t)) })
  const [quiet] = useState(createSayQuiet) // окно тишины звуков на попытку (sayQuietWindow.js)
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
    Promise.resolve(perm.refresh()).then(bumpAccess).catch(() => {}) // обновить кэш разрешения после попытки и пересчитать вид круга (нет доступа / доступ выдан)
  }, [s.settledRun]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.event) emit(s.event.name, s.event.extra) }, [s.event]) // eslint-disable-line react-hooks/exhaustive-deps

  // Попытка кончилась: эквалайзер гаснет (источник уровня сбрасываем, реальный поток микрофона закрываем); таймер защиты от двойного тапа больше не нужен
  useEffect(() => {
    if (s.phase === 'run') return
    clearTimeout(armRef.current)
    voice.signal('stop', nowMs())
    real.close()
  }, [s.phase, voice, real])

  // Окно тишины звуков приложения: открывается в begin() (синхронно в тапе), закрывается после конца попытки: у Vosk сразу (микрофон уже закрыт до итога), у системного — через QUIET_TAIL_MS.
  // «Верно» в момент «Готово» не пропадает: у Vosk окна уже нет, у системного звук откладывается до конца хвоста (soundQuiet.js)
  useEffect(() => { if (s.phase !== 'run') quiet.close(s.engine) }, [s.phase, s.engine, quiet])
  useEffect(() => () => { quiet.dispose(); clearTimeout(armRef.current); real.close() }, [real, quiet])

  useEffect(() => {
    // Прогрев Vosk сразу (не за perm.refresh(): на iPhone Permissions API бывает «глухим»); в запасном режиме не греем, а когда query скажет 'denied' — освобождаем (sayPanelWarm.js)
    const unwarm = startPanelWarm({ perm, warm: why => ctrl.warm(why), onFallback: d => dispatch({ type: 'fallback', reason: d.reason, onlyIdle: true }), onRefreshed: bumpAccess })
    // Сворачивание: гасим только реальную запись (iOS может мигнуть visibility, пока висит диалог разрешения)
    const interrupt = () => { ctrl.reset(); voice.signal('end', nowMs()); real.close(); dispatch({ type: 'interrupt' }) }
    const onHidden = () => { if (document.visibilityState === 'hidden' && ctrl.isAudioActive()) interrupt() }
    const onPageHide = () => { if (isBusy(stateRef.current.view)) interrupt() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      unwarm()
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      ctrl.reset() // панель закрыта — микрофон не держим
    }
  }, [ctrl, perm, voice, real])

  // Начать попытку. Вызывать СИНХРОННО из обработчика тапа (жест нужен iPhone для recognition.start()). Порядок: сначала то, без чего
  // не стартует и не нарисуется нажатие (окно тишины, begin, ctrl.start), аналитику откладываем — её запись не должна задерживать
  // ни старт записи, ни первый кадр эквалайзера (круг и волны перерисовываются синхронно, в конце этого же обработчика тапа)
  const begin = useCallback(() => {
    stopWord() // эталонное «Послушать» не должно звучать, пока слушаем
    if (waitVosk(data)) return // админский режим «Только Vosk» и Vosk не готов: ждём прогрев (плашка админа), на системное не уходим
    quiet.open()
    const pick = ctrl.choose(data) // какой движок пойдёт на эту попытку (синхронно, без ожидания): Vosk, если готов, иначе системное
    const wantReal = isRealLevelOn() && pick.engine === 'system' // отдельный реальный уровень — только для системного: у Vosk микрофон один, уровень берётся из его потока
    if (wantReal) real.open() // реальный уровень (админский флаг): поток микрофона открываем в этом же тапе, ДО recognition.start(), промис не ждём
    dispatch({ type: 'begin', data, realLevel: realLevelLabel(wantReal, null), audioSession: sayAudioSessionType(), engine: pick })
    ctrl.start({ reference: data.phrase, lang: data.lang, data, pick })
    clearTimeout(armRef.current)
    armRef.current = setTimeout(() => dispatch({ type: 'arm' }), STOP_ARM_MS)
    const taps = s.taps + 1
    setTimeout(() => emit(SAY_EVENTS.start, { taps }), 0)
  }, [ctrl, real, emit, data, s.taps, waitVosk, quiet])

  // Тап по микрофону: «начали» и идёт запись — «стоп» (принять сказанное), иначе по решению sayPermission
  const tapMic = useCallback(() => {
    if (s.exhausted) return // три неудачи уже были: панель уходит по ветке «неверный», новая запись не нужна
    const plan = planTap({ view: s.view, decision: perm.decide(), go: isGo(s), running: s.phase === 'run' })
    if (plan.act === 'stop') { dispatch({ type: 'stop', reason: STOP_MANUAL }); ctrl.stop() } // причина «ученик остановил» — ДО ctrl.stop(): итог захода (settle) решает по ней, слать ли «не слышу вас…»
    else if (plan.act === 'fallback') dispatch({ type: 'fallback', reason: plan.reason })
    else if (plan.act === 'explain') dispatch({ type: 'explain', kind: plan.kind })
    else if (plan.act === 'begin') begin()
  }, [ctrl, perm, begin, s])

  // «Разрешить доступ» / «Продолжить» / «Понятно, начать»: флаги (пояснение и вводный попап видели; в этом запуске попап был) + сразу попытка в этом же тапе
  // (диалог ОС, если он нужен, — по нему; если доступ уже есть — запись просто стартует)
  const confirmExplain = useCallback(() => { perm.markExplained(); perm.markIntroSeen(); perm.markPreShown(); begin() }, [perm, begin])

  // Автопоказ попапа (useSayAutoPopup, через секунду после появления модуля): только ПОКАЗЫВАЕМ попап того же вида, что открыл бы тап на круг. Микрофон и start() не трогаем — они идут по кнопке в попапе (confirmExplain)
  const openExplain = useCallback(() => {
    if (stateRef.current.phase !== 'idle') return
    const d = perm.decide()
    if (d.action === 'explain') dispatch({ type: 'explain', kind: d.kind })
  }, [perm])

  // Закрыли попап мимо кнопки: ничего не просили и никаких флагов не ставим — попап покажем снова
  const cancelExplain = useCallback(() => dispatch({ type: 'explainCancel' }), [])

  // Из режима «Не могу говорить» вернуться к микрофону (если его не запретили)
  const enableMic = useCallback(() => { perm.setCantSpeak(false); dispatch({ type: 'enable' }) }, [perm])

  return {
    view: s.view, phase: s.phase, taps: s.taps, verdict: s.verdict, errorCode: s.errorCode,
    fallbackReason: s.fallbackReason, autoRetries: s.autoRetries, failStreak: s.failStreak, exhausted: s.exhausted,
    go: isGo(s), access: perm.access(), adminLine: waitNote ?? s.adminLine, hint: s.hint, reply: s.reply, level: levels, explainKind: s.explainKind,
    tapMic, openExplain, confirmExplain, cancelExplain, enableMic, emit, perm,
  }
}
