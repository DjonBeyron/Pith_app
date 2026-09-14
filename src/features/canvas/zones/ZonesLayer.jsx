import ZoneBox from './ZoneBox.jsx'

// Слой всех зон урока — рисуется В МИРОВЫХ координатах, тем же transform, что
// и ноды (worldTransform из CanvasBoard.jsx), но раньше их в разметке: слой
// нод стоит следом и перекрывает зоны сверху (см. z-index в zones.css) — по
// требованию зона рисуется ЗА нодами, а не поверх них.
//
// draft — черновик зоны, которую сейчас тянут инструментом «Зона» (см.
// useZoneToolIntegration.js): показывается тем же пунктиром, но без подписи
// и ручек — это ещё не сохранённая зона.
export default function ZonesLayer({ zones, draft, worldTransform, scaleRef, scale, onChange, onLabelChange, onDelete }) {
  if (!zones.length && !draft) return null
  return (
    <div className="canvasZonesLayer" style={{ transform: worldTransform, transformOrigin: '0 0' }}>
      {zones.map(zone => (
        <ZoneBox
          key={zone.id}
          zone={zone}
          scaleRef={scaleRef}
          scale={scale}
          onChange={onChange}
          onLabelChange={onLabelChange}
          onDelete={onDelete}
        />
      ))}
      {draft && (
        <div
          className="canvasZoneDraft"
          style={{
            left: Math.min(draft.x0, draft.x1),
            top: Math.min(draft.y0, draft.y1),
            width: Math.abs(draft.x1 - draft.x0),
            height: Math.abs(draft.y1 - draft.y0),
          }}
        />
      )}
    </div>
  )
}
