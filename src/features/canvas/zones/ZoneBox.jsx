import { useState } from 'react'
import { useZoneDrag } from './useZoneDrag.js'
import { zoneColorVars, DEFAULT_ZONE_COLOR, ZONE_COLOR_PRESETS } from './zoneOps.js'

// Одна зона на холсте: сама рамка (едва видная, чисто визуальная — пропускает
// клики мимо себя, см. zones.css) + полоска подписи над ней (двигает зону,
// текст правится прямо в поле) + восемь ручек растяжки по сторонам/углам.
//
// Полоска и ручки — единственное, что реально ловит мышь (pointer-events:auto
// в CSS): сама зона нужна только как фон-подсказка «эти ноды одной группы» и
// не должна мешать ни рамке выделения нод под собой, ни протяжке самих нод.
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

// Подпись зоны должна оставаться читаемой издалека: при отдалении (scale < 1)
// холст ужимает её вместе со всем миром через worldTransform на слое — здесь
// компенсируем это обратным масштабом, чтобы на экране подпись росла, а не
// таяла. При приближении (scale >= 1) не трогаем — там читаемости и так
// достаточно, лишний рост подписи только мешал бы.
const LABEL_BASE_PX = 15
const LABEL_MAX_PX = 40

function labelFontSize(scale) {
  if (!scale || scale >= 1) return LABEL_BASE_PX
  return Math.min(LABEL_MAX_PX, LABEL_BASE_PX / scale)
}

export default function ZoneBox({ zone, scaleRef, scale, onChange, onLabelChange, onDelete }) {
  const startDrag = useZoneDrag({ scaleRef, onChange })
  const fontSize = labelFontSize(scale)
  const color = zone.color ?? DEFAULT_ZONE_COLOR
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div
      className="canvasZone"
      style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height, ...zoneColorVars(color) }}
    >
      <div
        className="canvasZoneLabelBar"
        style={{ fontSize }}
        onMouseDown={e => startDrag(zone, e, 'move')}
      >
        <button
          className="canvasZoneColorDot"
          style={{ background: color }}
          title="Цвет зоны"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setPickerOpen(v => !v)}
        />
        {pickerOpen && (
          <div className="canvasZoneColorPicker" onMouseDown={e => e.stopPropagation()}>
            {ZONE_COLOR_PRESETS.map(preset => (
              <button
                key={preset}
                className="canvasZoneColorSwatch"
                style={{ background: preset }}
                onClick={() => { onChange(zone.id, { color: preset }); setPickerOpen(false) }}
              />
            ))}
          </div>
        )}
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
