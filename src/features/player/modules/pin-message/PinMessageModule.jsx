import { useEffect } from 'react'

export default function PinMessageModule({ teacherName, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const name = teacherName || 'Учитель'
  return (
    <div className="pinSystemRow">
      <span className="pinSystemText">{name} закрепил сообщение</span>
    </div>
  )
}
