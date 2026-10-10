import { useState, useEffect, useRef, useMemo } from 'react'
import { useSayPhrase } from './useSayPhrase.js'
import SayStage from './SayStage.jsx'
import SayMicPopup from './SayMicPopup.jsx'
import { useSayAutoPopup } from './useSayAutoPopup.js'
import SayActions from './SayActions.jsx'
import SayBrowserNote from './SayBrowserNote.jsx'
import { listenKeys, playListen } from './sayListen.js'
import { readSayData } from '../../../../shared/lib/speech/sayPhraseData.js'
import { sayOutcome, SAY_EVENTS } from '../../../../shared/lib/speech/sayResult.js'
import { successReply } from '../../../../shared/lib/speech/sayReply.js'
import { micLabel, isLiveMode } from '../../../../shared/lib/speech/sayMic.js'
import { micVisualState } from '../../../../shared/lib/speech/sayMicState.js'
import { autoPopupWanted } from '../../../../shared/lib/speech/sayAutoPopup.js'
import { HINT_DELAY_MS } from '../../../../shared/lib/speech/sayHints.js'
import { useAdmin } from '../../../../app/AdminContext.jsx'
import { useHudPopupExit } from '../../../../app/hudPopupState.js'
import { subscribeWordAudio } from '../../../../shared/lib/wordAudio/wordAudioApi.js'
import { track } from '../../../../shared/lib/analytics/track.js'
import { playSound } from '../../../../shared/lib/sounds.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import SolveCorrectButton from '../../admin/SolveCorrectButton.jsx'
import SayAdminDiag from './diag/SayAdminDiag.jsx'

// Ученик видит итог в панели («Верно!»), потом панель уезжает
const SEE_RESULT_MS = 1100
// После третьей неудачи: пауза, чтобы ученик увидел последнюю реплику и подсказку в чате, и панель уходит по ветке «неверный» (как SEE_RESULT_MS у «Напечатай слово»)
const WRONG_PAUSE_MS = 700

// Панель «Сказать фразу»: ученик произносит фразу в микрофон, приложение мягко сверяет её с эталоном (Web Speech API: порядок слов
// не важен, опечатки допустимы, порог и ключевые слова — из ноды; «Строго» — консенсус interim+final). Звук не записывается и не
// сохраняется, на наш сервер уходит только результат. Корпус панели, кнопка (.phraseCheckBtn), подъём/спуск с историей и пузырь
// ответа — как у «Напечатай слово»; поднимается сразу после предыдущей ноды (пузыря от самого модуля в чате НЕТ: задание ученику
// формулирует сообщение автора перед модулем, фраза в панели не показывается). Микрофон — только по тапу (useSayPhrase.js),
// штрафов нет (sayResult.js). Внутри панели: по центру высоты — КРУГЛАЯ кнопка-микрофон с волнами/эквалайзером (SayStage.jsx), над ней
// надпись, плавно меняющаяся по состоянию («Нажмите, чтобы говорить» → «Произнесите фразу» → «Попробуйте сказать ещё раз»; SayCaption.jsx),
// внизу тихие ссылки. Счётчика попыток нет. Каждая НЕУДАЧНАЯ попытка уходит в ЧАТ: сначала реплика ученика — то, что распознал движок,
// справа (onAnswered(text, 'wrong_final'), как неверные ответы в «Напечатай слово»/«Собери фразу»; тишина — реплики нет), затем подсказка
// ведущего слева (onAnswered(text, 'hint'); тексты — поля ноды, sayHints.js). Оба сообщения идут через HINT_DELAY_MS: пузыри приходят уже после
// окна тишины звуков приложения; если ученик нажал на круг раньше — реплика уходит сразу, подсказка о прошлой попытке отменяется.
// «Ещё раз»/«Получилось» убраны: после неудачи микрофон сразу снова доступен, при отказе микрофона единственный выход — «Я не могу говорить».
// ТРИ засчитанные неудачи (счёт внутренний и ученику НЕ показывается: sayFlow.js — распознано что-то, пусть неверное; тишина не тратит, три тишины подряд = одна) →
// реплика и подсказка уходят в чат как обычно, через WRONG_PAUSE_MS панель закрывается итогом say_wrong (ветка «неверный»), микрофон до этого заблокирован.
// «Я не могу говорить» — итог say_cant: плеер идёт по ветке «верный» и пропускает сообщение-успех сразу после модуля (sayPairSkip.sayExit; флага в сессии нет).
// Firefox (sayBrowser.js): вместо круга — пояснение «откройте в Safari или Chrome» (SayBrowserNote), выход тот же — «Я не могу говорить».
// Вид круга по доступу к микрофону (нет доступа / доступ выдан / запись / «Готово») — micVisualState (sayMicState.js), класс на корне круга (SayStage). Попап перед запросом микрофона — SayMicPopup (карточка над модулем: полный в первый раз, короткий дальше; сам показывается через секунду, useSayAutoPopup). Админская палочка «засчитать» — слева вверху
// (side="left"). Админская строка «что услышал движок» — плашка НАД панелью (вне модуля, высоту не меняет), остаётся до новой записи.
// data-no-unlock на корне панели ЦЕЛИКОМ: ни одно касание внутри неё (микрофон, «Послушать», «Я не могу говорить») не запускает беззвучный wav/resume — аудиосессию iOS не трогаем.
export default function SayPhrasePanel({ node, onDone, onAnswered, onRevealAnswer, onHeightChange, xpAmount = 0, onXpEarned }) {
  const raw = node.typeData?.say_phrase
  const data = useMemo(() => readSayData(raw), [raw])
  const sp = useSayPhrase({ data, onEvent: track })
  const { phase } = sp
  const { isAdmin } = useAdmin()
  const pop = useHudPopupExit(phase === 'explain')
  const [show, setShow] = useState(false)
  const [closing, setClosing] = useState(false)
  const [listening, setListening] = useState(false) // играет эталон («Послушать»)
  const [, bumpLib] = useState(0)
  const panelRef = useRef(null)
  const closingRef = useRef(false)
  const stopListenRef = useRef(null)
  const hintTimer = useRef(0)
  const wrongTimer = useRef(0) // закрытие по ветке «неверный» после третьей неудачи
  const pendingReply = useRef(null) // реплика ученика, ещё не ушедшая в чат (ждёт HINT_DELAY_MS)
  const panelHeight = usePanelHeight(panelRef, onHeightChange)
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.sayPhraseSpacer', panelH: panelHeight, label: 'sp' })

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])
  // База озвучки слов может догрузиться уже после показа панели — кнопка «Послушать» появится сама
  useEffect(() => subscribeWordAudio(() => bumpLib(n => n + 1)), [])
  useEffect(() => () => { stopListenRef.current?.(); clearTimeout(hintTimer.current); clearTimeout(wrongTimer.current) }, [])

  const keys = data.listenAudio ? listenKeys(data.phrase) : []

  // Неудача → в чат: реплика ученика (справа) и подсказка ведущего (слева). failNo растёт с каждой неудачей, поэтому эффект срабатывает ровно один раз на неудачу.
  // Третья засчитанная неудача (sp.exhausted): после реплики и подсказки — пауза WRONG_PAUSE_MS и закрытие по ветке «неверный»
  const failNo = sp.failStreak
  useEffect(() => {
    if (!failNo || phase !== 'failed') return undefined
    const reply = sp.reply?.text
    const hint = sp.hint?.text
    if (sp.exhausted) wrongTimer.current = setTimeout(() => finish('wrong'), (reply || hint ? HINT_DELAY_MS : 0) + WRONG_PAUSE_MS)
    if (!reply && !hint) return undefined
    pendingReply.current = reply || null
    hintTimer.current = setTimeout(() => {
      pendingReply.current = null
      if (reply) onAnswered?.(reply, 'wrong_final')
      if (hint) onAnswered?.(hint, 'hint')
    }, HINT_DELAY_MS)
    return () => clearTimeout(hintTimer.current)
  }, [failNo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Отменить ещё не отправленную подсказку; реплика ученика (его попытка) в чате не теряется — уходит сразу
  function flushPending() {
    clearTimeout(hintTimer.current)
    const reply = pendingReply.current
    pendingReply.current = null
    if (reply) onAnswered?.(reply, 'wrong_final')
  }

  // Уход панели: пузырь ответа встаёт в ленту НЕВИДИМЫМ (arriving) тем же тиком, что и setShow(false); на остановке
  // истории хук проявляет его, после въезда закрывает ноду (как у «Напечатай слово»)
  function closeWith(trigger, sendBubble) {
    rise.prepareClose({ reveal: {
      onReveal: () => onRevealAnswer?.(),
      done: () => { onHeightChange?.(0); onDone?.(trigger) },
    } })
    sendBubble?.()
    setShow(false)
  }

  // kind: passed | skip | wrong (три неудачи) | solve (админская палочка: как успех, но без аналитики). Единственная точка выхода; правила результата — sayOutcome (штрафа нет никогда)
  function finish(kind) {
    if (closingRef.current) return
    closingRef.current = true
    clearTimeout(wrongTimer.current)
    flushPending()
    setClosing(true)
    stopListenRef.current?.()
    const out = sayOutcome({ kind })
    if (kind === 'skip') {
      sp.emit(SAY_EVENTS.skip, { reason: sp.fallbackReason || 'user' })
      closeWith(out.trigger) // say_cant: ветка «верный» без сообщения-успеха (sayPairSkip.sayExit), ничего не запоминается
      return
    }
    if (kind === 'wrong') { closeWith(out.trigger); return } // say_wrong: реплика и подсказка последней попытки уже в чате (эффект выше)
    // Звук «верно» — только у админской палочки. При проверке голосом приложение молчит: любой наш звук рядом с концом записи
    // ученик принимает за системный сигнал распознавания (окно тишины — soundQuiet.js)
    if (kind === 'solve') playSound('answer-correct', 'сказать фразу')
    if (xpAmount > 0) onXpEarned?.(xpAmount, { expectBubble: true })
    if (isRewardOn('say_phrase', raw)) fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
    closeWith(out.trigger, () => onAnswered?.(kind === 'passed' ? successReply(sp.verdict, data.phrase) : data.phrase, 'correct', true)) // успех с пропущенными словами — услышанное, а не эталон (sayReply.successReply)
  }

  // Проверка прошла → показываем «Верно!» и через паузу уезжаем
  useEffect(() => {
    if (phase !== 'passed') return
    const t = setTimeout(() => finish('passed'), SEE_RESULT_MS)
    return () => clearTimeout(t)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleListen() {
    if (stopListenRef.current) { stopListenRef.current(); return }
    setListening(true)
    stopListenRef.current = playListen(keys, { onEnded: () => { stopListenRef.current = null; setListening(false) } })
  }

  function tapMic() {
    flushPending() // новая попытка: подсказка о прошлой уже не нужна, а реплика ученика уходит сразу
    stopListenRef.current?.()
    sp.tapMic()
  }

  const running = phase === 'run'
  const micState = micVisualState({ ...sp.access, phase }) // locked | ready | active | done | off: вид круга (нет доступа / доступ выдан / запись / «Готово» / выключен)
  const mic = micLabel({ phase, fallbackReason: sp.fallbackReason, go: sp.go, exhausted: sp.exhausted, locked: micState === 'locked' })
  const noMic = phase === 'fallback' && sp.fallbackReason === 'browser' // Firefox: вместо круга — пояснение
  const hideSkip = isLiveMode(mic.mode) || mic.mode === 'ok' // идёт запись или итог: «Я не могу говорить» плавно гаснет, не отвлекая
  const adminLine = isAdmin ? sp.adminLine : null // распознанный текст — только админу (sayAdmin.js)
  // Попап разрешения сам появляется через секунду после появления модуля (условия — sayAutoPopup.autoPopupWanted, один раз за монтирование); микрофон не трогает
  useSayAutoPopup({ visible: show, phase, open: sp.openExplain, wanted: autoPopupWanted({ visible: show, closing, phase, taps: sp.taps, micState, decision: sp.perm.decide() }) })

  if (!data.phrase) return null

  return (
    <>
      {/* Распорка: на подъёме и спуске высота меняется РАЗОМ (panelRise.js), между ними плавно следует за панелью */}
      <div
        className="sayPhraseSpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show && !rise.opening ? 'height 0.26s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      />
      <div ref={panelRef} className={`phrasePanel sayPanel${show ? ' phrasePanelVisible' : ''}`} data-no-unlock="">
        <SolveCorrectButton side="left" onSolve={() => finish('solve')} disabled={closing} />
        <SayAdminDiag phrase={data.phrase} />
        {adminLine && (
          <div className="sayAdminLine" data-testid="say-admin-line" title={adminLine.title || undefined}>
            <span>{adminLine.text}</span>
            <span className="sayAdminNote">{adminLine.note}</span>
          </div>
        )}
        <div className="phraseInner sayInner">
          <div className={`sayBody${noMic ? ' sayBody--noMic' : ''}`}>
            {noMic ? <SayBrowserNote /> : (
              <SayStage
                label={mic.label}
                mode={mic.mode}
                state={micState}
                level={sp.level}
                disabled={closing || phase === 'passed' || sp.exhausted}
                onTap={tapMic}
              />
            )}
            <SayActions
              canListen={keys.length > 0 && !running && phase !== 'passed' && !closing}
              listenBusy={listening}
              closing={closing}
              canEnable={phase === 'fallback' && sp.fallbackReason === 'cant_speak'}
              hideSkip={hideSkip}
              onListen={toggleListen}
              onSkip={() => finish('skip')}
              onEnable={sp.enableMic}
            />
          </div>
        </div>
        {pop.shown && <SayMicPopup kind={sp.explainKind} closing={pop.closing} onConfirm={sp.confirmExplain} onCancel={sp.cancelExplain} />}
      </div>
    </>
  )
}
