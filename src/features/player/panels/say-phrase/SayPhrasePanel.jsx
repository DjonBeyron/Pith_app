import { useState, useEffect, useRef, useMemo } from 'react'
import { useSayPhrase } from './useSayPhrase.js'
import SayStage from './SayStage.jsx'
import SayMicPopup from './SayMicPopup.jsx'
import SayActions from './SayActions.jsx'
import { listenKeys, playListen } from './sayListen.js'
import { readSayData } from '../../../../shared/lib/speech/sayPhraseData.js'
import { sayOutcome, phraseWords, SAY_EVENTS, TRIGGER_SKIP } from '../../../../shared/lib/speech/sayResult.js'
import { sayStatus, micLabel } from '../../../../shared/lib/speech/sayStatus.js'
import { adminHeardLine } from '../../../../shared/lib/speech/sayAdmin.js'
import { SAY_LABEL } from '../../../../shared/lib/speech/sayTexts.js'
import { setChatTones } from '../../modules/say-phrase/sayChatTones.js'
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

// Ученик видит итог в панели (зелёные слова, «Верно!»), потом панель уезжает
const SEE_RESULT_MS = 1100

// Панель «Сказать фразу» (монтируется ленивой обёрткой через паузу после появления фразы в чате): ученик
// произносит фразу в микрофон, приложение мягко сверяет её с эталоном (Web Speech API: порядок слов не важен, опечатки допустимы, порог и ключевые слова — из ноды). Звук не записывается и не сохраняется,
// на наш сервер уходит только результат. Корпус панели, кнопка «Проверить» (.phraseCheckBtn), подъём/спуск с историей
// и пузырь ответа — как у «Напечатай слово». Микрофон — только по тапу (useSayPhrase.js), штрафов нет (sayResult.js).
// Фраза в панели НЕ показывается: на её месте «Произнесите фразу», сама фраза — пузырём в чате (слова подсвечиваются там
// после проверки, sayChatTones.js). Пояснение про микрофон — отдельным попапом по центру (SayMicPopup.jsx). Звук приложения
// между концом записи и результатом не играет: «верно» при проверке голосом не звучит (см. finish).
export default function SayPhrasePanel({ node, onDone, onAnswered, onRevealAnswer, onHeightChange, xpAmount = 0, onXpEarned }) {
  const raw = node.typeData?.say_phrase
  const data = useMemo(() => readSayData(raw), [raw])
  const sp = useSayPhrase({ data, onEvent: track })
  const { phase, view, verdict } = sp
  const { isAdmin } = useAdmin()
  const pop = useHudPopupExit(phase === 'explain')
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
  // Раскраска слов в пузыре чата: после проверки — услышанные зелёные, пропущенные красные; новая попытка/новый показ — сброс
  useEffect(() => {
    if (phase === 'passed' || phase === 'failed') setChatTones(node.id, phraseWords(data.phrase, verdict).map(w => w.tone))
    else setChatTones(node.id, null)
  }, [phase, verdict, data.phrase, node.id])
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
    // Звук «верно» — только когда ученик сам подтвердил («Получилось»/админ). При проверке голосом (kind 'passed') приложение
    // молчит: любой наш звук рядом с концом записи ученик принимает за системный сигнал распознавания (iOS)
    if (kind !== 'passed') playSound('answer-correct', 'сказать фразу')
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
  const info = sayStatus({ phase, view, verdict, errorCode: sp.errorCode, fallbackReason: sp.fallbackReason, showPhrase: data.showPhrase })
  const mic = micLabel({ phase, view, verdict, fallbackReason: sp.fallbackReason })
  const adminLine = adminHeardLine({ isAdmin, phase, view }) // распознанный текст — только админу (sayAdmin.js)

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
          <p className="sayLabel" data-testid="say-label">{SAY_LABEL}</p>
          <SayStage
            label={mic.label}
            mode={mic.mode}
            info={info}
            disabled={closing || phase === 'passed' || (phase === 'failed' && !sp.canRetry)}
            onTap={tapMic}
          />
          {isAdmin && (
            <p className="sayAdminLine" data-testid="say-admin-line" title={adminLine?.title || undefined}>{adminLine?.text ?? ''}</p>
          )}
          <SayActions
            phase={phase}
            canRetry={sp.canRetry}
            canListen={keys.length > 0 && !running && phase !== 'passed' && !closing}
            listenBusy={listening}
            closing={closing}
            canEnable={phase === 'fallback' && sp.fallbackReason === 'cant_speak'}
            onRetry={sp.tapMic}
            onSelfOk={() => finish('self_ok')}
            onListen={toggleListen}
            onSkip={() => finish('skip')}
            onEnable={sp.enableMic}
          />
        </div>
      </div>
      {pop.shown && <SayMicPopup closing={pop.closing} onConfirm={sp.confirmExplain} onCancel={sp.cancelExplain} />}
    </>
  )
}
