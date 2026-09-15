import { useEffect, useRef } from 'react'
import HighlightedText from '../../../../shared/ui/HighlightedText.jsx'

// Оверлей одного «сигнала ошибки» (см. PROJECT.md) — ссылка автора на любую
// ноду урока (аудио/текст/стикер/...), которая играет ПОВЕРХ ещё открытой
// панели таблицы/«Собери фразу», а не продолжает граф урока. У самой ноды
// нет здесь смысла в её триггерах — по завершении содержимого просто
// зовём onDone и возвращаем управление панели (мигающее слово).
//
// Это НЕ полноценный модуль ленты (AudioModule/TextModule/...): у них своя
// логика пузырей чата, реплаев, переводов — ничего из этого оверлею не
// нужно, он живёт секунды и исчезает. Поэтому рендер содержимого — свой,
// облегчённый, по типу ноды by, с разумными дефолтами автозавершения:
// аудио/видео — по концу воспроизведения (как «played» у обычных нод),
// текст/картинка/всё прочее — по короткому таймеру.
const TEXT_DISMISS_MS  = 1800
const MEDIA_FALLBACK_MS = 6000 // страховка, если 'ended' так и не пришёл

function resolveFileSrc(node, lessonFiles) {
  const t = node.typeData?.[node.type] ?? {}
  const file = (lessonFiles ?? []).find(f => f.id === t.file_id)
  return file?.blobUrl ?? file?.r2Url ?? t.r2Url ?? null
}

// Таймер-дисмисс — общий путь для текстовых/статичных типов и как страховка
// для медиа, которое почему-то не прислало 'ended'
function useTimerDismiss(ms, onDone, active = true) {
  const doneRef = useRef(onDone)
  // Обновление ref — ТОЛЬКО в эффекте, не во время рендера (иначе
  // react-hooks/refs ругается: значение рефа не нужно для самого рендера)
  useEffect(() => { doneRef.current = onDone })
  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => doneRef.current?.(), ms)
    return () => clearTimeout(id)
  }, [ms, active])
}

function SignalCard({ children }) {
  return (
    <div className="signalOverlay">
      <div className="signalOverlayCard" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function TextSignal({ node, onDone }) {
  const t = node.typeData?.[node.type] ?? {}
  const content = t.content ?? t.caption ?? ''
  useTimerDismiss(TEXT_DISMISS_MS, onDone)
  return (
    <SignalCard>
      <p className="signalOverlayText">
        {content
          ? <HighlightedText text={content} highlights={t.highlights ?? []} />
          : <span className="signalOverlayEmpty">…</span>}
      </p>
    </SignalCard>
  )
}

function AudioSignal({ node, lessonFiles, onDone }) {
  const t = node.typeData?.audio ?? {}
  const src = resolveFileSrc(node, lessonFiles)
  useTimerDismiss(MEDIA_FALLBACK_MS, onDone, !!src) // страховка поверх onEnded
  useTimerDismiss(TEXT_DISMISS_MS, onDone, !src)    // файла нет — как текст
  return (
    <SignalCard>
      {src && <audio src={src} autoPlay onEnded={onDone} />}
      <p className="signalOverlayText">
        {t.text
          ? <HighlightedText text={t.text} highlights={t.highlights ?? []} />
          : <span className="signalOverlayEmpty">🔊</span>}
      </p>
    </SignalCard>
  )
}

function MediaSignal({ node, lessonFiles, onDone }) {
  const t = node.typeData?.[node.type] ?? {}
  const isVideo = node.type !== 'photo' && (node.type === 'video' || node.type === 'circle' || t.isVideo)
  const src = resolveFileSrc(node, lessonFiles)
  useTimerDismiss(MEDIA_FALLBACK_MS, onDone, isVideo && !!src)
  useTimerDismiss(TEXT_DISMISS_MS, onDone, !(isVideo && !!src))
  return (
    <SignalCard>
      {src && (isVideo
        ? <video className="signalOverlayMedia" src={src} autoPlay muted playsInline onEnded={onDone} />
        : <img className="signalOverlayMedia" src={src} alt="" />)}
      {!src && <span className="signalOverlayEmpty">🖼</span>}
      {t.caption && <p className="signalOverlayText">{t.caption}</p>}
    </SignalCard>
  )
}

// Любой другой тип ноды (выборы, система, регистрация...) — сигнал ей
// подходит редко, но автор может сослаться и на такую: краткий фолбэк по
// таймеру, чтобы урок не завис, если это случится
function GenericSignal({ node, onDone }) {
  const t = node.typeData?.[node.type] ?? {}
  const text = t.content ?? t.caption ?? t.text ?? ''
  useTimerDismiss(TEXT_DISMISS_MS, onDone)
  return (
    <SignalCard>
      <p className="signalOverlayText">{text || '…'}</p>
    </SignalCard>
  )
}

export default function SignalOverlay({ node, lessonFiles, onDone }) {
  if (!node) return null
  if (node.type === 'text' || node.type === 'pin_message' || node.type === 'system' || node.type === 'rotate_phone') {
    return <TextSignal node={node} onDone={onDone} />
  }
  if (node.type === 'audio') return <AudioSignal node={node} lessonFiles={lessonFiles} onDone={onDone} />
  if (node.type === 'sticker' || node.type === 'photo' || node.type === 'video' || node.type === 'circle') {
    return <MediaSignal node={node} lessonFiles={lessonFiles} onDone={onDone} />
  }
  return <GenericSignal node={node} onDone={onDone} />
}
