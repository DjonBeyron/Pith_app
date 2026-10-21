import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { TYPE_SHORT } from '../nodeTypes.js'
import { computeMenuPos } from '../../../shared/lib/menuPosition.js'

// Значок «⚠ N» в шапке канваса и «Разбора» (useLessonHealth.js): ноды, у которых файл потерян, ссылка отдаёт 404/ошибку
// или файл пустой. Клик — список «#seq · тип · название · причина»; клик по строке — телепорт к ноде на холсте (onFocus:
// focusNode / select в разборе). Список — порталом в body с фиксированной позицией под значком (computeMenuPos): шапка
// канваса на узком экране прокручивается по горизонтали (overflow-x: auto) и абсолютный список в ней обрезался.
// Пока идёт проверка — пунктирная метка «файлы 12/40…»; всё цело — ничего не рисует.
export default function BrokenNodesBadge({ health, onFocus }) {
  const [pos, setPos] = useState(null) // null — список закрыт
  useEffect(() => {
    if (!pos) return undefined
    const onDown = e => { if (!e.target.closest?.('.hlthList, .hlthBadge')) setPos(null) }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('touchstart', onDown, true) }
  }, [pos])
  if (!health) return null
  const { broken, unknown, checked, total, checking, recheck } = health
  if (!broken.length && !checking && !unknown) return null
  const toggle = e => setPos(p => (p ? null : computeMenuPos(e.currentTarget.getBoundingClientRect(), { minWidth: 320 })))
  return (
    <>
      <button
        type="button"
        className={`hlthBadge${broken.length ? ' hlthBadge--bad' : checking ? ' hlthBadge--busy' : ' hlthBadge--warn'}`}
        title={broken.length ? `Сломанных нод: ${broken.length} — нажми, список` : checking ? 'Проверяю файлы урока' : `Не удалось проверить ссылок: ${unknown}`}
        onClick={toggle}
      >
        {broken.length ? `⚠ ${broken.length}` : checking ? `файлы ${checked}/${total}…` : `? ${unknown}`}
      </button>
      {pos && createPortal(
        <div className="hlthList" role="dialog" aria-label="Сломанные ноды" style={pos}>
          <div className="hlthHead">
            <span>{broken.length ? `Сломанные ноды: ${broken.length}` : 'Сломанных нод нет'}{checking ? ` · проверка ${checked}/${total}` : ''}{unknown ? ` · не проверено ${unknown}` : ''}</span>
            <button type="button" className="hlthBtn" onClick={recheck} disabled={checking}>Проверить снова</button>
          </div>
          {broken.map(b => (
            <button key={b.id} type="button" className="hlthRow" onClick={() => { onFocus?.(b.id); setPos(null) }} title="Показать ноду на холсте">
              <span className="hlthSeq">#{b.seq}</span>
              <span className="hlthType">{TYPE_SHORT[b.type] ?? b.type}</span>
              <span className="hlthName">{b.label || '—'}</span>
              <span className="hlthReason">{b.reasons.join('; ')}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
