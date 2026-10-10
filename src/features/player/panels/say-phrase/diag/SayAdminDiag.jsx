import { useState, useEffect, useRef } from 'react'
import { Info } from 'lucide-react'
import { useAdmin } from '../../../../../app/AdminContext.jsx'
import { useSayDiag } from './useSayDiag.js'
import SayDiagPanel from './SayDiagPanel.jsx'

// Админская диагностика «Сказать фразу» прямо в уроке: маленькая кнопка «i» (26 px) в правом верхнем углу панели; нажатие открывает окно ПОВЕРХ (абсолютно: оно не растягивает модуль и не двигает
// его раскладку, на 320 px не выходит за экран, внутри прокручивается). Закрыть — повторным нажатием на «i», тапом мимо или Esc. Обычному пользователю не рендерится вовсе (isAdmin — эффективный статус
// из AdminContext, как у плашки «движок: …»). Пока окно закрыто — никаких таймеров (useSayDiag.js). Что показываем и почему — sayDiagRows.js / sayDiagExplain.js.
export default function SayAdminDiag({ phrase, voice = false }) {
  const { isAdmin } = useAdmin()
  return isAdmin ? <DiagInner phrase={phrase} voice={voice} /> : null
}

function DiagInner({ phrase, voice }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const ctx = useSayDiag(open, phrase, voice)

  // Закрытие тапом мимо и по Esc — слушатели живут только пока окно открыто
  useEffect(() => {
    if (!open) return undefined
    const onDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="sayDiag" ref={rootRef} data-testid="say-diag">
      <button
        type="button"
        className={`sayDiagBtn${open ? ' sayDiagBtn--on' : ''}`}
        aria-label="Диагностика модуля (админ)"
        title="Диагностика модуля (админ)"
        aria-expanded={open}
        onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <Info size={14} />
      </button>
      {open && (
        <div className="sayDiagPop" role="dialog" aria-label="Диагностика модуля «Сказать фразу»" data-testid="say-diag-pop">
          <SayDiagPanel ctx={ctx} />
        </div>
      )}
    </div>
  )
}
