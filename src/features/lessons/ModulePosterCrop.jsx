import { useState, useRef } from 'react'

const DEF = { x: 0, y: 0, scale: 1 }

// Кадр мини-постера для списка «Моих уроков» (пропорции превью 56×74):
// драг — панорама, колесо и ± — зум. Влияет ТОЛЬКО на мини-кадр списка,
// постер в ленте и видео не трогает. Сохраняет { x, y, scale } (x/y — %).
export default function ModulePosterCrop({ posterUrl, crop, onSave }) {
  const [c, setC] = useState(crop ?? DEF)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const boxRef = useRef(null)
  const dragRef = useRef(null)

  function move(patch) {
    setC(prev => ({ ...prev, ...patch }))
    setDirty(true)
  }

  function zoom(delta) {
    move({ scale: Math.min(3, Math.max(1, +((c.scale ?? 1) + delta).toFixed(2))) })
  }

  function onPointerDown(e) {
    e.preventDefault()
    dragRef.current = { sx: e.clientX, sy: e.clientY, bx: c.x ?? 0, by: c.y ?? 0 }
    const onMove = ev => {
      const d = dragRef.current
      const box = boxRef.current?.getBoundingClientRect()
      if (!d || !box) return
      move({
        x: +(d.bx + ((ev.clientX - d.sx) / box.width) * 100).toFixed(1),
        y: +(d.by + ((ev.clientY - d.sy) / box.height) * 100).toFixed(1),
      })
    }
    const onUp = () => window.removeEventListener('pointermove', onMove)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(c)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mpcWrap">
      <div className="mvTitle">Кадр в списке «Моих уроков»</div>
      <div
        ref={boxRef}
        className="mpcBox"
        onPointerDown={onPointerDown}
        onWheel={e => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.1 : -0.1) }}>
        <img
          src={posterUrl}
          alt=""
          draggable={false}
          style={{ transform: `translate(${c.x ?? 0}%, ${c.y ?? 0}%) scale(${c.scale ?? 1})` }}
        />
      </div>
      <div className="mpcBtns">
        <button className="mvAction" onClick={() => zoom(-0.1)}>−</button>
        <button className="mvAction" onClick={() => zoom(0.1)}>+</button>
        <button className="mvAction" onClick={() => { setC(DEF); setDirty(true) }}>⟲</button>
        <button className="mvAction mpcSave" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? '...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
