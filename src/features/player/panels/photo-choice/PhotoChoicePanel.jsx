import { useState, useEffect, useRef } from 'react'

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

function GalleryTile({ ph, index, lessonFiles, onClick }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (ph.photoUrl) { setSrc(ph.photoUrl); return }
    if (ph.fileId) {
      const f = lessonFiles.find(lf => lf.id === ph.fileId)
      if (f?.blobUrl) { setSrc(f.blobUrl); return }
      if (f?.r2Url)   { setSrc(f.r2Url);   return }
      if (f?.localFile) {
        const u = URL.createObjectURL(f.localFile)
        setSrc(u)
        return () => URL.revokeObjectURL(u)
      }
    }
    setSrc(null)
  }, [ph.fileId, ph.photoUrl, lessonFiles])

  return (
    <button
      className="pcGalleryTile"
      style={src ? {} : { background: PHOTO_COLORS[index % PHOTO_COLORS.length] }}
      onClick={onClick}
    >
      {src
        ? <img src={src} className="pcGalleryImg" alt={ph.label} />
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
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => () => onHeightChange?.(0), []) // eslint-disable-line

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
