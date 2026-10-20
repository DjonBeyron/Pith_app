import { useEffect, useRef, useState } from 'react'
import { TYPE_SHORT } from '../nodeTypes.js'

// Значок «⚠ N» в шапке канваса и «Разбора» (useLessonHealth.js): ноды, у которых файл потерян, ссылка отдаёт 404/ошибку
// или файл пустой. Клик — список; клик по строке — телепорт к ноде на холсте (onFocus: focusNode / focusNodeTop в разборе).
// Пока идёт проверка — пунктирная метка «файлы 12/40…»; всё цело — ничего не рисует.
export default function BrokenNodesBadge({ health, onFocus }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])
  if (!health) return null
  const { broken, unknown, checked, total, checking, recheck } = health
  if (!broken.length && !checking && !unknown) return null
  return (
    <span className="hlthWrap" ref={rootRef}>
      <button
        type="button"
        className={`hlthBadge${broken.length ? ' hlthBadge--bad' : checking ? ' hlthBadge--busy' : ' hlthBadge--warn'}`}
        title={broken.length ? `Сломанных нод: ${broken.length} — нажми, список` : checking ? 'Проверяю файлы урока' : `Не удалось проверить ссылок: ${unknown}`}
        onClick={() => setOpen(v => !v)}
      >
        {broken.length ? `⚠ ${broken.length}` : checking ? `файлы ${checked}/${total}…` : `? ${unknown}`}
      </button>
      {open && (
        <div className="hlthList" role="dialog" aria-label="Сломанные ноды">
          <div className="hlthHead">
            <span>{broken.length ? `Сломанные ноды: ${broken.length}` : 'Сломанных нод нет'}{checking ? ` · проверка ${checked}/${total}` : ''}{unknown ? ` · не проверено ${unknown}` : ''}</span>
            <button type="button" className="hlthBtn" onClick={recheck} disabled={checking}>Проверить снова</button>
          </div>
          {broken.map(b => (
            <button key={b.id} type="button" className="hlthRow" onClick={() => { onFocus?.(b.id); setOpen(false) }} title="Показать ноду на холсте">
              <span className="hlthSeq">#{b.seq}</span>
              <span className="hlthType">{TYPE_SHORT[b.type] ?? b.type}</span>
              <span className="hlthReason">{b.reasons.join('; ')}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
