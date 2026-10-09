import { useState, useEffect, useRef, useMemo } from 'react'
import { useSayPhrase } from './useSayPhrase.js'
import SayStage from './SayStage.jsx'
import SayWords from './SayWords.jsx'
import SayActions from './SayActions.jsx'
import { listenKeys, playListen } from './sayListen.js'
import { readSayData } from '../../../../shared/lib/speech/sayPhraseData.js'
import { sayOutcome, phraseWords, SAY_EVENTS, TRIGGER_SKIP } from '../../../../shared/lib/speech/sayResult.js'
import { sayStatus } from '../../../../shared/lib/speech/sayStatus.js'
import { subscribeWordAudio } from '../../../../shared/lib/wordAudio/wordAudioApi.js'
import { track } from '../../../../shared/lib/analytics/track.js'
import { playSound } from '../../../../shared/lib/sounds.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import SolveCorrectButton from '../../admin/SolveCorrectButton.jsx'

// Ученик видит итог в панели (зелёные слова, «Верно!»), потом панель уезжает
const SEE_RESULT_MS = 1100

// Панель «Сказать фразу»: ученик произносит фразу в микрофон, приложение мягко сверяет её с эталоном (Web Speech API:
// порядок слов не важен, опечатки допустимы, порог и ключевые слова — из ноды). Звук не записывается и не сохраняется,
// на наш сервер уходит только результат. Корпус панели, кнопка «Проверить» (.phraseCheckBtn), подъём/спуск с историей
// и пузырь ответа — как у «Напечатай слово». Микрофон — только по тапу (useSayPhrase.js), штрафов нет (sayResult.js).
export default function SayPhrasePanel({ node, onDone, onAnswered, onRevealAnswer, onHeightChange, xpAmount = 0, onXpEarned }) {
  const raw = node.typeData?.say_phrase
  const data = useMemo(() => readSayData(raw), [raw])
  const sp = useSayPhrase({ data, onEvent: track })
  const { phase, view, verdict } = sp
  const [show, setShow] = useState(false)
  const [closing, setClosing] = useState(false)
  const [listening, setListening] = useState(false) // играет эталон («Послушать»)
  const [, bumpLib] = useState(0)
  const panelRef = useRef(null)
  const closingRef = useRef(false)
  const stopListenRef = useRef(null)
  const panelHeight = usePanelHeight(panelRef, onHeightChange)
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.sayPhraseSpacer', panelH: panelHeight, label: 'sp' })

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])
  // База озвучки слов может догрузиться уже после показа панели — кнопка «Послушать» появится сама
  useEffect(() => subscribeWordAudio(() => bumpLib(n => n + 1)), [])
  useEffect(() => () => stopListenRef.current?.(), [])

  const keys = data.listenAudio ? listenKeys(data.phrase) : []
  const hasSkipLink = (node.triggers ?? []).some(t => t.if === TRIGGER_SKIP && t.then)

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

  // kind: passed | self_ok | skip | solve (админская палочка: как «Получилось», но без аналитики). Единственная точка выхода; правила результата — sayOutcome (штрафа нет никогда)
  function finish(kind) {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    stopListenRef.current?.()
    const out = sayOutcome({ kind, taps: sp.taps, autoRetries: sp.autoRetries, hasSkipLink })
    if (kind === 'skip') {
      sp.perm.setCantSpeak(true) // дальше в этой сессии — сразу запасной режим, без попыток микрофона
      sp.emit(SAY_EVENTS.skip, { reason: sp.fallbackReason || 'user' })
      closeWith(out.trigger)
      return
    }
    if (kind === 'self_ok') sp.emit(SAY_EVENTS.selfOk, { reason: sp.fallbackReason })
    playSound('answer-correct', 'сказать фразу')
    if (xpAmount > 0) onXpEarned?.(xpAmount, { expectBubble: true })
    if (isRewardOn('say_phrase', raw)) fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
    closeWith(out.trigger, () => onAnswered?.(data.phrase, 'correct', true))
  }

  // Проверка прошла → показываем зелёные слова и через паузу уезжаем
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
    stopListenRef.current?.()
    sp.tapMic()
  }

  const running = phase === 'run'
  const info = sayStatus({ phase, view, verdict, errorCode: sp.errorCode, fallbackReason: sp.fallbackReason })
  const noMic = phase === 'fallback'
  const extra = noMic && sp.fallbackReason === 'cant_speak'
    ? <button type="button" className="sayInlineLink" onClick={sp.enableMic}>Включить микрофон</button> : null

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
        <div className="phraseInner sayInner">
          <SayWords words={phraseWords(data.phrase, phase === 'passed' || phase === 'failed' ? verdict : null)} />
          <SayStage
            info={info}
            listening={running && view.status === 'listening'}
            busy={running}
            off={noMic}
            disabled={closing || phase === 'passed' || phase === 'explain' || (phase === 'failed' && !sp.canRetry)}
            onTap={tapMic}
            extra={extra}
          />
          <SayActions
            phase={phase}
            canRetry={sp.canRetry}
            canListen={keys.length > 0 && !running && phase !== 'passed' && !closing}
            listenBusy={listening}
            closing={closing}
            onExplain={sp.confirmExplain}
            onRetry={sp.tapMic}
            onSelfOk={() => finish('self_ok')}
            onListen={toggleListen}
            onSkip={() => finish('skip')}
          />
        </div>
      </div>
    </>
  )
}
