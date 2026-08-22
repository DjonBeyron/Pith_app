// Кнопка «править эту ноду» рядом с сообщением в чате — только для админа,
// который запустил урок из канваса. Держится в углу поверх сообщения и
// проявляется при наведении (на самой панели ответов — видна всегда, там
// наводить не на что): игровые клики по пузырю она не перехватывает.
export default function NodeEditPencil({ onClick, active = false, variant = 'msg', bottom }) {
  return (
    <button
      className={`nodeEditPencil nodeEditPencil--${variant}${active ? ' nodeEditPencilOn' : ''}`}
      style={variant === 'panel' && bottom != null ? { bottom: bottom + 10 } : undefined}
      title="Править ноду в правой панели"
      onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
      onClick={e => { e.stopPropagation(); onClick() }}
    >✎</button>
  )
}
