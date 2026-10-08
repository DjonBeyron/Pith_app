import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Volume2, VolumeX } from 'lucide-react'
import { haptic } from '../../shared/lib/haptics.js'
import { usePlayerPopover } from './usePlayerPopover.js'
import { useLessonMuted, setLessonMuted, useVoiceRate, setVoiceRate, VOICE_RATES } from './lessonVolume.js'

// Две кнопки шапки урока (PlayerTopBar.jsx): «без звука» и скорость голоса.
// Состояние — lessonVolume.js (localStorage, общее для всех уроков); кто и
// как его слушает — см. комментарий там. Меню скорости — порталом в .lessonPlayer
// (usePlayerPopover.js): внутри шапки оно уходило под панели ответа и свечение.

const fmtRate = r => `${r}×`

// Включили «без звука» посреди звучания — глушим ВСЁ сразу, не дожидаясь
// перерисовки модулей: медиа внутри плеера плюс прогретый элемент диктанта,
// который живёт в body (primedAudio.js, помечен data-solo-lock). Обратно
// ничего не включаем: голосовое и диктант вернут звук сами (muted-проп /
// подписка), а видео и кружки крутят свои беззвучные петли — их не трогаем
function muteAllMedia(root) {
  const inside = root ? [...root.querySelectorAll('audio, video')] : []
  const primed = typeof document !== 'undefined' ? [...document.querySelectorAll('[data-solo-lock]')] : []
  for (const m of [...inside, ...primed]) { try { m.muted = true } catch { /* ignore */ } }
}

export default function LessonVolumeButtons() {
  const muted = useLessonMuted()
  const rate  = useVoiceRate()
  const wrapRef = useRef(null)
  const rateBtnRef = useRef(null)
  const menuRef = useRef(null)
  const { open, host, style, toggle, close } = usePlayerPopover(wrapRef, { gap: 6 })

  // Меню закрывается тапом вне, по Esc и по выбору пункта; фокус — на
  // выбранный пункт при открытии и обратно на кнопку при закрытии
  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!wrapRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) close()
    }
    const onKey = e => {
      if (e.key !== 'Escape') return
      close()
      rateBtnRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  function toggleMute() {
    haptic()
    const next = !muted
    setLessonMuted(next)
    if (next) muteAllMedia(wrapRef.current?.closest('.lessonPlayer'))
  }

  function pick(r) {
    haptic()
    setVoiceRate(r)
    close()
    rateBtnRef.current?.focus()
  }

  return (
    <div className="lvWrap" ref={wrapRef}>
      <button
        type="button"
        className={`lvBtn${muted ? ' lvBtn--muted' : ''}`}
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muted ? 'Включить звук урока' : 'Выключить звук урока'}
        title={muted ? 'Включить звук' : 'Без звука'}
      >
        {muted ? <VolumeX className="lvIcon" /> : <Volume2 className="lvIcon" />}
      </button>
      <button
        type="button"
        ref={rateBtnRef}
        className={`lvBtn lvBtnRate${rate !== 1 ? ' lvBtn--on' : ''}`}
        onClick={() => { haptic(); toggle() }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Скорость голосового сообщения: ${fmtRate(rate)}`}
        title="Скорость голоса"
      >{fmtRate(rate)}</button>
      {open && createPortal(
        <div className="lvMenu" role="menu" aria-label="Скорость голосового сообщения" ref={menuRef} style={style}>
          <div className="lvMenuTitle">Скорость голосового сообщения</div>
          {VOICE_RATES.map(r => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === rate}
              className={`lvMenuItem${r === rate ? ' lvMenuItem--on' : ''}`}
              onClick={() => pick(r)}
            >
              <span>{fmtRate(r)}{r === 1 ? <span className="lvMenuHint"> · обычная</span> : null}</span>
              {r === rate && <span className="lvMenuCheck" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>,
        host,
      )}
    </div>
  )
}
