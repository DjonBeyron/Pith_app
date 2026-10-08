import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Settings } from 'lucide-react'
import { haptic } from '../../shared/lib/haptics.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { usePref, setPref } from './lessonPrefs.js'
import { useCopyLog } from './useCopyLog.js'
import { usePlayerPopover } from './usePlayerPopover.js'
import AdminAudioSliders from './settings/AdminAudioSliders.jsx'

// Шестерёнка в шапке урока (PlayerTopBar.jsx) и поповер «Настройки».
// Для всех — переключатели звука печатанья, звука XP и эквалайзера; у админа
// сверху ещё раздел «Админ»: лог, датчик fps и версия, ползунки звука.
// Состояние переключателей — lessonPrefs.js (localStorage). Поповер рисуется
// порталом в .lessonPlayer (usePlayerPopover.js) — иначе он оставался в слое шапки
// (z-index 5) и уходил под панели ответа, свечение и фото; позиция — под шапкой
// у правого края, а не у кнопки: справа от шестерёнки могут стоять другие
// кнопки, и меню не должно уезжать за экран.
// Закрытие — тапом вне, по Esc; фокус на первый пункт при открытии и обратно
// на шестерёнку при Esc (тот же паттерн, что у меню скорости).

function SwitchRow({ label, pref }) {
  const on = usePref(pref)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="smRow"
      onClick={() => { haptic(); setPref(pref, !on) }}
    >
      <span>{label}</span>
      <span className={`smSwitch${on ? ' smSwitch--on' : ''}`} aria-hidden="true" />
    </button>
  )
}

export default function LessonSettingsMenu({ onDownloadLog, onCopyLog }) {
  const { isAdmin } = useAdmin()
  const [copyState, handleCopy] = useCopyLog(onCopyLog)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const { open, host, style, toggle, close } = usePlayerPopover(wrapRef, { gap: 4, rightInset: 8, barSelector: '.playerTopBar' })

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!wrapRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) close()
    }
    const onKey = e => {
      if (e.key !== 'Escape') return
      close()
      btnRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    menuRef.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <div className="smWrap" ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className={`lvBtn${open ? ' lvBtn--on' : ''}`}
        onClick={() => { haptic(); toggle() }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Настройки"
        title="Настройки"
      >
        <Settings className="lvIcon" />
      </button>
      {open && createPortal(
        <div className="smMenu" role="dialog" aria-label="Настройки" ref={menuRef} style={style}>
          {isAdmin && (
            <section className="smSection" aria-label="Админ">
              <div className="smTitle">Админ</div>
              <button
                type="button"
                className="smRow"
                onClick={() => { haptic(); onDownloadLog?.(); close() }}
              >
                <span>Скачать лог</span>
                <span className="smIcon" aria-hidden="true">⬇</span>
              </button>
              <button type="button" className="smRow" onClick={() => { haptic(); handleCopy() }}>
                <span>
                  Скопировать лог
                  {copyState && (
                    <span className={`smCopyState smCopyState--${copyState}`} role="status">
                      {copyState === 'ok' ? ' · скопировано' : ' · не вышло'}
                    </span>
                  )}
                </span>
                <span className="smIcon" aria-hidden="true">{copyState === 'ok' ? '✓' : copyState === 'err' ? '✗' : '⧉'}</span>
              </button>
              <SwitchRow label="Показывать FPS и версию" pref="hud" />
              <div className="smSub">Громкость и эквалайзер</div>
              <AdminAudioSliders />
            </section>
          )}
          <section className="smSection" aria-label="Звук и свечение">
            <div className="smTitle">Настройки</div>
            <SwitchRow label="Звук печатанья" pref="typing" />
            <SwitchRow label="Звук получения XP" pref="xp" />
            <SwitchRow label="Эквалайзер" pref="equalizer" />
          </section>
        </div>,
        host,
      )}
    </div>
  )
}
