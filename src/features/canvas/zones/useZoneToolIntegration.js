import { useZoneDraw } from './useZoneDraw.js'

// Всё, что CanvasBoard.jsx нужно про зоны, одним хуком: инструмент рисования
// (см. useZoneDraw.js) + CRUD над уже существующими зонами. Собрано в одном
// месте, а не раскидано по CanvasBoard.jsx одно-строчными функциями — тот
// файл и так у потолка размера, а вся эта логика самодостаточна (нужен
// только setZones).
//
// Пока инструмент активен, левая кнопка по пустому месту холста рисует новую
// зону вместо рамки выделения marquee (см. вызовы try*ZoneDraw в CanvasBoard).
// После успешного рисования зоны инструмент сам выключается — рисовать зону
// за зоной без повторного нажатия кнопки не нужно, это разовое действие.
export function useZoneToolIntegration({ zoneToolActive, toWorld, setZones, onZoneToolDone }) {
  const { zoneDraft, startZoneDraw, updateZoneDraw, endZoneDraw } = useZoneDraw()

  function tryStartZoneDraw(e) {
    if (!zoneToolActive) return false
    startZoneDraw(e, toWorld)
    return true
  }

  function tryUpdateZoneDraw(e) {
    return updateZoneDraw(e, toWorld)
  }

  function tryEndZoneDraw() {
    return endZoneDraw(zone => {
      setZones(prev => [...prev, zone])
      onZoneToolDone?.()
    })
  }

  const updateZoneRect  = (id, patch) => setZones(zs => zs.map(z => z.id === id ? { ...z, ...patch } : z))
  const updateZoneLabel = (id, label) => setZones(zs => zs.map(z => z.id === id ? { ...z, label } : z))
  const deleteZone       = id => setZones(zs => zs.filter(z => z.id !== id))

  return {
    zoneDraft, tryStartZoneDraw, tryUpdateZoneDraw, tryEndZoneDraw,
    updateZoneRect, updateZoneLabel, deleteZone,
  }
}
