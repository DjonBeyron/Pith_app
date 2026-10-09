import { useState, useEffect, useRef, useMemo } from 'react'
import { useSayPhrase } from './useSayPhrase.js'
import SayStage from './SayStage.jsx'
import SayMicPopup from './SayMicPopup.jsx'
import SayActions from './SayActions.jsx'
import { listenKeys, playListen } from './sayListen.js'
import { readSayData } from '../../../../shared/lib/speech/sayPhraseData.js'
import { sayOutcome, SAY_EVENTS, TRIGGER_SKIP } from '../../../../shared/lib/speech/sayResult.js'
import { micLabel } from '../../../../shared/lib/speech/sayMic.js'
import { HINT_DELAY_MS } from '../../../../shared/lib/speech/sayHints.js'
import { SAY_LABEL } from '../../../../shared/lib/speech/sayTexts.js'
import { setCantSpeakSession } from '../../../../shared/lib/speech/cantSpeakFlag.js'
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

// Ученик видит итог в панели («Верно!»), потом панель уезжает
const SEE_RESULT_MS = 1100

// Панель «Сказать фразу»: ученик произносит фразу в микрофон, приложение мягко сверяет её с эталоном (Web Speech API: порядок слов
// не важен, опечатки допустимы, порог и ключевые слова — из ноды; «Строго» — консенсус interim+final). Звук не записывается и не
// сохраняется, на наш сервер уходит только результат. Корпус панели, кнопка (.phraseCheckBtn), подъём/спуск с историей и пузырь
// ответа — как у «Напечатай слово»; поднимается сразу после предыдущей ноды (пузыря от самого модуля в чате НЕТ: задание ученику
// формулирует сообщение автора перед модулем, фраза в панели не показывается). Микрофон — только по тапу (useSayPhrase.js),
// штрафов нет (sayResult.js). Внутри панели НЕТ текстов-подсказок: заголовок «Произнесите фразу» (гаснет на нажатии, место остаётся),
// по центру высоты панели — кнопка-морфинг с кольцами (SayStage.jsx), внизу тихие ссылки. Подсказки после неудачной попытки уходят
// в ЧАТ пузырями слева (onAnswered(text, 'hint'), как реплики «Собери фразу»; тексты — поля ноды, sayHints.js), с задержкой
// HINT_DELAY_MS: пузырь приходит уже после окна тишины звуков приложения. «Ещё раз»/«Получилось» убраны: после неудачи микрофон снова
// доступен, при отказе микрофона единственный выход — «Я не могу говорить». Пояснение про микрофон — попап SayMicPopup.
// Админская строка «что услышал движок» — плашка НАД панелью (вне модуля, высоту не меняет), остаётся до новой записи.
export default function SayPhrasePanel({ node, onDone, onAnswered, onRevealAnswer, onHeightChange, xpAmount = 0, onXpEarned }) {
  const raw = node.typeData?.say_phrase
  const data = useMemo(() => readSayData(raw), [raw])
  const sp = useSayPhrase({ data, onEvent: track })
  const { phase, verdict } = sp
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
  const panelHeight = usePanelHeight(panelRef, onHeightChange)
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.sayPhraseSpacer', panelH: panelHeight, label: 'sp' })

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])
  // База озвучки слов может догрузиться уже после показа панели — кнопка «Послушать» появится сама
  useEffect(() => subscribeWordAudio(() => bumpLib(n => n + 1)), [])
  useEffect(() => () => { stopListenRef.current?.(); clearTimeout(hintTimer.current) }, [])

  const keys = data.listenAudio ? listenKeys(data.phrase) : []
  const hasSkipLink = (node.triggers ?? []).some(t => t.if === TRIGGER_SKIP && t.then)

  // Подсказка после неудачи → в чат слева. n растёт с каждой подсказкой, поэтому эффект срабатывает ровно один раз на неудачу
  const hintNo = sp.hint?.n ?? 0
  useEffect(() => {
    if (!hintNo) return undefined
    const text = sp.hint.text
    hintTimer.current = setTimeout(() => onAnswered?.(text, 'hint'), HINT_DELAY_MS)
    return () => clearTimeout(hintTimer.current)
  }, [hintNo]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // kind: passed | skip | solve (админская палочка: как успех, но без аналитики). Единственная точка выхода; правила результата — sayOutcome (штрафа нет никогда)
  function finish(kind) {
    if (closingRef.current) return
    closingRef.current = true
    clearTimeout(hintTimer.current)
    setClosing(true)
    stopListenRef.current?.()
    const out = sayOutcome({ kind, hasSkipLink })
    if (kind === 'skip') {
      setCantSpeakSession(true) // дальше в этой сессии плеер сам пропускает say_phrase вместе с парой сообщений (sayPairSkip.js)
      sp.emit(SAY_EVENTS.skip, { reason: sp.fallbackReason || 'user' })
      closeWith(out.trigger)
      return
    }
    // Звук «верно» — только у админской палочки. При проверке голосом приложение молчит: любой наш звук рядом с концом записи
    // ученик принимает за системный сигнал распознавания (окно тишины — soundQuiet.js)
    if (kind === 'solve') playSound('answer-correct', 'сказать фразу')
    if (xpAmount > 0) onXpEarned?.(xpAmount, { expectBubble: true })
    if (isRewardOn('say_phrase', raw)) fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
    closeWith(out.trigger, () => onAnswered?.(data.phrase, 'correct', true))
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
    clearTimeout(hintTimer.current) // новая попытка: подсказка о прошлой уже не нужна
    stopListenRef.current?.()
    sp.tapMic()
  }

  const running = phase === 'run'
  const mic = micLabel({ phase, verdict, fallbackReason: sp.fallbackReason, go: sp.go })
  const adminLine = isAdmin ? sp.adminLine : null // распознанный текст — только админу (sayAdmin.js)

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
      <div ref={panelRef} className={`phrasePanel sayPanel${show ? ' phrasePanelVisible' : ''}`}>
        <SolveCorrectButton onSolve={() => finish('solve')} disabled={closing} />
        {adminLine && (
          <div className="sayAdminLine" data-testid="say-admin-line" title={adminLine.title || undefined}>
            <span>{adminLine.text}</span>
            <span className="sayAdminNote">{adminLine.note}</span>
          </div>
        )}
        <div className="phraseInner sayInner">
          <div className="sayBody">
            <p className={`sayLabel${running || phase === 'passed' ? ' sayLabel--hidden' : ''}`} data-testid="say-label">{SAY_LABEL}</p>
            <SayStage
              label={mic.label}
              mode={mic.mode}
              voice={sp.voice}
              disabled={closing || phase === 'passed'}
              onTap={tapMic}
            />
            <SayActions
              canListen={keys.length > 0 && !running && phase !== 'passed' && !closing}
              listenBusy={listening}
              closing={closing}
              canEnable={phase === 'fallback' && sp.fallbackReason === 'cant_speak'}
              onListen={toggleListen}
              onSkip={() => finish('skip')}
              onEnable={sp.enableMic}
            />
          </div>
        </div>
      </div>
      {pop.shown && <SayMicPopup closing={pop.closing} onConfirm={sp.confirmExplain} onCancel={sp.cancelExplain} />}
    </>
  )
}
