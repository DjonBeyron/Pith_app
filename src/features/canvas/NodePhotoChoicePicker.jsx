import { useRef, useState, useLayoutEffect, useEffect } from 'react'
import { getVariantList, syncTriggers, triggersNeedSync } from './nodeVariants.js'
import { generateImage } from '../../shared/lib/imageGenApi.js'

const BASE_PAIR = ['photo_correct', 'photo_wrong']

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

function PhotoThumb({ ph, lessonFiles }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    // Синхронизация превью с файлом/blob-URL — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ph.fileId) { setUrl(ph.photoUrl ?? null); return }
    const f = lessonFiles.find(lf => lf.id === ph.fileId)
    if (!f) { setUrl(null); return }
    if (f.r2Url) { setUrl(f.r2Url); return }
    if (f.localFile) {
      const u = URL.createObjectURL(f.localFile)
      setUrl(u)
      return () => URL.revokeObjectURL(u)
    }
    setUrl(null)
  }, [ph.fileId, ph.photoUrl, lessonFiles])
  if (!url) return null
  return <img src={url} className="nodePcThumb" alt="" />
}

export default function NodePhotoChoicePicker({
  photos = [], correctIndexes = [],
  lessonFiles = [], onPickFile, onRemoveFile,
  onPhotosChange, onCorrectIndexesChange,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
}) {
  const labelInputRef = useRef(null)
  const rowRefs = useRef(new Map())
  const [labelText, setLabelText] = useState('')
  const [variantOpenIds, setVariantOpenIds] = useState(() => new Set())
  // id фото → 'loading' | 'error' — генерация по промпту, см. generatePhoto
  const [genStatus, setGenStatus] = useState({})
  // Раскрытое поле промпта (как у NodeImageGen.jsx — первый клик показывает
  // поле, второй генерирует), но своё на каждую строку варианта
  const [genOpenIds, setGenOpenIds] = useState(() => new Set())

  const variantList = getVariantList('photo_choice', { photos })

  useEffect(() => {
    if (triggersNeedSync(BASE_PAIR, variantList, triggers)) {
      onTriggersChange(syncTriggers(BASE_PAIR, variantList, triggers))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantList.map(v => v.id).join(','), triggers.map(t => t.if).join(',')])

  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const keys = [...BASE_PAIR, ...variantList.map(v => v.id)]
    const offsets = keys.map(k => {
      const el = rowRefs.current.get(k)
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  function toggleVariantOpen(id) {
    setVariantOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGenOpen(id) {
    setGenOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setPhotoPrompt(idx, imagePrompt) {
    onPhotosChange(photos.map((p, j) => (j === idx ? { ...p, imagePrompt } : p)))
  }

  function variantThen(id) {
    return triggers.find(t => t.if === id)?.then ?? ''
  }

  function setVariantThen(id, then) {
    onTriggersChange(triggers.map(t => (t.if === id ? { ...t, then: then || null } : t)))
  }

  function addPhoto() {
    const label = labelText.trim() || `Фото ${photos.length + 1}`
    onPhotosChange([...photos, { id: crypto.randomUUID(), label, photoUrl: null }])
    setLabelText('')
    labelInputRef.current?.focus({ preventScroll: true })
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
    if (!file || !onPickFile) return
    const fileId = onPickFile(file)
    onPhotosChange(photos.map((p, j) => j === idx ? { ...p, fileId, photoUrl: null } : p))
  }

  // Генерирует картинку по промпту варианта — та же кнопка «Сгенерировать»,
  // что у audio/photo-нод (NodeImageGen.jsx), только по одной на каждую строку
  // варианта, со своим статусом и своим раскрывающимся полем (genOpenIds).
  // Промпт — imagePrompt, а не label: label видит ученик (обычно сама фраза
  // на проверку, «She tries yoga»), imagePrompt — отдельное описание сцены
  // для генерации. Пока imagePrompt не задан явно, используем label как
  // разумный дефолт (короткие подписи часто и так годятся описанием).
  function promptFor(ph) {
    return (ph.imagePrompt ?? ph.label ?? '').trim()
  }

  async function generatePhoto(idx) {
    const ph = photos[idx]
    const prompt = promptFor(ph)
    if (!prompt || genStatus[ph.id] === 'loading') return
    setGenStatus(s => ({ ...s, [ph.id]: 'loading' }))
    try {
      const file = await generateImage(prompt)
      const fileId = onPickFile(file)
      onPhotosChange(photos.map((p, j) => j === idx ? { ...p, fileId, photoUrl: null } : p))
      if (ph.fileId) onRemoveFile?.(ph.fileId)
      setGenStatus(s => ({ ...s, [ph.id]: undefined }))
    } catch (e) {
      console.error('[NodePhotoChoicePicker] generate failed', e)
      setGenStatus(s => ({ ...s, [ph.id]: 'error' }))
    }
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
            <div key={ph.id} ref={el => rowRefs.current.set(ph.id, el)}>
              <div className={`nodePcItem ${correctIndexes.includes(i) ? 'nodePcItemCorrect' : ''}`}>
                <label className="nodePcThumbWrap" title="Загрузить фото" onClick={e => e.stopPropagation()}>
                  {(ph.fileId || ph.photoUrl)
                    ? <PhotoThumb ph={ph} lessonFiles={lessonFiles} />
                    : <div className="nodePcSwatch" style={{ background: PHOTO_COLORS[i % PHOTO_COLORS.length] }}>{i + 1}</div>
                  }
                  <input type="file" accept="image/*" className="nodePcFileInput"
                    onChange={e => { uploadPhoto(i, e.target.files[0]); e.target.value = '' }} />
                </label>
                <button
                  type="button"
                  className={`nodePcGenBtn${genStatus[ph.id] === 'error' ? ' nodePcGenBtnError' : ''}`}
                  onClick={() => (genOpenIds.has(ph.id) ? generatePhoto(i) : toggleGenOpen(ph.id))}
                  disabled={genStatus[ph.id] === 'loading' || (genOpenIds.has(ph.id) && !promptFor(ph))}
                  title={genStatus[ph.id] === 'error' ? 'Не удалось сгенерировать — попробовать ещё раз'
                    : genOpenIds.has(ph.id) ? 'Сгенерировать по промпту ниже' : 'Показать поле промпта'}
                >{genStatus[ph.id] === 'loading' ? '●' : '🎨'}</button>
                <span className="nodePcLabel">{ph.label}</span>
                <button
                  className={`nodeWcCorrectBtn ${correctIndexes.includes(i) ? 'nodeWcCorrectBtnOn' : ''}`}
                  onClick={() => toggleCorrect(i)}
                  title={correctIndexes.includes(i) ? 'Снять' : 'Верный'}
                >✓</button>
                <button
                  className={`nodeWcGearBtn${variantThen(ph.id) ? ' nodeWcGearBtnOn' : ''}`}
                  onClick={() => toggleVariantOpen(ph.id)}
                  title="Особый переход для этого фото (замещает верно/неверно)"
                >{variantOpenIds.has(ph.id) ? '▾' : '▸'}</button>
                <button className="nodePcDel" onClick={() => removePhoto(i)}>×</button>
              </div>
              {genOpenIds.has(ph.id) && (
                <div className="nodePcPromptRow">
                  <textarea
                    className="nodePcPromptInput"
                    value={ph.imagePrompt ?? ph.label ?? ''}
                    onChange={e => setPhotoPrompt(i, e.target.value)}
                    placeholder="Промпт для генерации этого фото (сцена, объекты, свет, ракурс)…"
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                  />
                </div>
              )}
              {variantOpenIds.has(ph.id) && (
                <div className="nodeWcTriggerRow nodeWcVariantRow">
                  <span className="nodeWcTriggerLabel">↳ Особый переход →</span>
                  <select
                    className="nodeWcTriggerSelect"
                    value={variantThen(ph.id)}
                    onChange={e => setVariantThen(ph.id, e.target.value)}
                    onClick={e => e.stopPropagation()}
                  >
                    <option value="">— как верно/неверно —</option>
                    {otherNodes.map(n => (
                      <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="nodeWcTriggerWrap">
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('photo_correct', el)}>
          <span className="nodeWcTriggerLabel nodeWcTriggerLabelOk">✓ Верно →</span>
          <select className="nodeWcTriggerSelect" value={correctThen}
            onChange={e => setTrigger('photo_correct', e.target.value)}
            onClick={e => e.stopPropagation()}>
            <option value="">—</option>
            {otherNodes.map(n => <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>)}
          </select>
        </div>
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('photo_wrong', el)}>
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
