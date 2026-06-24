import { useEffect } from 'react'
import { playSound } from '../../../../shared/lib/sounds.js'

export default function PinMessageModule({ teacherName, onDone }) {
  useEffect(() => { playSound('pin-message'); onDone?.() }, []) // eslint-disable-line
  const name = teacherName || 'Учитель'
  return (
    <div className="playerMsgRow pinSystemRow">
      <span className="pinSystemText">{name} закрепил сообщение</span>
    </div>
  )
}
