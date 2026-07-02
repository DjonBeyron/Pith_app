import { useState, useEffect, useRef } from 'react'
import { playSound } from '../../../../shared/lib/sounds.js'
import { pLog } from '../../../../shared/lib/debug.js'

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

function GalleryTile({ ph, index, lessonFiles, onClick }) {
  const [src, setSrc] = useState(null)
  const kindRef   = useRef('none')
  const pickTsRef = useRef(0)

  useEffect(() => {
    let url    = null
    let kind   = 'none'
    let revoke = null
    if (ph.fileId) {
      const f = lessonFiles.find(lf => lf.id === ph.fileId)
      if      (f?.blobUrl)   { url = f.blobUrl; kind = 'blob' }
      else if (f?.localFile) { url = URL.createObjectURL(f.localFile); kind = 'local'; revoke = url }
      else if (f?.r2Url)     { url = f.r2Url; kind = 'r2' }
    }
    if (!url && ph.photoUrl) { url = ph.photoUrl; kind = 'photoUrl' }
    // Логируем источник и каждую его смену (например r2 → blob, когда докачался)
    if (kind !== kindRef.current) {
      pLog(`[pc-gallery] #${index + 1} источник: ${kind}${kind === 'r2' ? ' — блоба НЕТ, качаем из сети' : ''}`)
    }
    kindRef.current   = kind
    pickTsRef.current = performance.now()
    setSrc(url)
    return revoke ? () => URL.revokeObjectURL(revoke) : undefined
  }, [ph.fileId, ph.photoUrl, lessonFiles, index])

  return (
    <button
      className="pcGalleryTile"
      style={src ? {} : { background: PHOTO_COLORS[index % PHOTO_COLORS.length] }}
      onClick={onClick}
    >
      {src
        ? <img
            src={src} className="pcGalleryImg" alt={ph.label}
            onLoad={() => pLog(`[pc-gallery] #${index + 1} показана через ${Math.round(performance.now() - pickTsRef.current)}мс (${kindRef.current})`)}
            onError={() => pLog(`[pc-gallery] #${index + 1} ОШИБКА загрузки img (${kindRef.current})`)}
          />
        : <>
            <span className="pcGalleryTileIdx">{index + 1}</span>
            {ph.label && <span className="pcGalleryTileLabel">{ph.label}</span>}
          </>
      }
    </button>
  )
}

export default function PhotoChoicePanel({ node, lessonFiles = [], onPick, onHeightChange }) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [show, setShow]               = useState(false)
  const [panelHeight, setPanelHeight] = useState(0)
  const panelRef = useRef(null)

  const photos         = node.typeData?.photo_choice?.photos         ?? []
  const correctIndexes = node.typeData?.photo_choice?.correctIndexes ?? []

  useEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelHeight(h)
    onHeightChange?.(h)
  }, []) // eslint-disable-line

  useEffect(() => {
    pLog('[photo-choice] panel mount → sound message-in')
    playSound('message-in')
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => () => onHeightChange?.(0), []) // eslint-disable-line

  // Диагностика в лог плеера: при открытии галереи — сколько фото готово из блобов,
  // а сколько пойдёт из сети (значит, предзагрузка их не успела/не покрыла)
  useEffect(() => {
    if (!galleryOpen) return
    const kinds = photos.map(ph => {
      const f = ph.fileId ? lessonFiles.find(lf => lf.id === ph.fileId) : null
      return f?.blobUrl ? 'blob' : f?.localFile ? 'local' : f?.r2Url ? 'r2' : ph.photoUrl ? 'photoUrl' : 'none'
    })
    const blobs = kinds.filter(k => k === 'blob' || k === 'local').length
    pLog(`[pc-gallery] открыта: ${photos.length} фото, из блобов: ${blobs}, из сети: ${kinds.filter(k => k === 'r2' || k === 'photoUrl').length}`)
    kinds.forEach((k, i) => { if (k !== 'blob' && k !== 'local') pLog(`[pc-gallery] #${i + 1} НЕ предзагружено (${k})`) })
  }, [galleryOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePick(idx) {
    const isCorrect = correctIndexes.includes(idx)
    onPick(idx, isCorrect)
    setGalleryOpen(false)
  }

  return (
    <>
      <div
        className="pcPanelSpacer"
        style={{
          height: show ? panelHeight : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      {galleryOpen && (
        <div className="pcGalleryOverlay" onClick={() => setGalleryOpen(false)}>
          <div className="pcGallery" onClick={e => e.stopPropagation()}>
            <div className="pcGalleryHeader">
              <span className="pcGalleryTitle">Выбери фото</span>
              <button className="pcGalleryClose" onClick={() => setGalleryOpen(false)}>✕</button>
            </div>
            <div className="pcGalleryScroll">
              <div className="pcGalleryGrid">
                {photos.map((ph, i) => (
                  <GalleryTile
                    key={ph.id}
                    ph={ph}
                    index={i}
                    lessonFiles={lessonFiles}
                    onClick={() => handlePick(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        ref={panelRef}
        className={`pcPanel${show ? ' pcPanelVisible' : ''}`}
      >
        <button className="pcAttachBtn" onClick={() => setGalleryOpen(true)}>
          <span className="pcAttachIcon">📎</span>
          <span className="pcAttachLabel">Прикрепи фото</span>
        </button>
      </div>
    </>
  )
}
