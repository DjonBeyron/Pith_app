import { useEffect, useRef } from 'react'
import { playSound } from '../../../../shared/lib/sounds.js'
import { MSG_SOUND_AT } from '../../PlayerFeed.jsx'

export default function PinMessageModule({ teacherName, onDone }) {
  const rowRef = useRef(null)

  useEffect(() => {
    // Модуль монтируется дважды: обычным сообщением и пред-рендером за экраном
    // ([data-pending], см. PlayerFeed). У пред-рендера звука быть не должно —
    // в логе pin-message честно играл двумя копиями подряд
    const pending = rowRef.current?.closest('[data-pending]')
    // Звук — вместе с приходом строки, а не в момент монтирования: строка ещё
    // 240мс летит снизу. Тот же момент, что и у message-in обычных сообщений
    const t = pending ? null : setTimeout(() => playSound('pin-message'), MSG_SOUND_AT)
    onDone?.()
    return () => { if (t) clearTimeout(t) }
  }, []) // eslint-disable-line

  const name = teacherName || 'Учитель'
  return (
    <div className="playerMsgRow pinSystemRow" ref={rowRef}>
      <span className="pinSystemText">{name} закрепил сообщение</span>
    </div>
  )
}
