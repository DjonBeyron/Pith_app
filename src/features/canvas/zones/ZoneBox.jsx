import { useZoneDrag } from './useZoneDrag.js'

// Одна зона на холсте: сама рамка (едва видная, чисто визуальная — пропускает
// клики мимо себя, см. zones.css) + полоска подписи над ней (двигает зону,
// текст правится прямо в поле) + восемь ручек растяжки по сторонам/углам.
//
// Полоска и ручки — единственное, что реально ловит мышь (pointer-events:auto
// в CSS): сама зона нужна только как фон-подсказка «эти ноды одной группы» и
// не должна мешать ни рамке выделения нод под собой, ни протяжке самих нод.
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export default function ZoneBox({ zone, scaleRef, onChange, onLabelChange, onDelete }) {
  const startDrag = useZoneDrag({ scaleRef, onChange })

  return (
    <div
      className="canvasZone"
      style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height }}
    >
      <div className="canvasZoneLabelBar" onMouseDown={e => startDrag(zone, e, 'move')}>
        <input
          className="canvasZoneLabelInput"
          value={zone.label ?? ''}
          placeholder="Название зоны…"
          onMouseDown={e => e.stopPropagation()}
          onChange={e => onLabelChange(zone.id, e.target.value)}
        />
        <button
          className="canvasZoneDelete"
          title="Удалить зону"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onDelete(zone.id)}
        >×</button>
      </div>
      {DIRS.map(dir => (
        <span
          key={dir}
          className={`canvasZoneGrip canvasZoneGrip-${dir}`}
          onMouseDown={e => startDrag(zone, e, dir)}
        />
      ))}
    </div>
  )
}
