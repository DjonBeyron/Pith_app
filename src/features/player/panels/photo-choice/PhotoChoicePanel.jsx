import { useState } from 'react'

const PHOTO_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#a855f7',
]

export default function PhotoChoicePanel({ node, onPick }) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const photos         = node.typeData?.photo_choice?.photos         ?? []
  const correctIndexes = node.typeData?.photo_choice?.correctIndexes ?? []

  function handlePick(idx) {
    const isCorrect = correctIndexes.includes(idx)
    onPick(idx, isCorrect)
    setGalleryOpen(false)
  }

  return (
    <>
      {galleryOpen && (
        <div className="pcGalleryOverlay" onClick={() => setGalleryOpen(false)}>
          <div className="pcGallery" onClick={e => e.stopPropagation()}>
            <div className="pcGalleryTitle">Выбери фото</div>
            <div className="pcGalleryGrid">
              {photos.map((ph, i) => (
                <button
                  key={ph.id}
                  className="pcGalleryTile"
                  style={ph.photoUrl ? {} : { background: PHOTO_COLORS[i % PHOTO_COLORS.length] }}
                  onClick={() => handlePick(i)}
                >
                  {ph.photoUrl
                    ? <img src={ph.photoUrl} className="pcGalleryImg" alt={ph.label} />
                    : <>
                        <span className="pcGalleryTileIdx">{i + 1}</span>
                        {ph.label && <span className="pcGalleryTileLabel">{ph.label}</span>}
                      </>
                  }
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="pcPanel">
        <button className="pcAttachBtn" onClick={() => setGalleryOpen(true)}>
          <span className="pcAttachIcon">📎</span>
          <span className="pcAttachLabel">Прикрепи фото</span>
        </button>
      </div>
    </>
  )
}
