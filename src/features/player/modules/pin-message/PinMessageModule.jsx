export default function PinMessageModule({ teacherName }) {
  const name = teacherName || 'Учитель'
  return (
    <div className="pinSystemRow">
      <span className="pinSystemText">{name} закрепил сообщение</span>
    </div>
  )
}
