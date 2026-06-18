import { useRef, useState, useLayoutEffect, useEffect } from 'react'

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

export default function NodePhotoChoicePicker({
  photos = [], correctIndexes = [],
  responseCorrect = '', responseWrong = '',
  onPhotosChange, onCorrectIndexesChange,
  onResponseCorrectChange, onResponseWrongChange,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
}) {
  const labelInputRef = useRef(null)
  const correctRowRef = useRef(null)
  const wrongRowRef   = useRef(null)
  const [labelText, setLabelText] = useState('')

  useEffect(() => {
    const hasCorrect = triggers.some(t => t.if === 'photo_correct')
    const hasWrong   = triggers.some(t => t.if === 'photo_wrong')
    if (!hasCorrect || !hasWrong) {
      onTriggersChange([
        { id: triggers[0]?.id ?? crypto.randomUUID(), if: 'photo_correct', then: triggers[0]?.then ?? null },
        { id: triggers[1]?.id ?? crypto.randomUUID(), if: 'photo_wrong',   then: triggers[1]?.then ?? null },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = [correctRowRef, wrongRowRef].map(r => {
      const el = r.current
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  function addPhoto() {
    const label = labelText.trim() || `Фото ${photos.length + 1}`
    onPhotosChange([...photos, { id: crypto.randomUUID(), label, photoUrl: null }])
    setLabelText('')
    labelInputRef.current?.focus()
  }

  function removePhoto(idx) {
    const next = photos.filter((_, i) => i !== idx)
    const newCI = correctIndexes.filter(i => i !== idx).map(i => i > idx ? i - 1 : i)
    onPhotosChange(next)
    onCorrectIndexesChange(newCI)
  }

  function toggleCorrect(idx) {
    const next = correctIndexes.includes(idx)
      ? correctIndexes.filter(i => i !== idx)
      : [...correctIndexes, idx]
    onCorrectIndexesChange(next)
  }

  function uploadPhoto(idx, file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      onPhotosChange(photos.map((p, j) => j === idx ? { ...p, photoUrl: ev.target.result } : p))
    }
    reader.readAsDataURL(file)
  }

  const correctThen = (triggers.find(t => t.if === 'photo_correct') ?? triggers[0])?.then ?? ''
  const wrongThen   = (triggers.find(t => t.if === 'photo_wrong')   ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      photo_correct: triggers.find(t => t.if === 'photo_correct') ?? triggers[0],
      photo_wrong:   triggers.find(t => t.if === 'photo_wrong')   ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    onTriggersChange([
      { id: existing.photo_correct?.id ?? crypto.randomUUID(), if: 'photo_correct', then: existing.photo_correct?.then ?? null },
      { id: existing.photo_wrong?.id   ?? crypto.randomUUID(), if: 'photo_wrong',   then: existing.photo_wrong?.then   ?? null },
    ])
  }

  const otherNodes = allNodes.filter(n => n.id !== nodeId)

  return (
    <div className="nodePcWrap" onClick={e => e.stopPropagation()}>
      <div className="nodeWcAddRow">
        <input
          ref={labelInputRef}
          className="nodeWcInput"
          value={labelText}
          onChange={e => setLabelText(e.target.value)}
          placeholder="Подпись фото..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhoto() } }}
          onClick={e => e.stopPropagation()}
        />
        <button className="nodeWcAddBtn" onClick={addPhoto}>+</button>
      </div>

      {photos.length > 0 && (
        <div className="nodePcList">
          {photos.map((ph, i) => (
            <div key={ph.id} className={`nodePcItem ${correctIndexes.includes(i) ? 'nodePcItemCorrect' : ''}`}>
              <label className="nodePcThumbWrap" title="Загрузить фото" onClick={e => e.stopPropagation()}>
                {ph.photoUrl
                  ? <img src={ph.photoUrl} className="nodePcThumb" alt={ph.label} />
                  : <div className="nodePcSwatch" style={{ background: PHOTO_COLORS[i % PHOTO_COLORS.length] }}>{i + 1}</div>
                }
                <input type="file" accept="image/*" className="nodePcFileInput"
                  onChange={e => { uploadPhoto(i, e.target.files[0]); e.target.value = '' }} />
              </label>
              <span className="nodePcLabel">{ph.label}</span>
              <button
                className={`nodeWcCorrectBtn ${correctIndexes.includes(i) ? 'nodeWcCorrectBtnOn' : ''}`}
                onClick={() => toggleCorrect(i)}
                title={correctIndexes.includes(i) ? 'Снять' : 'Верный'}
              >✓</button>
              <button className="nodePcDel" onClick={() => removePhoto(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="nodeWcResponseWrap">
        <div className="nodeWcResponseRow">
          <span className="nodeWcResponseLabel nodeWcResponseLabelOk">✓</span>
          <input className="nodeWcResponseInput" value={responseCorrect}
            onChange={e => onResponseCorrectChange(e.target.value)}
            placeholder="Текст верного ответа..." onClick={e => e.stopPropagation()} />
        </div>
        <div className="nodeWcResponseRow">
          <span className="nodeWcResponseLabel nodeWcResponseLabelErr">✗</span>
          <input className="nodeWcResponseInput" value={responseWrong}
            onChange={e => onResponseWrongChange(e.target.value)}
            placeholder="Текст неверного ответа..." onClick={e => e.stopPropagation()} />
        </div>
      </div>

      <div className="nodeWcTriggerWrap">
        <div className="nodeWcTriggerRow" ref={correctRowRef}>
          <span className="nodeWcTriggerLabel nodeWcTriggerLabelOk">✓ Верно →</span>
          <select className="nodeWcTriggerSelect" value={correctThen}
            onChange={e => setTrigger('photo_correct', e.target.value)}
            onClick={e => e.stopPropagation()}>
            <option value="">—</option>
            {otherNodes.map(n => <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>)}
          </select>
        </div>
        <div className="nodeWcTriggerRow" ref={wrongRowRef}>
          <span className="nodeWcTriggerLabel nodeWcTriggerLabelErr">✗ Неверно →</span>
          <select className="nodeWcTriggerSelect" value={wrongThen}
            onChange={e => setTrigger('photo_wrong', e.target.value)}
            onClick={e => e.stopPropagation()}>
            <option value="">—</option>
            {otherNodes.map(n => <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
