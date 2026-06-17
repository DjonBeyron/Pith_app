import { useLayoutEffect, useRef } from 'react'

const IF_OPTIONS = [
  { value: 'played',           label: 'Воспроизведено до конца' },
  { value: 'timer',            label: 'Таймер (сек)' },
  { value: 'timer_after_play', label: 'Пауза после воспроизведения' },
  { value: 'photo_shown',      label: 'Фото появилось на экране' },
]

function newTrigger() {
  return { if: 'played', then: null }
}

export default function NodeTriggerEditor({ triggers, nodeId, nodes, onChange, onMeasure }) {
  const thenRefs = useRef([])

  // After every render, measure the y-center of each "Тогда" line relative to
  // .canvasNodeWrapper (which is the nearest positioned ancestor / offsetParent).
  // offsetTop is in layout pixels == world coordinates, no scale correction needed.
  useLayoutEffect(() => {
    if (!onMeasure) return
    const offsets = triggers.map((_, i) => {
      const el = thenRefs.current[i]
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onMeasure(offsets)
  })

  function add(e) {
    e.stopPropagation()
    onChange([...triggers, newTrigger()])
  }

  function remove(e, i) {
    e.stopPropagation()
    onChange(triggers.filter((_, j) => j !== i))
  }

  function patch(i, diff) {
    onChange(triggers.map((t, j) => j === i ? { ...t, ...diff } : t))
  }

  return (
    <div className="nodeTriggers">
      {triggers.map((t, i) => (
        <div key={i} className="nodeTriggerRow">
          <div className="nodeTriggerLine">
            <span className="nodeTriggerKw">Если</span>
            <select
              className="nodeTriggerSel"
              value={t.if}
              onClick={e => e.stopPropagation()}
              onChange={e => patch(i, { if: e.target.value })}
            >
              {IF_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {(t.if === 'timer' || t.if === 'timer_after_play') && (
              <input
                className="nodeTriggerMsInput"
                type="number"
                min="0"
                step="1"
                value={Math.round((t.ms ?? 3000) / 1000)}
                onClick={e => e.stopPropagation()}
                onChange={e => patch(i, { ms: Number(e.target.value) * 1000 })}
              />
            )}
          </div>
          <div
            className="nodeTriggerLine"
            ref={el => { thenRefs.current[i] = el }}
          >
            <span className="nodeTriggerKw">Тогда</span>
            <select
              className="nodeTriggerSel"
              value={t.then ?? ''}
              onClick={e => e.stopPropagation()}
              onChange={e => patch(i, { then: e.target.value || null })}
            >
              <option value="">— не задано —</option>
              {nodes.map(n => (
                <option key={n.id} value={n.id} disabled={n.id === nodeId}>
                  Нода #{n.seq}{n.id === nodeId ? ' (эта нода)' : ''}
                </option>
              ))}
            </select>
            <button className="nodeTriggerDel" onClick={e => remove(e, i)}>×</button>
          </div>
        </div>
      ))}
      <button className="nodeTriggerAdd" onClick={add}>+ Триггер</button>
    </div>
  )
}
